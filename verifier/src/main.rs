//! Myna verifier service.
//!
//! WebSocket endpoints on one port (default 127.0.0.1:7047):
//! - `/prove?sessionId=..&groupId=..&method=..`  verifier side of MPC-TLS (tlsn session)
//! - `/relay?target=myna.go.jp:443`             raw WebSocket <-> TCP bridge for the prover
//! - `/result?sessionId=..`                     sends one JSON verdict message when ready

use std::{collections::HashMap, sync::Arc, time::Duration};

use anyhow::{anyhow, bail, Context, Result};
use async_tungstenite::{
    tokio::{accept_hdr_async, TokioAdapter},
    tungstenite::{
        handshake::server::{ErrorResponse, Request, Response},
        http::StatusCode,
        Message,
    },
    WebSocketStream,
};
use serde::Serialize;
use serde_json::Value;
use tlsn::{
    config::verifier::VerifierConfig,
    connection::ServerName,
    verifier::{VerifierCommitStart, VerifierOutput},
    webpki::RootCertStore,
    Session,
};
use tokio::{
    net::{TcpListener, TcpStream},
    sync::{watch, Mutex},
};
use tokio_util::compat::FuturesAsyncReadCompatExt;
use tracing::{error, info, warn};
use ws_stream_tungstenite::WsStream;

use myna_verifier::{audit, disclosure, eligibility, myna};

type Ws = WebSocketStream<TokioAdapter<TcpStream>>;

#[derive(Clone)]
struct Config {
    listen: String,
    web_url: String,
    secret: String,
    max_sent_data: usize,
    max_recv_data: usize,
    audit_dir: std::path::PathBuf,
}

impl Config {
    fn from_env() -> Self {
        let var = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
        Self {
            listen: var("VERIFIER_LISTEN", "127.0.0.1:7047"),
            web_url: var("WEB_URL", "http://localhost:3000"),
            secret: var("VERIFIER_SHARED_SECRET", ""),
            max_sent_data: var("MAX_SENT_DATA", "4096").parse().expect("MAX_SENT_DATA"),
            max_recv_data: var("MAX_RECV_DATA", "32768").parse().expect("MAX_RECV_DATA"),
            audit_dir: var("AUDIT_DIR", "audit").into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Outcome {
    session_id: String,
    group_id: String,
    method: String,
    passed: bool,
    evidence: Value,
    myna_nullifier: Option<String>,
    verified_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Default)]
struct Results(Mutex<HashMap<String, watch::Sender<Option<Outcome>>>>);

impl Results {
    async fn channel(&self, session_id: &str) -> watch::Sender<Option<Outcome>> {
        let mut map = self.0.lock().await;
        map.entry(session_id.to_string())
            .or_insert_with(|| watch::channel(None).0)
            .clone()
    }
}

struct App {
    cfg: Config,
    /// Server-to-prover bytes captured by the most recent relay (first 16 KiB).
    last_relay: Mutex<Option<Arc<std::sync::Mutex<Vec<u8>>>>>,
    results: Results,
    http: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,yamux=warn,tlsn_mux=warn".into()),
        )
        .init();

    let cfg = Config::from_env();
    if cfg.secret.is_empty() {
        warn!("VERIFIER_SHARED_SECRET is not set; the web app will reject our proof reports");
    }
    let listener = TcpListener::bind(&cfg.listen).await?;
    info!(
        "listening on ws://{} (max_sent={}, max_recv={})",
        cfg.listen, cfg.max_sent_data, cfg.max_recv_data
    );

    let app = Arc::new(App {
        cfg,
        last_relay: Mutex::new(None),
        results: Results::default(),
        http: reqwest::Client::new(),
    });
    loop {
        let (tcp, peer) = listener.accept().await?;
        let app = app.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_conn(app, tcp).await {
                warn!("connection from {peer}: {e:#}");
            }
        });
    }
}

fn reject(status: StatusCode, msg: &str) -> ErrorResponse {
    let mut res = ErrorResponse::new(Some(msg.to_string()));
    *res.status_mut() = status;
    res
}

async fn handle_conn(app: Arc<App>, tcp: TcpStream) -> Result<()> {
    tcp.set_nodelay(true)?;
    let mut target: Option<url::Url> = None;
    let ws = accept_hdr_async(tcp, |req: &Request, res: Response| {
        let url = url::Url::parse(&format!("ws://localhost{}", req.uri()))
            .map_err(|_| reject(StatusCode::BAD_REQUEST, "bad uri"))?;
        match url.path() {
            "/prove" | "/relay" | "/result" => {
                target = Some(url);
                Ok(res)
            }
            _ => Err(reject(StatusCode::NOT_FOUND, "not found")),
        }
    })
    .await?;
    let url = target.expect("set by callback");
    let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
    let get = |k: &str| q.get(k).cloned().unwrap_or_default();

    match url.path() {
        "/relay" => relay(&app, ws, &get("target")).await,
        "/result" => send_result(&app, ws, &get("sessionId")).await,
        "/prove" => {
            let (session_id, group_id, method) = (get("sessionId"), get("groupId"), get("method"));
            if session_id.is_empty() || group_id.is_empty() || method.is_empty() {
                bail!("/prove requires sessionId, groupId and method");
            }
            info!(%session_id, %group_id, %method, "prove session started");
            let started = std::time::Instant::now();
            let mut audit = audit::VerifierAudit::new(&session_id, &group_id, &method, now_rfc3339());
            audit.event("prove session started");
            let result = tokio::time::timeout(
                Duration::from_secs(300),
                prove(&app, ws, &group_id, &method, &mut audit),
            )
            .await
            .unwrap_or_else(|_| Err(anyhow!("timed out")));
            let (passed, evidence, error) = match result {
                Ok(v) => (v.passed, v.evidence, None),
                Err(e) => {
                    error!(%session_id, "verification failed: {e:#}");
                    (false, Value::Null, Some(format!("{e:#}")))
                }
            };
            info!(%session_id, passed, elapsed = ?started.elapsed(), %evidence, "prove session finished");
            let outcome = Outcome {
                session_id: session_id.clone(),
                group_id,
                method,
                passed,
                evidence,
                myna_nullifier: None,
                verified_at: now_rfc3339(),
                error,
            };
            // Only successful verifications are reported to the web app; failures
            // are visible to the extension via /result.
            audit.error = outcome.error.clone();
            audit.outcome = serde_json::to_value(&outcome).ok();
            if outcome.error.is_none() {
                audit.report = Some(report(&app, &outcome).await);
                audit.event("reported to web app");
            }
            match audit.write(&app.cfg.audit_dir) {
                Ok(path) => info!(path = %path.display(), "audit written"),
                Err(e) => warn!("could not write audit: {e}"),
            }
            app.results.channel(&session_id).await.send_replace(Some(outcome));
            Ok(())
        }
        _ => unreachable!(),
    }
}

/// Runs the verifier side of MPC-TLS, checks the server identity and evaluates
/// the revealed data.
async fn prove(
    app: &App,
    ws: Ws,
    group_id: &str,
    method: &str,
    audit: &mut audit::VerifierAudit,
) -> Result<eligibility::Verdict> {
    let cfg = &app.cfg;
    let (expected_path, _) =
        myna::request_for(method).ok_or_else(|| anyhow!("unknown method {method}"))?;

    let session = Session::new(WsStream::new(ws));
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let verifier = handle.new_verifier(
        VerifierConfig::builder().root_store(RootCertStore::mozilla()).build()?,
    )?;

    let verifier = match verifier.commit().await? {
        VerifierCommitStart::Mpc(verifier) => {
            let c = verifier.config();
            info!(max_sent = c.max_sent_data(), max_recv = c.max_recv_data(), "prover MPC config");
            audit.limits = serde_json::json!({
                "proverRequested": { "maxSent": c.max_sent_data(), "maxRecv": c.max_recv_data() },
                "verifierAllows": { "maxSent": cfg.max_sent_data, "maxRecv": cfg.max_recv_data },
            });
            audit.event("MPC config received");
            if c.max_sent_data() > cfg.max_sent_data || c.max_recv_data() > cfg.max_recv_data {
                verifier.reject(Some("max_sent_data/max_recv_data too large")).await?;
                bail!("prover requested limits above ours");
            }
            let verifier = verifier.accept().await?;
            audit.event("MPC accepted, running MPC-TLS with myna.go.jp");
            verifier.run().await?
        }
        VerifierCommitStart::Proxy(verifier) => {
            verifier.reject(Some("only MPC-TLS is accepted")).await?;
            bail!("prover asked for proxy mode");
        }
    };
    info!("TLS session committed, waiting for disclosure");
    audit.event("MPC-TLS finished, TLS session committed");
    record_tls(audit, verifier.tls_transcript());
    if let Some(cap) = app.last_relay.lock().await.as_ref() {
        audit.wire = Some(audit::parse_wire(&cap.lock().unwrap()));
    }

    let verifier = verifier.verify().await?;
    if !verifier.request().server_identity() {
        let verifier = verifier.reject(Some("server identity must be revealed")).await?;
        verifier.close().await?;
        bail!("prover did not reveal the server identity");
    }
    // `accept` checks the certificate chain against the Mozilla roots (webpki), at
    // the handshake time, bound to the server's ephemeral key.
    let (VerifierOutput { server_name, transcript, .. }, verifier) = verifier.accept().await?;
    audit.event("disclosure verified against the committed transcript; certificate chain accepted");
    verifier.close().await?;
    handle.close();
    let _ = driver_task.await;

    let Some(ServerName::Dns(name)) = server_name else { bail!("no server name") };
    if name.as_str() != myna::SERVER_NAME {
        bail!("server name is {}, expected {}", name.as_str(), myna::SERVER_NAME);
    }
    audit.tls.server_name = Some(name.as_str().to_string());
    let transcript = transcript.context("nothing was revealed")?;
    audit.transcript = Some(audit::PartialTranscript {
        sent_len: transcript.len_sent(),
        recv_len: transcript.len_received(),
        sent_authed: audit::ranges(transcript.sent_authed().iter()),
        recv_authed: audit::ranges(transcript.received_authed().iter()),
        sent_b64: audit::b64(transcript.sent_unsafe()),
        recv_b64: audit::b64(transcript.received_unsafe()),
    });
    let revealed = disclosure::to_revealed(&transcript)?;
    audit.disclosed = Some(serde_json::json!({
        "requestPath": revealed.request_path,
        "fields": revealed.fields,
    }));
    info!(path = %revealed.request_path, fields = ?revealed.fields, "revealed");
    if revealed.request_path != expected_path {
        bail!("request path {} does not match method {method}", revealed.request_path);
    }
    audit.criteria = Some(eligibility::explain(group_id, method, &revealed));
    let verdict = eligibility::evaluate(group_id, method, &revealed);
    audit.event(format!("criteria evaluated: passed={}", verdict.passed));
    Ok(verdict)
}

/// Records what the verifier holds about the TLS connection itself.
fn record_tls(audit: &mut audit::VerifierAudit, t: &tlsn::transcript::TlsTranscript) {
    audit.tls.version = Some(format!("{:?}", t.version()));
    audit.tls.connection_time_unix = Some(t.time());
    audit.tls.cert_chain_check = "tlsn verifies the prover-supplied chain with webpki against the Mozilla \
        root store at the handshake time, and the server's signature over the ephemeral key \
        it used in MPC-TLS; the chain as seen on the wire is under `wire.certChain`"
        .into();
    let summarize = |records: &[tlsn::transcript::Record]| audit::Records {
        count: records.len(),
        ciphertext_bytes: records.iter().map(|r| r.ciphertext.len()).sum(),
        with_plaintext: records.iter().filter(|r| r.plaintext.is_some()).count(),
        types: records
            .iter()
            .map(|r| format!("{:?}{}", r.typ, if r.plaintext.is_some() { " (plaintext)" } else { "" }))
            .collect(),
        first_ciphertext_hex: records
            .iter()
            .find(|r| !r.ciphertext.is_empty())
            .map(|r| audit::hex(&r.ciphertext[..r.ciphertext.len().min(32)])),
    };
    audit.tls.sent_records = summarize(t.sent());
    audit.tls.recv_records = summarize(t.recv());
}

async fn report(app: &App, outcome: &Outcome) -> String {
    let url = format!("{}/api/internal/myna-proof", app.cfg.web_url);
    let res = app
        .http
        .post(&url)
        .header("x-verifier-secret", &app.cfg.secret)
        .json(outcome)
        .timeout(Duration::from_secs(10))
        .send()
        .await;
    let msg = match res {
        Ok(r) if r.status().is_success() => format!("reported proof to {url}: {}", r.status()),
        Ok(r) => format!("web app answered {} for {url}", r.status()),
        Err(e) => format!("could not reach web app at {url}: {e}"),
    };
    info!("{msg}");
    msg
}

async fn send_result(app: &App, mut ws: Ws, session_id: &str) -> Result<()> {
    let mut rx = app.results.channel(session_id).await.subscribe();
    let wait = rx.wait_for(|o| o.is_some());
    let outcome = tokio::time::timeout(Duration::from_secs(600), wait)
        .await
        .context("timed out waiting for result")??
        .clone();
    ws.send(Message::text(serde_json::to_string(&outcome)?)).await?;
    ws.close(None).await?;
    Ok(())
}

async fn relay(app: &App, ws: Ws, target: &str) -> Result<()> {
    if target != myna::RELAY_TARGET {
        bail!("relay target {target:?} not allowed");
    }
    let tcp = TcpStream::connect(target).await?;
    tcp.set_nodelay(true)?;
    let capture = Arc::new(std::sync::Mutex::new(Vec::new()));
    *app.last_relay.lock().await = Some(capture.clone());
    let mut tcp = Tap { inner: tcp, capture, limit: 16 * 1024 };
    let mut ws = WsStream::new(ws).compat();
    let (up, down) = tokio::io::copy_bidirectional(&mut ws, &mut tcp).await.unwrap_or((0, 0));
    info!("relay {target} closed (up {up} B, down {down} B)");
    Ok(())
}

fn now_rfc3339() -> String {
    humantime::format_rfc3339_seconds(std::time::SystemTime::now()).to_string()
}

/// Passes a stream through, keeping a copy of the first `limit` bytes read from it.
struct Tap<T> {
    inner: T,
    capture: Arc<std::sync::Mutex<Vec<u8>>>,
    limit: usize,
}

impl<T: tokio::io::AsyncRead + Unpin> tokio::io::AsyncRead for Tap<T> {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let res = std::pin::Pin::new(&mut self.inner).poll_read(cx, buf);
        if res.is_ready() {
            let limit = self.limit;
            let mut cap = self.capture.lock().unwrap();
            let room = limit.saturating_sub(cap.len());
            let new = &buf.filled()[before..];
            cap.extend_from_slice(&new[..new.len().min(room)]);
        }
        res
    }
}

impl<T: tokio::io::AsyncWrite + Unpin> tokio::io::AsyncWrite for Tap<T> {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        data: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.inner).poll_write(cx, data)
    }
    fn poll_flush(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

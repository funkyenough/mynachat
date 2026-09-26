//! Native test prover: runs the same tlsn-sdk-core prover the WASM build uses,
//! against the verifier service and production myna.go.jp (through the relay).
//!
//! Env:
//!   VERIFIER_URL   default ws://localhost:7047
//!   METHOD         default prescription
//!   GROUP_ID       default hayfever
//!   SESSION_ID     default native-<unix time>
//!   MYNA_COOKIE    optional full Cookie header value (SESSION=...; tid=...). Never logged.
//!   MAX_SENT_DATA / MAX_RECV_DATA   default 4096 / 32768
//!   DIRECT=1       connect to myna.go.jp:443 directly instead of via the relay

use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use async_tungstenite::tokio::connect_async;
use futures::StreamExt;
use tlsn_sdk_core::{
    Body, HttpRequest, NetworkSetting, ProverConfig, Reveal, SdkProver,
};
use tokio_util::compat::TokioAsyncReadCompatExt;
use ws_stream_tungstenite::WsStream;

use myna_verifier::{disclosure::json_string_pairs, myna};

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async fn ws(url: &str) -> Result<WsStream<async_tungstenite::tokio::ConnectStream>> {
    let (ws, _) = connect_async(url).await.with_context(|| format!("connect {url}"))?;
    Ok(WsStream::new(ws))
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "warn".into()),
        )
        .init();

    let env = |k: &str, d: &str| std::env::var(k).unwrap_or_else(|_| d.to_string());
    let verifier_url = env("VERIFIER_URL", "ws://localhost:7047");
    let method = env("METHOD", "prescription");
    let group_id = env("GROUP_ID", "hayfever");
    let session_id = env(
        "SESSION_ID",
        &format!("native-{}", std::time::UNIX_EPOCH.elapsed()?.as_secs()),
    );
    let max_sent: usize = env("MAX_SENT_DATA", "4096").parse()?;
    let max_recv: usize = env("MAX_RECV_DATA", "32768").parse()?;
    let cookie = std::env::var("MYNA_COOKIE").ok().filter(|c| !c.is_empty());
    let (path, body) = myna::request_for(&method).ok_or_else(|| anyhow!("unknown method"))?;

    println!(
        "session={session_id} method={method} cookie={} max_sent={max_sent} max_recv={max_recv}",
        if cookie.is_some() { "yes" } else { "no" }
    );
    let t0 = Instant::now();
    let lap = |label: &str| println!("[{:>6.2}s] {label}", t0.elapsed().as_secs_f64());

    let mut prover = SdkProver::new(
        ProverConfig::builder(myna::SERVER_NAME)
            .max_sent_data(max_sent)
            .max_recv_data(max_recv)
            .network(NetworkSetting::Latency)
            .build()?,
    )?;

    let prove_url = format!(
        "{verifier_url}/prove?sessionId={session_id}&groupId={group_id}&method={method}"
    );
    prover.setup(ws(&prove_url).await?).await?;
    lap("MPC setup done");

    let mut req = HttpRequest::post(path)
        .header("host", myna::SERVER_NAME)
        .header("user-agent", USER_AGENT)
        .header("accept", "application/json, text/plain, */*")
        .header("accept-encoding", "identity")
        .header("content-type", "application/json")
        .header("origin", "https://myna.go.jp")
        .header("referer", "https://myna.go.jp/")
        .header("connection", "close")
        // A JSON string body is sent verbatim (exact bytes).
        .body(Body::Json(serde_json::Value::String(body.to_string())));
    if let Some(c) = &cookie {
        req = req.header("cookie", c.as_bytes().to_vec());
    }

    let response = if env("DIRECT", "") == "1" {
        let tcp = tokio::net::TcpStream::connect(myna::RELAY_TARGET).await?;
        prover.send_request_mpc(tcp.compat(), req).await?
    } else {
        let relay = ws(&format!("{verifier_url}/relay?target={}", myna::RELAY_TARGET)).await?;
        prover.send_request_mpc(relay, req).await?
    };
    lap(&format!("response received: HTTP {}", response.status));

    let transcript = prover.transcript()?;
    println!("transcript: sent {} B, recv {} B", transcript.sent.len(), transcript.recv.len());

    // Reveal: request line, response status line, and either one matching drugN
    // pair or (for the unauthenticated test) resultCode/errorCode.
    let line_end = |b: &[u8]| b.windows(2).position(|w| w == b"\r\n").unwrap_or(0);
    let mut reveal = Reveal::new()
        .server_identity(true)
        .sent(0..line_end(&transcript.sent))
        .recv(0..line_end(&transcript.recv));

    let body_start = transcript
        .recv
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|p| p + 4)
        .unwrap_or(0);
    let pairs = json_string_pairs(&transcript.recv[body_start..]);
    let drug_count = pairs.iter().filter(|p| p.key == "drugN").count();
    // Prover-side pre-check against the same catalog the verifier uses.
    let catalog = criteria::Catalog::default_catalog();
    let rx = catalog
        .group(&group_id)
        .and_then(|g| g.methods.get(&criteria::Method::Prescription));
    let matched = pairs
        .iter()
        .find(|p| p.key == "drugN" && rx.is_some_and(|c| criteria::matching_stem(c, &p.value).is_some()));
    println!("found {drug_count} drugN values; match: {}", matched.is_some());
    let to_reveal: Vec<_> = match matched {
        Some(p) => vec![p],
        None => pairs
            .iter()
            .filter(|p| p.key == "resultCode" || p.key == "errorCode")
            .collect(),
    };
    for p in to_reveal {
        let r = body_start + p.range.start..body_start + p.range.end;
        println!("revealing recv {r:?}: {}", String::from_utf8_lossy(&transcript.recv[r.clone()]));
        reveal = reveal.recv(r);
    }

    prover.reveal(reveal, None).await?;
    lap("revealed & finalized");

    // Ask the verifier for its verdict.
    let (mut result_ws, _) =
        connect_async(format!("{verifier_url}/result?sessionId={session_id}")).await?;
    if let Some(msg) = result_ws.next().await {
        println!("verifier result: {}", msg?.into_text()?);
    }
    lap("done");
    Ok(())
}

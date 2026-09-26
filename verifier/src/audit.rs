//! Per-session audit record: everything the verifier saw and decided.
//!
//! Written to `$AUDIT_DIR/<sessionId>.json` (default `audit/`, git-ignored).
//! It never contains more than the verifier itself received: hidden transcript
//! bytes are zero in the partial transcript and TLS records carry no plaintext.

use std::{path::Path, time::Instant};

use base64::Engine;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub t_ms: u128,
    pub event: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cert {
    pub subject: String,
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    pub sha256: String,
    pub der_len: usize,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Records {
    pub count: usize,
    pub ciphertext_bytes: usize,
    /// Records the verifier holds plaintext for. Only handshake Finished messages,
    /// which both parties compute jointly; application data stays encrypted.
    pub with_plaintext: usize,
    pub types: Vec<String>,
    /// First bytes of the first application-data record, as the verifier saw them.
    pub first_ciphertext_hex: Option<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tls {
    pub server_name: Option<String>,
    pub version: Option<String>,
    pub connection_time_unix: Option<u64>,
    pub cert_chain_check: String,
    pub sent_records: Records,
    pub recv_records: Records,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialTranscript {
    pub sent_len: usize,
    pub recv_len: usize,
    pub sent_authed: Vec<[usize; 2]>,
    pub recv_authed: Vec<[usize; 2]>,
    /// The verifier's copy of the transcript; bytes outside the authed ranges are zero.
    pub sent_b64: String,
    pub recv_b64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifierAudit {
    pub session_id: String,
    pub group_id: String,
    pub method: String,
    pub started_at: String,
    pub limits: Value,
    pub timeline: Vec<Event>,
    pub tls: Tls,
    pub wire: Option<Wire>,
    pub transcript: Option<PartialTranscript>,
    pub disclosed: Option<Value>,
    pub criteria: Option<Value>,
    pub outcome: Option<Value>,
    pub report: Option<String>,
    pub error: Option<String>,
    #[serde(skip)]
    clock: Option<Instant>,
}

impl VerifierAudit {
    pub fn new(session_id: &str, group_id: &str, method: &str, started_at: String) -> Self {
        Self {
            session_id: session_id.into(),
            group_id: group_id.into(),
            method: method.into(),
            started_at,
            limits: Value::Null,
            timeline: Vec::new(),
            tls: Tls::default(),
            wire: None,
            transcript: None,
            disclosed: None,
            criteria: None,
            outcome: None,
            report: None,
            error: None,
            clock: Some(Instant::now()),
        }
    }

    pub fn event(&mut self, event: impl Into<String>) {
        let t_ms = self.clock.map(|c| c.elapsed().as_millis()).unwrap_or(0);
        self.timeline.push(Event { t_ms, event: event.into() });
    }

    pub fn write(&self, dir: &Path) -> std::io::Result<std::path::PathBuf> {
        std::fs::create_dir_all(dir)?;
        let safe: String = self
            .session_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let path = dir.join(format!("{safe}.json"));
        std::fs::write(&path, serde_json::to_vec_pretty(self)?)?;
        Ok(path)
    }
}

pub fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn ranges<'a>(r: impl IntoIterator<Item = std::ops::Range<usize>>) -> Vec<[usize; 2]> {
    r.into_iter().map(|r| [r.start, r.end]).collect()
}

pub fn cert(der: &[u8]) -> Cert {
    use sha2::Digest;
    let sha256 = hex(&sha2::Sha256::digest(der));
    match x509_parser::parse_x509_certificate(der) {
        Ok((_, c)) => Cert {
            subject: c.subject().to_string(),
            issuer: c.issuer().to_string(),
            not_before: c.validity().not_before.to_string(),
            not_after: c.validity().not_after.to_string(),
            sha256,
            der_len: der.len(),
        },
        Err(e) => Cert {
            subject: format!("<unparsed: {e}>"),
            issuer: String::new(),
            not_before: String::new(),
            not_after: String::new(),
            sha256,
            der_len: der.len(),
        },
    }
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// What the relay saw of the server's first flight. In TLS 1.2 the ServerHello
/// and Certificate messages cross the relay unencrypted.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wire {
    pub captured_bytes: usize,
    pub record_types: Vec<String>,
    pub server_hello_version: Option<String>,
    pub cipher_suite: Option<String>,
    pub cert_chain: Vec<Cert>,
}

/// Parses plaintext TLS 1.2 handshake records from the start of the server stream.
pub fn parse_wire(buf: &[u8]) -> Wire {
    let mut wire = Wire { captured_bytes: buf.len(), ..Default::default() };
    let mut hs = Vec::new();
    let mut i = 0;
    while i + 5 <= buf.len() {
        let (typ, len) = (buf[i], u16::from_be_bytes([buf[i + 3], buf[i + 4]]) as usize);
        let name = match typ {
            20 => "change_cipher_spec",
            21 => "alert",
            22 => "handshake",
            23 => "application_data",
            _ => "other",
        };
        wire.record_types.push(name.into());
        if i + 5 + len > buf.len() || typ == 20 {
            break; // everything after ChangeCipherSpec is encrypted
        }
        if typ == 22 {
            hs.extend_from_slice(&buf[i + 5..i + 5 + len]);
        }
        i += 5 + len;
    }
    let mut j = 0;
    while j + 4 <= hs.len() {
        let (typ, len) = (hs[j], u32::from_be_bytes([0, hs[j + 1], hs[j + 2], hs[j + 3]]) as usize);
        let Some(body) = hs.get(j + 4..j + 4 + len) else { break };
        match typ {
            2 if body.len() >= 35 => {
                let sid = body[34] as usize;
                wire.server_hello_version = Some(format!("{:02x}{:02x}", body[0], body[1]));
                if let Some(cs) = body.get(35 + sid..37 + sid) {
                    wire.cipher_suite = Some(match (cs[0], cs[1]) {
                        (0xc0, 0x2f) => "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256".into(),
                        (0xc0, 0x30) => "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384".into(),
                        (0xc0, 0x2b) => "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256".into(),
                        (a, b) => format!("0x{a:02x}{b:02x}"),
                    });
                }
            }
            11 if body.len() >= 3 => {
                let mut k = 3;
                while k + 3 <= body.len() {
                    let n = u32::from_be_bytes([0, body[k], body[k + 1], body[k + 2]]) as usize;
                    let Some(der) = body.get(k + 3..k + 3 + n) else { break };
                    wire.cert_chain.push(cert(der));
                    k += 3 + n;
                }
            }
            _ => {}
        }
        j += 4 + len;
    }
    wire
}

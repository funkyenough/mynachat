//! Turning revealed transcript bytes into structured values.
//!
//! Both sides use `json_string_pairs`: the prover to find the byte range of a
//! `"drugN":"..."` pair, the verifier to parse what was revealed. A pair is only
//! accepted by the verifier if the whole `"key":"value"` span (quotes included) is
//! authenticated, so a revealed value is always bound to its key.

use std::ops::Range;

use anyhow::{bail, Context, Result};
use tlsn::transcript::PartialTranscript;

use crate::eligibility::Disclosed;

/// A `"key":"value"` pair of JSON strings found in a byte slice.
#[derive(Debug, Clone)]
pub struct Pair {
    /// Byte range of the whole pair, from the key's opening quote to the value's closing quote.
    pub range: Range<usize>,
    pub key: String,
    pub value: String,
}

/// Returns the end (exclusive) of a JSON string literal starting at `start` (which must be `"`).
fn string_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut i = start + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'"' => return Some(i + 1),
            _ => i += 1,
        }
    }
    None
}

fn decode(bytes: &[u8]) -> Option<String> {
    serde_json::from_slice::<String>(bytes).ok()
}

/// Finds all `"key":"value"` string pairs (compact JSON, no whitespace around `:`).
pub fn json_string_pairs(bytes: &[u8]) -> Vec<Pair> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'"' {
            i += 1;
            continue;
        }
        let Some(key_end) = string_end(bytes, i) else { break };
        if bytes.get(key_end) == Some(&b':') && bytes.get(key_end + 1) == Some(&b'"') {
            if let Some(val_end) = string_end(bytes, key_end + 1) {
                if let (Some(key), Some(value)) =
                    (decode(&bytes[i..key_end]), decode(&bytes[key_end + 1..val_end]))
                {
                    out.push(Pair { range: i..val_end, key, value });
                    i = val_end;
                    continue;
                }
            }
        }
        // Not a pair: continue scanning after this string literal.
        i = key_end;
    }
    out
}

/// Builds the criteria input from a verified partial transcript.
pub fn to_revealed(t: &PartialTranscript) -> Result<Disclosed> {
    // Request line: the authenticated prefix of the request, up to the first CRLF.
    let sent = t.sent_unsafe();
    let authed_prefix = t
        .sent_authed()
        .iter()
        .find(|r| r.start == 0)
        .map(|r| r.end)
        .context("request line was not revealed")?;
    let prefix = &sent[..authed_prefix];
    let line_end = prefix.windows(2).position(|w| w == b"\r\n").unwrap_or(prefix.len());
    let line = std::str::from_utf8(&prefix[..line_end]).context("request line is not utf-8")?;
    let mut parts = line.split(' ');
    let (Some("POST"), Some(path), Some("HTTP/1.1"), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        bail!("unexpected request line: {line}");
    };

    // Response: parse each authenticated range independently.
    let recv = t.received_unsafe();
    let mut fields = Vec::new();
    for r in t.received_authed().iter() {
        for p in json_string_pairs(&recv[r]) {
            fields.push((p.key, p.value));
        }
    }

    Ok(Disclosed { request_path: path.to_string(), fields })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_pairs() {
        let s = r#"{"resultCode":"9000","n":1,"drugN":"アレグラ","x":"a\"b"}"#;
        let pairs = json_string_pairs(s.as_bytes());
        let kv: Vec<_> = pairs.iter().map(|p| (p.key.as_str(), p.value.as_str())).collect();
        assert_eq!(kv, vec![("resultCode", "9000"), ("drugN", "アレグラ"), ("x", "a\"b")]);
        assert_eq!(&s[pairs[0].range.clone()], r#""resultCode":"9000""#);
    }
}

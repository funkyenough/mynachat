# verifier

Rust verifier service for the Myna Portal proofs, built on TLSNotary
`tlsn` **v0.1.0-alpha.15** (git tag). The browser prover must use the matching
`tlsn-wasm@0.1.0-alpha.15` npm package (see `../extension`); bump both together.

It is the *interactive verifier* (no separate notary): it runs MPC-TLS with the
prover, checks that the TLS server was `myna.go.jp` (certificate chain verified
against the Mozilla/webpki roots at handshake time), reads only the byte ranges
the prover chose to reveal, and evaluates them against the group criteria.

## Endpoints (all WebSocket, `ws://localhost:7047`)

| path | purpose |
|---|---|
| `/prove?sessionId=..&groupId=..&method=..` | verifier side of MPC-TLS + selective disclosure |
| `/relay?target=myna.go.jp:443` | raw WebSocket to TCP bridge so the browser prover can reach the server (only this target is allowed) |
| `/result?sessionId=..` | sends one JSON message with the outcome when the proof finishes, then closes |

When a proof finishes, the verifier POSTs to `$WEB_URL/api/internal/myna-proof`
with header `x-verifier-secret: $VERIFIER_SHARED_SECRET` and body
`{sessionId, groupId, method, passed, evidence, mynaNullifier: null, verifiedAt}`
(sessions that failed with a protocol error are not posted; the extension gets
the error through `/result`). If the web app is not reachable, it logs and carries on.

What the verifier requires from the prover (method `prescription`):
- the server identity (`myna.go.jp`), and
- the request line `POST /api/my/healthinfo/get-medicine-info HTTP/1.1` revealed from byte 0.
Every `"key":"value"` JSON pair that is fully inside a revealed response range is
passed to the criteria; the prescription check looks at `drugN`.

## Run

Requires Rust 1.95 (pinned in `rust-toolchain.toml`; rustup installs it automatically).

```sh
cd verifier
cp .env.example .env   # set VERIFIER_SHARED_SECRET to the web app's value
cargo run --release    # first build takes a few minutes
```

## Native test prover

`src/bin/native_prover.rs` runs the same `tlsn-sdk-core` prover code that the WASM
build uses, going through the verifier's relay to production myna.go.jp.

```sh
# With the verifier running. No login: Myna returns {"resultCode":"9000",...ED1107},
# the prover reveals resultCode/errorCode, and the verdict is passed=false.
cargo run --release --bin native_prover

# Logged in: copy the Cookie header for myna.go.jp from DevTools
# (it must contain SESSION=...). The value is never printed.
MYNA_COOKIE='SESSION=...; tid=...' cargo run --release --bin native_prover
```

Env options: `VERIFIER_URL`, `METHOD`, `GROUP_ID`, `SESSION_ID`, `MAX_SENT_DATA`,
`MAX_RECV_DATA`, `DIRECT=1` (skip the relay and dial myna.go.jp directly).

## Criteria swap point

`src/criteria_stub.rs` is a stand-in for `crates/criteria` (hayfever stems,
`drugN` substring match). To switch to the real crate: add
`criteria = { path = "../crates/criteria" }` to `Cargo.toml` and change the line
`pub use criteria_stub as criteria;` in `src/lib.rs` to `pub use ::criteria;`.
The verifier builds `criteria::Revealed { request_path, fields }` in
`src/disclosure.rs::to_revealed`; adapt that function if the real type differs.

# Hosting the demo

The web app, the verifier and Caddy (HTTPS) run as three containers on one server. People
still install the prover extension in Chrome; it is built to trust this server.

```
browser ──https──▶ Caddy ──▶ web :3000 (Next.js, SQLite on a volume)
extension ─wss /verifier/*─▶ Caddy ──▶ verifier :7047 ──tcp──▶ myna.go.jp:443
verifier ──http──▶ web /api/internal/myna-proof     (shared secret)
verifier ──▶ audit volume ◀── web (read-only, audit reports)
```

## 1. Server

- Any Linux VM with Docker and the Compose plugin, 2 GB RAM or more. A Tokyo region
  keeps the MPC-TLS round trips to myna.go.jp short.
- A DNS name pointing at it (A/AAAA record), and ports 80 and 443 open. Caddy gets the
  Let's Encrypt certificate itself.
- The first build compiles the Rust verifier: about 10–20 minutes on a small VM.

## 2. Configure and start

```bash
git clone https://github.com/funkyenough/mynachat.git && cd mynachat/deploy
cp .env.example .env    # fill in DOMAIN, World ID values, RP_SIGNING_KEY, VERIFIER_SHARED_SECRET
docker compose up -d --build
docker compose logs -f
```

The dev stand-ins (`DEV_FAKE_MYNA`, `DEV_FAKE_WORLD_ID`) are forced off in
`docker-compose.yml`. Audit reports are on (`AUDIT_ENABLED=1`); they are reachable only by
the random session id.

## 3. World ID

In the World developer portal, make sure the app allows the actions `account` (signup) and
`poll-<id>` (board polls) if your app requires actions to be registered.

## 4. Build the extension for this server

```bash
cd extension
APP_ORIGIN=https://demo.example.com VERIFIER_URL=wss://demo.example.com/verifier node build.mjs
cd dist && zip -r ../mynachat-extension.zip . && cd ..
```

Share `mynachat-extension.zip`: unzip, open `chrome://extensions`, turn on Developer
mode, "Load unpacked", pick the folder. The build trusts only localhost and the verifier
named here; a page cannot point it anywhere else.

## Operations

- Data lives in the `web-data` volume (SQLite) and `audit` volume. Back up with
  `docker compose cp web:/data/mynachat.sqlite ./backup.sqlite`.
- Update: `git pull && docker compose up -d --build`.
- Myna Portal may throttle or block some datacenter IPs. If proofs fail at "connecting",
  check `docker compose logs verifier` for the relay to `myna.go.jp:443`.

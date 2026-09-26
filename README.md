# mynachat

**Anonymous communities for people who share a condition — membership proven from your own Myna Portal data, without revealing it.**

同じ病気の人と、匿名で話そう。参加資格はマイナポータルにあるあなた自身のデータで確かめ、見せるのは条件を満たしていることだけです。

Live demo: **https://mynachat.fly.dev** (Japanese / English)

## The idea

Patient communities work best when everyone in them really has the condition, but proving that usually means handing over medical records or a diagnosis letter. mynachat lets you prove it from Japan's government health portal (マイナポータル) **without showing your records to anyone**:

- **Verified, not self-declared.** The browser extension fetches your prescription history from `myna.go.jp` inside a [TLSNotary](https://tlsnotary.org) MPC-TLS session with the group's verifier. The verifier learns that the data really came from `myna.go.jp`, unaltered, but it can read only the bytes you choose to reveal: the request path and **one matching drug name**. Every other drug, clinic and date stays hidden (zeros in the verifier's copy).
- **One person, one account.** Signup requires a World ID proof. Its nullifier is the same for the same person every time, so nobody can open a second account.
- **Anonymous by design.** You pick a separate display name in each group, so members of one group can't link you to another. Your login name is never shown on boards.
- **No passwords.** Log in with a passkey (Touch ID, Face ID, your phone).
- **Secret ballots.** Board polls allow one vote per person via World ID, and only the per-poll nullifier is stored, never who voted for what.

### Why it can't be gamed with a random prescription

Each group has its own list of drugs. A hay fever prescription (e.g. ビラノア) opens the **花粉症** group but not the **片頭痛 (migraine)** group, which needs a triptan or a migraine preventive. When nothing matches, the extension still runs the full MPC-TLS session but reveals nothing from the response, and the verifier rejects it. Every proof comes with an audit report showing exactly which bytes the verifier saw.

## What the group learns — and what it never does

| Learns | Never learns |
|---|---|
| That you meet the group's criteria | Your name, address or date of birth |
| The one item used to decide (e.g. the matching drug name) | Your My Number (it is never read) |
| The display name you chose for this group | Your other prescriptions, clinics or visit dates |
| | Which other groups you belong to |

The operators can see which account belongs to which groups (to show you your list) and a short record of each verdict (e.g. `prescribed ビラノア`). Medical records are never received or stored.

## How joining works

1. **Find your condition** — search all of ICD-10 (2013, as used in Japan) by name or code, in Japanese or English. Conditions without a group get a waitlist.
2. **Create an account** — one World ID proof, then a username and a passkey.
3. **Prove it with Myna Portal** — the extension opens Myna Portal, waits for you to log in, runs the MPC-TLS proof with the verifier, and reveals only the matching drug.
4. **Join the board** — a Discourse-style forum: topics, replies with quotes, reactions, Markdown, polls, unread markers.

## Architecture

```
browser (web app) ──postMessage──▶ extension (TLSNotary prover, WASM)
                                        │  MPC-TLS            ▲ your Myna Portal session cookie
                                        ▼                     │ (never revealed)
             verifier (Rust, tlsn) ◀── WebSocket ──┘
                  │  relay: WebSocket ⇄ TCP to myna.go.jp:443 (encrypted bytes only)
                  │  checks: server = myna.go.jp, cert chain, revealed path, group criteria
                  ▼
web app (Next.js) ◀── verdict (shared secret) ── membership granted
    │
    └── World ID (IDKit 4, RP-signed requests, verified with the World Developer Portal)
```

| Path | What it is |
|---|---|
| [`web/`](web) | Next.js app: landing page, ICD-10 search, accounts (World ID + passkeys), group join flow, message board, audit reports. SQLite via sql.js. |
| [`verifier/`](verifier) | Rust TLSNotary verifier (`tlsn` v0.1.0-alpha.15) with a WebSocket→TCP relay locked to `myna.go.jp:443`. |
| [`extension/`](extension) | Chrome MV3 extension: the TLSNotary prover (`tlsn-wasm`), which picks the matching drug to reveal. |
| [`crates/criteria/`](crates/criteria) | Group criteria evaluated on revealed data (shared by the verifier). |
| [`groups/catalog.json`](groups/catalog.json) | Groups, their ICD-10 codes, proof methods and drug lists. Used by the web app, verifier and extension. |
| [`deploy/`](deploy) | Docker images, Docker Compose + Caddy, and the single-machine Fly.io setup ([`fly.toml`](fly.toml)). |

### Proof methods

| Method | Source | Status |
|---|---|---|
| Prescription | `/api/my/healthinfo/get-medicine-info` — reveals one matching `drugN` | **Working** |
| 指定難病 certification | `/api/my/selfinfo/get` (ID 82) | Verifier support written; extension coming soon |
| Medical subsidy certificate (PMH) | `/api/my/pmh-info/send-medicalsubsidy/v3` | Coming soon |
| Diagnosis (傷病名) | `/api/my/healthinfo/get-six-medical-info` (`SBM`) | Waiting on Japan's EHR sharing service (planned 2027) |

### Groups open now

| Group | ICD-10 | Accepted drugs (examples) |
|---|---|---|
| 花粉症 / Hay fever | J30.1, J30.2 | アレグラ, ビラノア, ザイザル, アレロック, ナゾネックス… |
| 片頭痛 / Migraine | G43 | イミグラン, マクサルト, レルパックス, ミグシス, エムガルティ… |
| 指定難病（全般） | — | proof methods coming soon |
| 脊髄性筋萎縮症 (SMA) | G12.0, G12.1 | スピンラザ, エブリスディ, ゾルゲンスマ |

## Try it

1. Build the extension for the live site and load it in Chrome:
   ```bash
   cd extension && pnpm install
   APP_ORIGIN=https://mynachat.fly.dev VERIFIER_URL=wss://mynachat.fly.dev/verifier node build.mjs
   ```
   Open `chrome://extensions`, turn on **Developer mode**, **Load unpacked**, choose `extension/dist`.
2. Open https://mynachat.fly.dev, search your condition, sign up with World App and a passkey, and join a group. The extension opens Myna Portal for you to log in (マイナンバーカード required).

## Run locally

Requirements: Node 22 + pnpm, Rust 1.95 (pinned), Chrome.

```bash
# web app
cp web/.env.example web/.env.local      # World ID app, RP signing key, verifier secret
pnpm --dir web install && pnpm --dir web dev          # http://localhost:3000

# verifier
cp verifier/.env.example verifier/.env  # same VERIFIER_SHARED_SECRET as the web app
cd verifier && cargo run --release                     # ws://localhost:7047

# extension (localhost-only build)
cd extension && pnpm install && node build.mjs         # then Load unpacked: extension/dist
```

For UI work without World App or a Myna Portal login, set `DEV_FAKE_WORLD_ID=1` and `DEV_FAKE_MYNA=1` in `web/.env.local`: the signup and join steps get clearly labelled stand-in buttons. Keep them off anywhere public.

Useful settings (`web/.env.example` documents them all):

- `WLD_CREDENTIAL` — the World ID 4.0 credential required at signup (`mnc` My Number Card, `proof_of_human`, `passport`).
- `WLD_ACTION_PREFIX` — prefix for World ID actions. World ID proofs are per person *and action*, and local and production share one World ID app, so use `dev-` locally and `prod-` in production.
- `WEBAUTHN_RP_ID` / `WEBAUTHN_ORIGIN` — the site's domain and origin for passkeys.

## Deploy

The live demo runs web app, verifier and Caddy on one Fly.io machine with a volume for the database and audit files:

```bash
fly deploy        # uses fly.toml and deploy/fly/Dockerfile
```

Secrets (World ID values, RP signing key, verifier secret) are set with `fly secrets`. [`deploy/README.md`](deploy/README.md) also covers running the same stack with Docker Compose on any server.

## Tests

```bash
cd crates/criteria && cargo test   # criteria, including "a hay fever drug must not open the migraine group"
cd web && npx tsc --noEmit         # type check
```

## Limitations and open questions

- **Losing every passkey means losing the account.** There is no recovery; add a second or synced passkey.
- **Prescription is a proxy.** It shows you were prescribed a drug for the condition, not a confirmed diagnosis. Diagnosis records arrive with the EHR sharing service (planned 2027).
- **The group's verifier is trusted to evaluate honestly.** It never sees your hidden data, but it decides the verdict.
- **Replaying Myna Portal frontend requests** and processing health data (要配慮個人情報) need a clear terms-of-use and consent position before any real launch.
- The demo runs on a single machine, so deploys cause a few seconds of downtime.

## Data sources

- ICD-10 (2013) Japanese titles: 疾病、傷害及び死因の統計分類 (基本分類), [e-Stat](https://www.e-stat.go.jp/classifications/terms/40).
- English titles: [CMS ICD-10-CM](https://www.cms.gov/medicare/coding-billing/icd-10-codes) (public domain), used only for codes that also exist in WHO ICD-10.
- Rebuild with [`web/scripts/build-icd10.py`](web/scripts/build-icd10.py).

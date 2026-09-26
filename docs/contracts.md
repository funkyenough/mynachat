# Component contracts (MVP)

Layout:

| Dir | Component | Owner |
|---|---|---|
| `web/` | Next.js app + API routes + SQLite (message board, enrollment, IDKit) | web |
| `extension/` | Chrome MV3 extension: prover (tlsn-js) | tlsn |
| `verifier/` | Rust verifier service (tlsn) + WebSocket→TCP relay | tlsn |
| `crates/criteria/` | Rust criteria evaluation (used by verifier) | core |
| `groups/catalog.json` | Groups and accepted methods/criteria | core |

Local ports: web `http://localhost:3000`, verifier `ws://localhost:7047`.

## Accounts (once per human)

```
web   POST /api/signup/start                              -> {signupId}
web   POST /api/world-id/context {purpose:"account", signupId}
                                                          -> {rpContext, action:"account", signal: signupId}
web   IDKit (credential WLD_CREDENTIAL, default mnc), then
      POST /api/signup/world-id {signupId, idkitResult}  -> {ok}
        verifies with developer.world.org; the "account" nullifier is one per human
        (409 if it already has an account).
web   POST /api/passkey/register/options {signupId, username} -> {challengeId, options}
      navigator.credentials.create (SimpleWebAuthn)
      POST /api/passkey/register/verify {challengeId, response} -> creates account, sets mnd_login cookie
```

Daily login: `POST /api/passkey/login/options` -> discoverable-credential `navigator.credentials.get`
-> `POST /api/passkey/login/verify`. Logged-in users can add passkeys (`register/options` with `{}`).

## Group join (per group, logged in)

```
web            POST /api/enroll/start {groupId, method, handle}  -> {sessionId}
                 handle = per-group display name (unique per group, never linked across groups)
web -> ext     window.postMessage {type:"MYNA_PROVE_REQUEST", sessionId, groupId, method, verifierUrl}
ext            opens https://myna.go.jp, waits for SESSION cookie, runs MPC-TLS with verifier
ext <-> verifier   ws://localhost:7047/prove?sessionId=..&groupId=..&method=..
verifier -> web POST /api/internal/myna-proof  (header x-verifier-secret)
               {sessionId, groupId, method, passed, evidence, mynaNullifier, verifiedAt}
ext -> web     window.postMessage {type:"MYNA_PROVE_RESULT", sessionId, passed, error?}
web            GET /api/enroll/status?sessionId -> {state: "pending"|"myna_verified"|"failed"|"member"}
web            POST /api/enroll/complete {sessionId} -> member of the group (session must belong to the account)
```

## World ID actions

| action | when | signal | stored |
|---|---|---|---|
| `account` | signup | signupId | `accounts.world_nullifier` (one account per human) |
| `poll-<id>` | voting in a board poll | `vote:<optionId>` | `poll_votes` keyed by nullifier only (secret ballot, no member id) |

- The web page talks to the extension only through `window.postMessage`; the
  extension injects a content script on `http://localhost:3000/*` that bridges to
  its service worker. No extension ID is needed in the web app.
- `x-verifier-secret` = env `VERIFIER_SHARED_SECRET` (same value in `web/.env.local`
  and the verifier's env).
- Board name = the member's per-group handle. The login username is never shown on boards.
- `mynaNullifier`: hex hash committed from the 住民票 (ID 1) name + DOB bytes. Optional
  in the first spike (null until implemented); when present, the backend rejects a
  second member in the same group with the same value.

## Myna Portal requests the prover makes

All `POST https://myna.go.jp<path>`, `content-type: application/json`,
`origin: https://myna.go.jp`, `referer: https://myna.go.jp/`, auth = the `SESSION`
cookie (plus `tid`, `QueueITAccepted-*` if present). `screenId` must be exactly 14 chars.

| method | path | body |
|---|---|---|
| `prescription` | `/api/my/healthinfo/get-medicine-info` | `{"commonHeader":{"screenId":"medicine_past_"}}` |
| `nanbyo` (ID 82) | `/api/my/selfinfo/get` | `{"commonHeader":{"screenId":"home__________"},"reqBody":{"fieldCd":"","fieldDetailCd":"","personInfoNameCd":"TM00000000000082","targetYear":""}}` |
| nullifier (ID 1) | `/api/my/selfinfo/get` | same, with `TM00000000000001` |
| `pmh` | `/api/my/pmh-info/send-medicalsubsidy/v3` | `{"commonHeader":{"screenId":"medical_subsid"},"reqBody":{"encodedRequestData":"<base64 of {\"operation\":\"GetMedicalSubsidyList\"}>"}}` |

Unauthenticated requests still return a real JSON error (`resultCode 9000`,
`ED1107`), which is useful for testing MPC-TLS against production without a login.

## Response shapes (keys only)

`get-medicine-info`:
```
{resultCode, resBody:{inqDemandMngNum, drugInfoDetailCnt, currentYear,
  drugInfoGetResults:[ {"<YYYY>": {summary, drugInfoDetailListByDate:[
    {"<YYYY年M月D日>": [ {prescriptionMedicalInstitutionName, medicalInstitutionName,
       drugInfoContentList:[ {drugN, quantity, usageN, times, kbn} ]} ]} ]}} ]}}
```

`selfinfo/get` (ID 1 and ID 82 share the envelope):
```
{resultCode, resBody:{dateToday, selfiTranStatusCd,   // 03 + resultList = data, 04 = none
  resultList:[ {personInfoNameCd, personInfoName, notifiernmWithOutsourcernm, ...,
    personInfoNameDetailList:[ {hierarchy, personInitemCd, personInitemName, personInitemContent} ]} ]}}
```
ID 82 item codes: `8200000020` 支給開始年月, `8200000030` 支給終了年月,
`8200000070` 登録者証効力開始年月日, `8200000080` 登録者証効力終了年月日.

## Disclosure rules

- `prescription`: reveal only the byte range of one `drugN` value that matches the
  group's drug list, plus the request line/path. Everything else stays hidden.
- `nanbyo`: reveal the `selfiTranStatusCd` value and the ID 82 period values only.
- Myna nullifier: hash-commit the ID 1 name + birth-date value ranges; never reveal them.

## Verifier -> criteria

The verifier passes the revealed strings to `crates/criteria`:
`criteria::evaluate(group_id, method, &Revealed) -> Verdict { passed, evidence }`,
with `groups/catalog.json` as the source of groups and criteria.

# extension

Chrome MV3 extension that acts as the TLSNotary **prover**. It runs MPC-TLS with
our verifier (`../verifier`) against production `myna.go.jp`, using the user's
own Myna Portal session cookie, and reveals only the request line plus one
`"drugN":"..."` value that matches the group's drug list.

Uses `tlsn-wasm@0.1.0-alpha.15` (the WASM build of `tlsn` v0.1.0-alpha.15; it
must match the verifier's `tlsn` git tag). The older `tlsn-js` wrapper stops at
alpha.12 and does not work with an alpha.15 verifier.

## Build

```sh
cd extension
pnpm install
pnpm build        # writes dist/
```

There is no bundler on purpose. `build.mjs` copies `src/` and the untouched
`tlsn-wasm` package (to `dist/tlsn/`) because tlsn-wasm starts nested module
workers from `import.meta.url`-relative paths, and bundlers tend to break that.

## Load unpacked

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked**, then pick `extension/dist`.
3. After a rebuild, click the reload icon on the extension card.

## How it works

| file | role |
|---|---|
| `content.js` | on `http://localhost:3000/*` (and the hosted origin the build was made for): passes `window.postMessage` `MYNA_PROVE_REQUEST` to the service worker, and passes `MYNA_PROVE_PROGRESS` / `MYNA_PROVE_RESULT` back to the page |
| `background.js` | reads the `myna.go.jp` cookies (`chrome.cookies`). If there is no `SESSION` cookie, or `/api/common/login/is-login` does not say `isLogin: "true"`, it opens `https://myna.go.jp/` and polls every 2 s until the user has logged in (10 min timeout). Then it starts the offscreen document |
| `offscreen.html/js` | offscreen document (reason `WORKERS`) that owns the prover worker |
| `prover-worker.js` | loads the WASM, runs `/prove` (MPC setup), sends the POST through `/relay` to myna.go.jp, finds a matching `drugN`, reveals it, then reads the verdict from `/result` |
| `match.js` | JSON pair scanner (mirrors `verifier/src/disclosure.rs`) + the group's drug stems from `catalog.json` |

The Cookie header is sent inside MPC-TLS but never revealed; only the request
line (byte 0 up to the first CRLF) of the request is disclosed.

Page protocol:

```js
window.postMessage({ type: 'MYNA_PROVE_REQUEST', sessionId, groupId, method: 'prescription',
                     verifierUrl: 'ws://localhost:7047' }, location.origin);
// <- { type: 'MYNA_PROVE_PROGRESS', sessionId, stage }  stage: checking_login | waiting_for_login |
//      starting_prover | loading_wasm | mpc_setup | requesting | response_<status> | revealing | verifying | done
// <- { type: 'MYNA_PROVE_RESULT', sessionId, passed, error? }   (passed comes from the verifier's verdict)
// <- { type: 'MYNA_EXTENSION_READY' } is posted once when the content script loads.
```

`verifierUrl` must be a local `ws://localhost` or `ws://127.0.0.1` URL, or the `wss://`
verifier this build was made for (`VERIFIER_URL` at build time, see the top-level README).
Only method `prescription` is implemented.

## Manual test

1. Start the verifier: `cd verifier && cargo run --release`.
2. Build and load the extension as above.
3. Open any page on `http://localhost:3000` and, in the DevTools console, run:

   ```js
   window.addEventListener('message', (e) => e.data?.type?.startsWith('MYNA_') && console.log(e.data));
   window.postMessage({ type: 'MYNA_PROVE_REQUEST', sessionId: 'manual-' + Date.now(),
     groupId: 'hayfever', method: 'prescription', verifierUrl: 'ws://localhost:7047',
     debugNoLogin: true }, location.origin);
   ```

   `debugNoLogin: true` skips the login step and sends no cookie. Myna answers with
   its ED1107 error JSON, so you should get `passed: false` with
   `error: "no matching prescription found (0 drugs checked)"` after about 2 s. That
   exercises MPC-TLS against production end to end.
4. Repeat without `debugNoLogin` to test the real flow. A Myna Portal tab opens;
   log in with your My Number card; the proof then runs automatically.
   Prover logs are in the offscreen document: `chrome://extensions`, then
   **Inspect views: offscreen.html**.

## Known limitations

- Group drug lists are hard-coded (hayfever stems in `match.js`) until `groups/catalog.json` is wired in.
- A `drugN` value split across HTTP chunked-encoding boundaries would not be found.
- One proof at a time.

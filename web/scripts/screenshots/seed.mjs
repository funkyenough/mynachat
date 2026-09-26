// Seeds the screenshot database through the app's own APIs (dev stand-ins for World ID and
// Myna, software passkeys). The browser profile keeps the viewer's login for screenshots.
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  userDataDir: new URL("./.profile", import.meta.url).pathname,
  headless: true,
});
const page = await browser.newPage();
await page.goto("http://localhost:3000/search", { waitUntil: "networkidle0" });

const result = await page.evaluate(async () => {
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const ub64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
  const head = (M, n) => (n < 24 ? [M << 5 | n] : n < 256 ? [M << 5 | 24, n] : [M << 5 | 25, n >> 8, n & 255]);
  const cbor = (v) => typeof v === "number" ? new Uint8Array(v >= 0 ? head(0, v) : head(1, -1 - v))
    : typeof v === "string" ? (() => { const b = new TextEncoder().encode(v); return cat(new Uint8Array(head(3, b.length)), b); })()
    : v instanceof Uint8Array ? cat(new Uint8Array(head(2, v.length)), v)
    : cat(new Uint8Array(head(5, v.size)), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)]));
  const sha = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-256", b));
  const der = (raw) => { const int = (b) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = cat(new Uint8Array([0]), b); return cat(new Uint8Array([2, b.length]), b); }; const r = int(raw.slice(0, 32)), s = int(raw.slice(32)); return cat(new Uint8Array([0x30, r.length + s.length]), r, s); };
  const post = async (u, b, m = "POST") => { const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${u} ${r.status} ${JSON.stringify(d)}`); return d; };

  async function signup(username, handle, groups) {
    await fetch("/api/logout", { method: "POST" });
    const { signupId } = await post("/api/signup/start", {});
    await post("/api/dev/fake-world-id", { purpose: "account", signupId });
    const o = await post("/api/passkey/register/options", { signupId, username });
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
    const credId = crypto.getRandomValues(new Uint8Array(16));
    const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, ub64u(jwk.x)], [-3, ub64u(jwk.y)]]));
    const authData = cat(await sha(new TextEncoder().encode(o.options.rp.id)), new Uint8Array([0x45, 0, 0, 0, 0]), new Uint8Array(16), new Uint8Array([0, 16]), credId, cose);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.create", challenge: o.options.challenge, origin: location.origin }));
    await post("/api/passkey/register/verify", { challengeId: o.challengeId, response: { id: b64u(credId), rawId: b64u(credId), type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))), transports: ["internal"] } } });
    for (const g of groups) {
      const { sessionId } = await post("/api/enroll/start", { groupId: g, method: "prescription", handle });
      await post("/api/dev/fake-myna", { sessionId });
      await post("/api/enroll/complete", { sessionId });
    }
    return { kp, credId, userHandle: o.options.user.id, counter: 0, handle };
  }
  async function login(c) {
    await fetch("/api/logout", { method: "POST" });
    const { challengeId, options } = await post("/api/passkey/login/options", {});
    c.counter++;
    const authData = cat(await sha(new TextEncoder().encode(options.rpId)), new Uint8Array([0x05, 0, 0, 0, c.counter]));
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin: location.origin }));
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, c.kp.privateKey, cat(authData, await sha(clientDataJSON))));
    await post("/api/passkey/login/verify", { challengeId, response: { id: b64u(c.credId), rawId: b64u(c.credId), type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(der(sig)), userHandle: c.userHandle } } });
  }
  const topic = (title, body, poll) => post("/api/groups/hayfever/threads", { title, body, poll });
  const reply = (id, body, quoteId) => post(`/api/threads/${id}/replies`, { body, quoteId });
  const react = (kind, id, emoji) => post("/api/reactions", { kind, id, emoji });

  const U = {};
  U.haru = await signup("harukaze", "はるかぜ", ["hayfever"]);
  U.mori = await signup("morinokuma", "もりのくま", ["hayfever"]);
  U.yuki = await signup("yukinko", "ゆきんこ", ["hayfever"]);
  U.tsu = await signup("tsubasa_k", "tsubasa", ["hayfever"]);
  U.kae = await signup("kaede_viewer", "かえで", ["hayfever", "sma"]);

  const T = {};
  await login(U.haru);
  T.meds = (await topic("今年のスギ花粉、どの薬が効きましたか？",
    "毎年2月から4月がつらいです。今年は **ビラノア** に変えてから、日中の眠気がかなり減りました。\n\n試したもの:\n- アレグラ（効きはマイルド）\n- ザイザル（よく効くけど少し眠い）\n- ビラノア（空腹時に飲むのがポイント）\n\n> 皆さんの「これは合った」を知りたいです。",
    ["アレグラ", "ビラノア", "ザイザル", "点鼻薬だけ"])).id;
  T.slit = (await topic("舌下免疫療法、3年目の記録",
    "スギの舌下免疫療法（シダキュア）を始めて3年目になりました。\n\n**変化**\n1. 1年目: ほぼ変化なし\n2. 2年目: 目のかゆみが少し軽くなった\n3. 3年目: 薬を飲む日が半分くらいに\n\n毎日続けるのは大変ですが、個人的にはやってよかったです。質問があればどうぞ。")).id;
  await login(U.mori);
  T.mask = (await topic("花粉の時期のマスク、蒸れない選び方", "立体型とプリーツ型、どちらが快適ですか？ 通勤で1日中つけています。")).id;
  await login(U.yuki);
  T.work = (await topic("眠くならない薬を仕事中に使いたい", "運転する仕事なので、*眠気の少ない*薬を探しています。添付文書に運転の注意がないものは限られるみたいで…")).id;
  await login(U.tsu);
  T.kids = (await topic("子どもの花粉症、何歳から病院に行きましたか", "5歳の息子が春先に目をこすってばかりいます。小児科と耳鼻科、どちらに行くのがいいでしょう。")).id;
  await login(U.mori);
  T.info = (await topic("【まとめ】今週の飛散予報", "今週は関東で「非常に多い」日が続く予報です。\n\n参考: https://www.tenki.jp/pollen/\n\n外出後は `服をはたいてから` 家に入るのがおすすめです。")).id;

  // Replies and reactions on the medicine thread
  await login(U.mori);
  const r1 = await reply(T.meds, "私もビラノア派です。`空腹時` に飲むと効きが全然違いますね。");
  await react("t", T.meds, "👍");
  await login(U.yuki);
  const r2 = await reply(T.meds, "ザイザルは効くけど、午後に眠くなるので仕事の日は避けています。", undefined);
  await react("t", T.meds, "❤️");
  await react("r", r1.id, "👍");
  await login(U.tsu);
  await reply(T.meds, "空腹時って食前ですか？ 朝ごはんの前に飲めばいいのかな。", r1.id);
  await react("t", T.meds, "👍");
  await login(U.haru);
  await reply(T.meds, "食事の1時間前か、食後2時間以上あけるのが目安と薬剤師さんに言われました。", undefined);
  await react("r", r2.id, "🤝");
  await login(U.kae);
  await react("t", T.meds, "🙏");
  await reply(T.meds, "点鼻薬だけで乗り切っている派です。朝晩1回ずつ、**鼻の奥に向けて**がコツ。");
  await login(U.mori);
  await reply(T.meds, "今年は飛散量が多いので、症状が出る前から飲み始めるのがおすすめですよ。");
  // Poll votes (dev stand-in: each is a distinct "human")
  const d = await (await fetch(`/api/threads/${T.meds}`)).json();
  const opts = d.poll.options.map((o) => o.id);
  const votes = [1, 1, 1, 1, 1, 1, 0, 0, 0, 2, 2, 2, 2, 3, 3];
  for (const i of votes) await post("/api/dev/fake-world-id", { purpose: "poll", pollId: d.poll.id, optionId: opts[i] });

  // Other threads
  await login(U.yuki);
  await reply(T.slit, "3年続けているのすごいです！ 始めるのに適した時期はありますか？");
  await login(U.haru);
  await reply(T.slit, "スギ花粉が飛んでいない **6月〜12月** に開始する決まりです。");
  await login(U.tsu);
  await react("t", T.slit, "❤️"); await react("t", T.slit, "👍");
  await reply(T.mask, "立体型の方が口元に空間があって楽でした。");
  await login(U.haru);
  await reply(T.mask, "ノーズワイヤー付きだと眼鏡も曇りにくいです。");
  await login(U.kae);
  await reply(T.work, "運転の注意がないのは、アレグラ・ビラノア・デザレックスあたりだったと思います。念のため医師に確認を。");
  await login(U.yuki);
  await react("r", (await (await fetch(`/api/threads/${T.work}`)).json()).replies[0].id, "🙏");
  await login(U.mori);
  await react("t", T.info, "👍");

  // Waitlist interest for a condition without a group
  for (const u of [U.haru, U.mori, U.yuki, U.kae]) { await login(u); await post("/api/waitlist", { code: "K51" }); }

  await login(U.kae);
  return { T, viewer: "kaede_viewer" };
});
console.log(JSON.stringify(result));
await browser.close();

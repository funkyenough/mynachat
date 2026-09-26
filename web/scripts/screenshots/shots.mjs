// Captures submission screenshots from the seeded local app (see seed.mjs).
import puppeteer from "puppeteer-core";

const OUT = new URL("../../../docs/screenshots", import.meta.url).pathname;
const BASE = "http://localhost:3000";
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const HIDE_DEV = "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  userDataDir: new URL("./.profile", import.meta.url).pathname,
  headless: true,
});
const guest = await browser.createBrowserContext(); // logged out

async function shot(ctx, name, path, { viewport = DESKTOP, full = false, wait = 700, before } = {}) {
  const page = await ctx.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }]);
  await page.setViewport(viewport);
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: HIDE_DEV });
  if (before) await before(page);
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await page.close();
  console.log("saved", name);
}
const me = browser.defaultBrowserContext(); // logged in as かえで

// Landing (the hero redacts itself ~1.6 s after load)
await shot(guest, "01-landing-ja", "/?lang=ja", { wait: 2600 });
await shot(guest, "01-landing-en", "/?lang=en", { wait: 2600 });
await shot(guest, "01-landing-ja-your-view", "/?lang=ja", { wait: 300, before: (p) => p.click(".redact .seg button") });
await shot(guest, "02-landing-ja-full", "/?lang=ja", { full: true, wait: 2600 });
// Search with results
await shot(guest, "03-search-ja", "/search?lang=ja", {
  wait: 900,
  before: async (p) => { await p.type(".search-input", "花粉"); await p.waitForSelector(".results li"); },
});
await shot(guest, "03-search-en", "/search?lang=en", {
  wait: 900,
  before: async (p) => { await p.type(".search-input", "ulcerative"); await p.waitForSelector(".results li"); },
});
// Disease pages
await shot(me, "04-disease-ja", "/disease/J30.1?lang=ja");
await shot(me, "04-disease-waitlist-ja", "/disease/K51?lang=ja");
// Signup and join (logged out)
await shot(guest, "05-signup-ja", "/signup?lang=ja");
// The real World ID widget (a signed "account" request), showing its QR code.
await shot(guest, "05-signup-worldid-ja", "/signup?lang=ja", {
  wait: 2500,
  before: async (p) => {
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /World ID/.test(b.textContent) && !b.disabled));
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /World ID/.test(b.textContent)).click());
    await p.waitForFunction(() => [...document.querySelectorAll("*")].some((e) => e.shadowRoot && /QR/.test(e.shadowRoot.textContent)), { timeout: 15000 });
    await p.evaluate(() => {
      const host = [...document.querySelectorAll("*")].find((e) => e.shadowRoot && /QR/.test(e.shadowRoot.textContent));
      const btn = [...host.shadowRoot.querySelectorAll("button")].find((b) => /QR/.test(b.textContent));
      btn?.click();
    });
  },
});
await shot(guest, "05-join-ja", "/groups/hayfever/join?lang=ja");
// Board (before opening topics, so unread markers show)
await shot(me, "06-board-ja", "/groups/hayfever?lang=ja");
await shot(me, "06-board-mobile-ja", "/groups/hayfever?lang=ja", { viewport: MOBILE });
await shot(me, "06-board-en", "/groups/hayfever?lang=en");
// Topic with poll, quotes and the "new since last visit" divider (first visit only)
await shot(me, "07-topic-ja-full", "/groups/hayfever/threads/1?lang=ja", { full: true });
await shot(me, "07-topic-ja", "/groups/hayfever/threads/1?lang=ja");
await shot(me, "07-topic-mobile-ja", "/groups/hayfever/threads/1?lang=ja", { viewport: MOBILE });
await shot(me, "07-topic-en-full", "/groups/hayfever/threads/2?lang=en", { full: true });
// Composer with Markdown preview
await shot(me, "08-new-topic-ja", "/groups/hayfever?lang=ja", {
  before: async (p) => {
    await p.click(".forum-new");
    await p.type(".composer-title", "目のかゆみ、皆さんの対策は？");
    await p.type(".editor textarea", "目薬以外で効いたものを教えてください。\n\n- **洗顔**を帰宅後すぐに\n- 花粉用メガネ\n\n> 冷やすのも良いと聞きました");
    const [, previewTab] = await p.$$(".editor-tabs button");
    await previewTab.click();
  },
});
await shot(me, "09-account-ja", "/account?lang=ja");
await shot(guest, "10-landing-mobile-ja", "/?lang=ja", { viewport: MOBILE, wait: 2600 });

await browser.close();

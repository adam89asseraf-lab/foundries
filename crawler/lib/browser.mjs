// Browser setup, polite throttling, page preparation and screenshot output.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { finishAnimations, hideCookieBanners } from "../snippets.mjs";
import { SHOTS, host } from "./store.mjs";

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--disable-blink-features=AutomationControlled"] });
  const newContext = () => browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: UA, locale: "en-GB",
    reducedMotion: "no-preference", ignoreHTTPSErrors: true,
  });
  return { browser, newContext };
}

/* ---------- politeness: max one navigation every ~2 s per domain ---------- */
const last = new Map();
const chains = new Map();
export function throttle(url, gap = 2000) {
  const d = host(url).split(".").slice(-2).join(".");
  const prev = chains.get(d) || Promise.resolve();
  const next = prev.then(async () => {
    const wait = (last.get(d) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(d, Date.now());
  });
  chains.set(d, next);
  return next;
}

/** Simple promise pool. */
export async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

const BLOCKED = /just a moment|attention required|access denied|are you a robot|captcha|request blocked|forbidden|ddos protection|checking your browser|verify you are human/i;

/** Navigate with throttle + retries (2 retries). Throws an Error with .blocked when the site blocks bots. */
export async function open(page, url) {
  let err;
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle(url);
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("load", { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      const status = res ? res.status() : 0;
      const title = await page.title().catch(() => "");
      if ([401, 403, 429, 503].includes(status) || BLOCKED.test(title)) {
        // Cloudflare-style interstitials sometimes clear after a few seconds
        await sleep(6000);
        const t2 = await page.title().catch(() => "");
        if (!BLOCKED.test(t2) && status !== 403 && status !== 401) return res;
        const e = new Error(`blocked (HTTP ${status}${title ? `, "${title.slice(0, 40)}"` : ""})`); e.blocked = true; throw e;
      }
      if (status >= 400) throw new Error(`HTTP ${status}`);
      return res;
    } catch (e) {
      err = e;
      if (e.blocked) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw err;
}

/** Before every screenshot: cookie CSS, animation snippet, muted videos, fonts.ready, then 1.5 s. */
export async function prepare(page) {
  await page.evaluate(hideCookieBanners).catch(() => {});
  await page.evaluate(finishAnimations).catch(() => {});
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 5000))])).catch(() => {});
  await sleep(1500);
  await page.evaluate(hideCookieBanners).catch(() => {}); // late-injected banners
  await page.evaluate(finishAnimations).catch(() => {});
}

/** Screenshot the viewport (2880×1800 @2x) → <name>.webp (1600×1000) + <name>.thumb.webp (800×500). */
export async function shoot(page, name) {
  const png = await page.screenshot({ type: "png", timeout: 30000, animations: "disabled", caret: "hide" });
  return png;
}
export async function writeShot(png, name) {
  const out = path.join(SHOTS, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const base = sharp(png).resize(1600, 1000, { fit: "cover", position: "top" });
  await base.clone().webp({ quality: 82 }).toFile(out + ".webp");
  await sharp(png).resize(800, 500, { fit: "cover", position: "top" }).webp({ quality: 78 }).toFile(out + ".thumb.webp");
  return name;
}
export function removeShot(name) {
  for (const ext of [".webp", ".thumb.webp"]) fs.rmSync(path.join(SHOTS, name + ext), { force: true });
}

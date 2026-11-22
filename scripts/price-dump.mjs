// For hand review: scroll a font page (and its buy page) to the bottom and print every line that has a price or buy wording.
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { hideCookieBanners } from "../crawler/snippets.mjs";
const ids = process.argv.slice(2); const d = loadData(); const { browser, newContext } = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = {};
const scrollAll = async p => { for (let i = 0; i < 25; i++) { const end = await p.evaluate(() => { scrollBy(0, innerHeight); return innerHeight + scrollY >= document.body.scrollHeight - 5; }); await sleep(250); if (end && i > 3) break; } await sleep(800); };
const grab = p => p.evaluate(() => {
  const lines = document.body.innerText.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const hits = []; const re = /([$€£₪]|\b(CHF|USD|EUR|GBP|ILS|NZD|AUD|SEK|DKK)\b)\s?\d|\d\s?([€₪]|\b(CHF|USD|EUR|GBP|ILS|NZD|kr)\b)|\b(price|pricing|buy|licen[cs]e|add to cart|per style|single style|from)\b/i;
  lines.forEach((l, i) => { if (re.test(l) && l.length < 160) hits.push(l); });
  const links = [...document.querySelectorAll("a[href],button")].map(a => (a.innerText || "").trim()).filter(t => /buy|licen|shop|cart|price|purchase/i.test(t) && t.length < 30);
  return { hits: [...new Set(hits)].slice(0, 18), links: [...new Set(links)].slice(0, 8), buyHref: [...document.querySelectorAll("a[href]")].filter(a => a.host === location.host && /^(buy|buy now|buy fonts?|purchase|licen[cs]e|licen[cs]ing|shop|pricing|add to cart|buy & try|try & buy)/i.test((a.innerText || "").trim())).map(a => a.href)[0] || null };
});
await pool(ids, 5, async id => {
  const f = d.fonts.find(x => x.foundryId === id && x.shotId) || { url: d.foundries.find(x => x.id === id).url, name: "(homepage)" };
  const ctx = await newContext(); const p = await ctx.newPage(); const rec = { font: f.name, url: f.url };
  try {
    await open(p, f.url); await p.evaluate(hideCookieBanners).catch(() => {}); await scrollAll(p); rec.page = await grab(p);
    if (rec.page.buyHref) { await open(p, rec.page.buyHref); await scrollAll(p); rec.buy = await grab(p); rec.buyUrl = rec.page.buyHref; }
  } catch (e) { rec.err = e.message.slice(0, 80); }
  await ctx.close(); out[id] = rec;
});
await browser.close();
for (const [id, r] of Object.entries(out)) {
  console.log(`\n## ${id} — ${r.font} ${r.err ? "ERR " + r.err : ""}`);
  if (r.page) console.log("  page: " + r.page.hits.join(" ¦ ").slice(0, 600) + (r.page.links.length ? "\n  links: " + r.page.links.join(", ") : ""));
  if (r.buy) console.log("  buy (" + r.buyUrl.replace(/^https?:\/\/[^/]+/, "") + "): " + r.buy.hits.join(" ¦ ").slice(0, 600));
}

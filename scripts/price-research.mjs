// Gather price evidence per foundry for hand review: font page, buy/licence pages, and after clicking a first option.
// node scripts/price-research.mjs out.json id1 id2 ...
import fs from "node:fs";
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { priceScan, hideCookieBanners } from "../crawler/snippets.mjs";
const [outFile, ...ids] = process.argv.slice(2);
const d = loadData(); const { browser, newContext } = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NOISE = /shipping|subtotal|newsletter|gift card|voucher|black friday|% off|sale on now|1234567890/i;
const result = {};

async function scanHere(p, where, bag) {
  await p.evaluate(hideCookieBanners).catch(() => {});
  const r = await p.evaluate(priceScan).catch(() => ({ prices: [], buy: [] }));
  for (const x of r.prices) if (!NOISE.test(x.ctx)) bag.push(`${x.cur}${x.num} @${where} «${x.ctx.slice(0, 120)}»`);
  // "from" phrases anywhere in the text, even split across elements
  const txt = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ")).catch(() => "");
  for (const m of txt.matchAll(/.{0,50}\b(from|starting at|starts at|ab|dès|à partir de|per style|per weight|single style|one style|1 style)\b.{0,50}/gi))
    if (/[$€£₪]|\b(usd|eur|chf|gbp|ils|nzd)\b/i.test(m[0]) && !NOISE.test(m[0])) bag.push(`TEXT @${where} «${m[0].trim()}»`);
  return r.buy;
}

async function clickFirstOption(p) {
  return p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const cand = [...document.querySelectorAll('input[type=checkbox], input[type=radio], button, [role=button], label, [role=option]')]
      .filter(vis).filter(e => /regular|book|roman|light|^\s*\d+\s*(user|computer|seat|employee)|desktop|select|add|choose/i.test(e.innerText || e.getAttribute("aria-label") || e.value || ""));
    const box = [...document.querySelectorAll('input[type=checkbox]')].filter(vis)[0];
    const el = cand[0] || box; if (!el) return null; el.click(); return (el.innerText || el.value || el.tagName).slice(0, 40);
  }).catch(() => null);
}

await pool(ids, 5, async id => {
  const bag = []; const fonts = d.fonts.filter(x => x.foundryId === id && x.scan === "done").slice(0, 2);
  const ctx = await newContext(); const p = await ctx.newPage();
  try {
    for (const f of fonts) {
      await open(p, f.url);
      let buys = await scanHere(p, "font", bag);
      const extra = await p.evaluate(() => [...document.querySelectorAll("a[href]")].filter(a => a.host === location.host && /^(buy|buy now|buy fonts?|purchase|licen[cs]e|licen[cs]ing|shop|pricing|prices|get (it|font)|add to cart|buy \/ try|try \/ buy)/i.test((a.innerText || "").trim()) && (a.innerText || "").trim().length < 30).map(a => a.href)).catch(() => []);
      for (const u of [...new Set([...buys, ...extra])].slice(0, 2)) {
        try { await open(p, u); await scanHere(p, "buy", bag); const c = await clickFirstOption(p); if (c) { await sleep(1800); await scanHere(p, "clicked:" + c, bag); } } catch {}
      }
      if (!buys.length && !extra.length) { const c = await clickFirstOption(p); if (c) { await sleep(1800); await scanHere(p, "clicked:" + c, bag); } }
      if (bag.length > 6) break;
    }
  } catch (e) { bag.push("ERR " + e.message); } finally { await ctx.close(); }
  result[id] = [...new Set(bag)].slice(0, 14);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
});
await browser.close();
console.log("done", Object.keys(result).length, "with evidence:", Object.values(result).filter(v => v.some(x => !x.startsWith("ERR"))).length);

// For each foundry: open 2 fonts (and their buy page if linked), scroll to the bottom, report the repeated per-style price.
// node scripts/price-repeat.mjs out.json id1 id2 ...
import fs from "node:fs";
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { repeatedPrice, hideCookieBanners, priceScan } from "../crawler/snippets.mjs";
const [outFile, ...ids] = process.argv.slice(2);
const d = loadData(); const { browser, newContext } = await launch(); const res = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scrollAll = async p => { for (let i = 0; i < 25; i++) { const end = await p.evaluate(() => { scrollBy(0, innerHeight); return innerHeight + scrollY >= document.body.scrollHeight - 5; }); await sleep(250); if (end && i > 3) break; } await sleep(800); };
await pool(ids, 5, async id => {
  const out = []; const ctx = await newContext(); const p = await ctx.newPage();
  for (const f of d.fonts.filter(x => x.foundryId === id && x.shotId).slice(0, 2)) {
    try {
      await open(p, f.url); await p.evaluate(hideCookieBanners).catch(() => {}); await scrollAll(p);
      let r = await p.evaluate(repeatedPrice), where = "page";
      if (!r) { const { buy } = await p.evaluate(priceScan); if (buy[0]) { await open(p, buy[0]); await scrollAll(p); r = await p.evaluate(repeatedPrice); where = "buy"; } }
      out.push({ font: f.name, where, ...(r || { price: null }) });
    } catch (e) { out.push({ font: f.name, err: e.message.slice(0, 60) }); }
  }
  await ctx.close(); res[id] = out; fs.writeFileSync(outFile, JSON.stringify(res, null, 1));
});
await browser.close(); console.log("done", Object.keys(res).length);

// Collect clear per-style price statements for each foundry (to pre-fill foundries.yaml by hand).
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { priceScan, hideCookieBanners } from "../crawler/snippets.mjs";
const CLEAR = /(styles?|weights?|fonts?)\s+(from|start(ing)? at)\s*[$€£₪]|(single|one|1|per|individual)\s+(style|weight|font|cut)|(from|starting at)\s*[$€£₪]\s?\d+\s*(per|\/)\s*(style|weight)/i;
const d = loadData(); const { browser, newContext } = await launch();
const out = {};
const targets = [];
for (const f of d.foundries.filter(f => f.kind !== "Library" && f.id !== "google-fonts")) {
  d.fonts.filter(x => x.foundryId === f.id && x.scan === "done" && !x.gf).slice(0, 2).forEach(x => targets.push([f.id, x.url]));
}
await pool(targets, 6, async ([fid, url]) => {
  const ctx = await newContext(); const p = await ctx.newPage();
  try {
    await open(p, url); await p.evaluate(hideCookieBanners).catch(() => {});
    let r = await p.evaluate(priceScan); const hits = r.prices.filter(x => CLEAR.test(x.ctx));
    if (!hits.length && r.buy[0]) { await open(p, r.buy[0]); const r2 = await p.evaluate(priceScan); hits.push(...r2.prices.filter(x => CLEAR.test(x.ctx)).map(x => ({ ...x, buy: true }))); }
    for (const h of hits.slice(0, 3)) (out[fid] ||= new Set()).add(`${h.cur}${h.num}${h.buy ? " (buy page)" : ""} «${h.ctx.slice(0, 110)}»`);
  } catch (e) {} finally { await ctx.close(); }
});
await browser.close();
for (const [k, v] of Object.entries(out)) console.log(`\n## ${k}\n  ` + [...v].slice(0, 3).join("\n  "));
console.log("\nfoundries with clear statements:", Object.keys(out).length, "of", new Set(targets.map(t => t[0])).size);

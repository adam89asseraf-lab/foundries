// Revisit captured pages and report any that are bot-block / challenge pages.
// node scripts/audit-blocks.mjs [--fonts-per-foundry N] [--apply]
//   --apply  marks blocked items scan:"failed" (retried after 7 days) and removes their screenshots
import { loadData, saveData, now } from "../crawler/lib/store.mjs";
import { launch, open, pool, removeShot } from "../crawler/lib/browser.mjs";
const argv = process.argv.slice(2);
const N = +(argv[argv.indexOf("--fonts-per-foundry") + 1] || 1);
const APPLY = argv.includes("--apply");
const d = loadData();
const items = [];
for (const f of d.foundries) if (f.scan === "done" && f.shotId) items.push({ kind: "home", rec: f, url: f.url });
const perF = {};
for (const x of d.fonts) if (x.scan === "done" && (perF[x.foundryId] = (perF[x.foundryId] || 0) + 1) <= N) items.push({ kind: "font", rec: x, url: x.url });
const { browser, newContext } = await launch();
const hits = [];
await pool(items, 6, async it => {
  const ctx = await newContext(); const p = await ctx.newPage();
  try { await open(p, it.url); }
  catch (e) { if (e.blocked) hits.push({ ...it, why: e.message }); }
  finally { await ctx.close(); }
});
await browser.close();
for (const h of hits) console.log(h.kind, h.rec.id, "→", h.why);
console.log(`${hits.length} blocked of ${items.length} checked`);
if (APPLY && hits.length) {
  for (const h of hits) {
    removeShot(h.rec.shotId); delete h.rec.shotId; delete h.rec.shotAt;
    Object.assign(h.rec, { scan: "failed", failReason: h.why, attemptAt: now() });
    if (h.kind === "font") // the rest of that foundry's fonts were shot from the same blocked site
      for (const x of d.fonts) if (x.foundryId === h.rec.foundryId && x.scan === "done") { removeShot(x.shotId); delete x.shotId; delete x.shotAt; Object.assign(x, { scan: "failed", failReason: h.why, attemptAt: now() }); }
  }
  d.updatedAt = now(); saveData(d); console.log("applied");
}

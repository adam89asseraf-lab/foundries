// Debug helper: print the link groups the discovery snippet sees for given foundry ids.
// node scripts/diag-discovery.mjs id1 id2 ...
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, pool } from "../crawler/lib/browser.mjs";
import { discoverLinks, hideCookieBanners } from "../crawler/snippets.mjs";
const d = loadData(); const { browser, newContext } = await launch();
await pool(process.argv.slice(2), 4, async id => {
  const f = d.foundries.find(x => x.id === id); const ctx = await newContext(); const p = await ctx.newPage();
  try {
    await open(p, f.catalogUrl || f.url); await p.evaluate(hideCookieBanners);
    for (let i = 0; i < 6; i++) { await p.evaluate(() => scrollBy(0, innerHeight * 2)); await new Promise(r => setTimeout(r, 300)); }
    const r = await p.evaluate(discoverLinks);
    const navTop = [...new Set(r.all.filter(l => l.u.split("/").length <= 4).map(l => l.u.replace(r.origin, "") + "|" + l.t.slice(0, 20)))].slice(0, 18);
    console.log(`\n## ${id} ${p.url()}\n groups: ` + r.groups.slice(0, 4).map(g => `${g.k}(${g.n}): ${g.links.slice(0, 3).map(l => l.u.replace(r.origin, "")).join(" ")}`).join(" || ") + `\n top-level: ${navTop.join(", ")}`);
  } catch (e) { console.log(`\n## ${id} ERR ${e.message}`); } finally { await ctx.close(); }
});
await browser.close();

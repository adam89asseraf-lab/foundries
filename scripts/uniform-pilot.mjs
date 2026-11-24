// Pilot: render uniform specimens for a few fonts into an output folder (doesn't touch data or public/shots).
// node scripts/uniform-pilot.mjs <outDir> id1 id2 ...
import fs from "node:fs"; import path from "node:path";
import sharp from "sharp";
import { loadData } from "../crawler/lib/store.mjs";
import { launch, open, prepare, pool } from "../crawler/lib/browser.mjs";
import { specimenHtml } from "../crawler/google-fonts.mjs";
import { SAMPLE, detectFace, renderUniform, fallbackGlyphs } from "../crawler/uniform.mjs";

const [out, ...ids] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const COLORS = { bg: "#ededea", ink: "#121214" };
const d = loadData(); const { browser, newContext } = await launch();
const report = [];
await pool(ids, 3, async id => {
  const f = d.fonts.find(x => x.id === id); if (!f) return report.push({ id, err: "no such font" });
  const ctx = await newContext(); const p = await ctx.newPage();
  try {
    if (f.gf) { await p.setContent(specimenHtml(f.gf), { waitUntil: "load", timeout: 45000 }); await p.waitForFunction(() => document.body.dataset.ready, null, { timeout: 20000 }).catch(() => {}); }
    else { await open(p, f.url); await prepare(p); }
    for (let i = 0; i < 4; i++) { await p.evaluate(() => { document.scrollingElement.scrollTop += innerHeight; }); await new Promise(r => setTimeout(r, 300)); } // lazy webfonts
    await p.evaluate(() => { document.scrollingElement.scrollTop = 0; });
    const cands = await p.evaluate(detectFace, f.name);
    if (!cands.length) return report.push({ id, err: "no custom font found" });
    // try each candidate face; keep the first that draws a whole sample (Hebrew first, then Latin, then Cyrillic) by itself
    const cdp = await ctx.newCDPSession(p); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    let face = null, k = null, fit = null;
    outer: for (const c of cands) for (const s of ["hebrew", "latin", "cyrillic"]) {
      fit = await p.evaluate(renderUniform, { face: c, sample: SAMPLE[s], colors: COLORS });
      if ((await fallbackGlyphs(cdp)) === 0) { face = c; k = s; break outer; }
    }
    if (!face) return report.push({ id, err: "no face draws a full sample: " + cands.map(c => c.fam).join(", ") });
    const sample = { k }, miss = [];
    await new Promise(r => setTimeout(r, 400));
    const png = await p.screenshot({ type: "png" });
    await sharp(png).resize(800, 500, { fit: "cover" }).webp({ quality: 82 }).toFile(path.join(out, id + ".webp"));
    report.push({ id, name: f.name, fam: face.fam, w: face.weight, named: face.named, script: sample.k, missing: miss.join(""), fit });
  } catch (e) { report.push({ id, err: e.message.slice(0, 120) }); } finally { await ctx.close(); }
});
await browser.close();
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
for (const r of report) console.log(r.err ? `✗ ${r.id}: ${r.err}` : `✓ ${r.id} → "${r.fam}" ${r.w}${r.named ? " (named)" : ""} [${r.script}]${r.missing ? " missing:" + r.missing : ""}`);

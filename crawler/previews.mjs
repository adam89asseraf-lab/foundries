// Your own sentence in paid fonts: draws queued sentences (Supabase table "previews") on each font's own
// page, in the webfont the uniform specimen found there, and uploads the picture to the public "previews" bucket.
// Started by GitHub (workflow previews.yml) when someone confirms a sentence on the Compare screen.
//   node crawler/previews.mjs [--max-minutes 8] [--idle 60]          needs SUPABASE_URL + SUPABASE_SERVICE_KEY
//   node crawler/previews.mjs --local "<font id>" "<sentence>"        draws one into /tmp, no Supabase
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadData } from "./lib/store.mjs";
import { launch, open, prepare } from "./lib/browser.mjs";
import { detectFace, fallbackGlyphs } from "./uniform.mjs";
import { frameSpecimen } from "./lib/specimen-frame.mjs";

const argv = process.argv.slice(2);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEADLINE = Date.now() + +opt("--max-minutes", 8) * 60000;
const IDLE = +opt("--idle", 60) * 1000;

const SUPA = (process.env.SUPABASE_URL || "https://lulglxebjchreghaexjd.supabase.co").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
const H = () => ({ apikey: KEY, Authorization: "Bearer " + KEY });
const rest = (p, o = {}) => fetch(SUPA + "/rest/v1/" + p, { ...o, headers: { ...H(), "Content-Type": "application/json", ...(o.headers || {}) } });

const data = loadData();
const fonts = new Map(data.fonts.map(f => [f.id, f]));

/** In page: the sentence alone, wrapped over up to 3 lines and as big as fits, in this face. */
async function renderSentence({ face, text }) {
  document.getElementById("__uni")?.remove();
  if (!document.documentElement.dataset.uni) {
    document.documentElement.dataset.uni = "1";
    // keep the page's font definitions: some sites (Dinamo) put their @font-face <style> tags in <body>
    try { document.querySelectorAll("body style, body link[rel~=stylesheet]").forEach(n => document.head.append(n)); } catch {}
    try { document.body.replaceChildren(); } catch {}
    for (const el of [document.documentElement, document.body]) for (const [k, v] of [["margin", "0"], ["padding", "0"], ["transform", "none"], ["filter", "none"], ["overflow", "hidden"], ["background", "#fff"]]) el.style.setProperty(k, v, "important");
  }
  const box = document.createElement("div"); box.id = "__uni";
  box.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#fff;color:#121214;display:flex;align-items:center;padding:0 7vw;box-sizing:border-box;overflow:hidden";
  box.dir = /[֐-׿؀-ۿ]/.test(text) ? "rtl" : "ltr";
  const h = document.createElement("div"); h.id = "__uni_h"; h.textContent = text;
  const fams = (face.stack || [face.fam]).map(f => `"${f}"`).join(",");
  h.style.cssText = `font-family:${fams},serif;font-weight:${face.weight || 400};font-style:${face.style === "italic" ? "italic" : "normal"};font-synthesis:none;font-variation-settings:normal;font-feature-settings:normal;text-transform:none;letter-spacing:0;line-height:1.08;width:100%;overflow-wrap:anywhere;margin:0`;
  const b = document.createElement("div"); b.id = "__uni_b"; // empty: fallbackGlyphs checks both ids
  box.append(h, b); document.documentElement.append(box);
  try { await document.fonts.load(`${face.weight || 400} 80px ${fams}`, text); } catch {}
  await document.fonts.ready;
  // biggest size that keeps it within 3 lines and the screen
  const lh = s => { h.style.fontSize = s + "px"; return h.getBoundingClientRect().height; };
  let lo = 10, hi = 400;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; (lh(m) <= Math.min(innerHeight * 0.8, m * 1.08 * 3 + 2) && h.scrollWidth <= h.clientWidth + 1) ? lo = m : hi = m; }
  lh(lo);
  return lo;
}

async function drawOne(ctx, cdp, page, font, text) {
  if (!font.uniformFace) throw new Error("no webfont found for this font");
  await open(page, font.url); await prepare(page);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { document.scrollingElement.scrollTop += innerHeight; }); await sleep(250); }
  const cands = await page.evaluate(detectFace, font.name);
  const c = cands.find(c => c.fam === font.uniformFace) || { fam: font.uniformFace, weight: "400", style: "normal" };
  await page.evaluate(renderSentence, { face: c, text });
  await sleep(250);
  const miss = await fallbackGlyphs(cdp);
  if (miss) throw new Error(miss === Infinity ? "couldn't draw on this page" : "this font is missing some of these characters");
  const shot = await page.screenshot({ type: "png" });
  return (await frameSpecimen(shot, { dir: /[֐-׿؀-ۿ]/.test(text) ? "rtl" : "ltr" })).full; // 1600×640, sharp in the full-screen viewer too
}

async function upload(id, buf) {
  const name = id + ".webp";
  const r = await fetch(`${SUPA}/storage/v1/object/previews/${name}`, { method: "POST", headers: { ...H(), "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "max-age=31536000" }, body: buf });
  if (!r.ok) throw new Error("upload " + r.status + " " + (await r.text()).slice(0, 100));
  return `${SUPA}/storage/v1/object/public/previews/${name}`;
}

const { browser, newContext } = await launch();
try {
  if (argv[0] === "--local") {
    const [, id, text] = argv; const font = fonts.get(id); if (!font) throw new Error("unknown font " + id);
    const ctx = await newContext(); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const buf = await drawOne(ctx, cdp, page, font, text);
    const out = path.join(os.tmpdir(), "preview-" + id + ".webp"); fs.writeFileSync(out, buf); log("wrote", out);
    await ctx.close();
  } else {
    if (!KEY) throw new Error("SUPABASE_SERVICE_KEY is not set");
    let quietSince = Date.now(), done = 0, failed = 0;
    while (Date.now() < DEADLINE) {
      const r = await rest("previews?status=eq.queued&select=id,font_id,body&order=created_at&limit=12");
      if (!r.ok) throw new Error("queue " + r.status + " " + (await r.text()).slice(0, 120));
      const rows = await r.json();
      if (!rows.length) { if (Date.now() - quietSince > IDLE) break; await sleep(4000); continue; }
      quietSince = Date.now();
      // several at once, one page each
      await Promise.all(rows.map(async row => {
        const ctx = await newContext(); const page = await ctx.newPage();
        let patch;
        try {
          const font = fonts.get(row.font_id); if (!font) throw new Error("unknown font");
          const cdp = await ctx.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
          const image = await upload(row.id, await drawOne(ctx, cdp, page, font, row.body));
          patch = { status: "done", image, error: null }; done++; log("  ✓", row.font_id);
        } catch (e) {
          patch = { status: "failed", error: String(e.message).slice(0, 120) }; failed++; log("  ✗", row.font_id, e.message.slice(0, 80));
        } finally { await ctx.close(); }
        await rest("previews?id=eq." + row.id, { method: "PATCH", body: JSON.stringify({ ...patch, done_at: new Date().toISOString() }) });
      }));
    }
    log(`previews: ${done} drawn, ${failed} failed`);
  }
} finally { await browser.close(); }

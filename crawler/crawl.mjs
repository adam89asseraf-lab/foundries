#!/usr/bin/env node
// Foundries crawler.
//   node crawler/crawl.mjs [--homepages] [--discover] [--capture] [--release-check]
//                          [--limit N] [--only id[,id]] [--max-minutes M] [--concurrency 4]
// With no phase flags it runs homepages + discover + capture (the nightly incremental run).
import fs from "node:fs";
import path from "node:path";
import { loadData, saveData, forSave, dump, loadYamlDoc, yamlEntries, merge, clearRescanFlags, slugify, now, ROOT } from "./lib/store.mjs";
import { launch, open, prepare, shoot, writeShot, writeImageShot, removeShot, pool } from "./lib/browser.mjs";
import { typeSnippet, qualityCheck, scrollToTypeTester, discoverLinks, pageText, finishAnimations, hideCookieBanners, coverImage } from "./snippets.mjs";
import { categorise, categoriseWithHaiku, CATS } from "./categorise.mjs";
import { googleFamilies, specimenHtml, googleFontRecord } from "./google-fonts.mjs";

/* ---------- args ---------- */
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PHASES = { homepages: flag("--homepages"), discover: flag("--discover"), capture: flag("--capture"), release: flag("--release-check") };
if (!Object.values(PHASES).some(Boolean)) PHASES.homepages = PHASES.discover = PHASES.capture = true;
const LIMIT = +opt("--limit", Infinity);
const ONLY = opt("--only", "").split(",").map(s => s.trim()).filter(Boolean);
const DEADLINE = Date.now() + +opt("--max-minutes", 9999) * 60000;
const CONC = +opt("--concurrency", 4);
const RETRY_DAYS = 7;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const timeUp = () => Date.now() > DEADLINE;
const olderThan = (iso, days) => !iso || Date.now() - Date.parse(iso) > days * 864e5;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- load + merge ---------- */
const data = loadData();
const baseline = dump(forSave({ ...data, updatedAt: null }));
const entries = yamlEntries(loadYamlDoc());
const { rescans, removed, removedFonts } = merge(data, entries);
for (const x of removedFonts) removeShot(x.shotId || `fonts/${x.id}`); // a foundry taken off the list takes its font shots with it
data.repo = process.env.GITHUB_REPOSITORY || data.repo || null;
for (const id of removed) { removeShot(id); log("removed", id); }
for (const id of rescans) {
  for (const f of data.fonts) if (f.foundryId === id) f.scan = "queued";
  log("rescan", id);
}
const matchOnly = id => !ONLY.length || ONLY.some(o => id === o || id.startsWith(o));
const foundries = data.foundries.filter(f => matchOnly(f.id) && !f.cfg?.skip);
const byId = new Map(data.foundries.map(f => [f.id, f]));

// Only write (and bump updatedAt) when something real changed, so idle runs don't commit.
const body = d => dump(forSave({ ...d, updatedAt: null }));
let lastBody = baseline;
let dirty = 0;
const save = (force = false) => {
  if (force || ++dirty % 25 === 0) {
    const b = body(data);
    if (b === lastBody) return;
    lastBody = b;
    data.updatedAt = now();
    if (saveData(forSave(data))) log("saved data.json");
  }
};
save(true);
clearRescanFlags(rescans); // the rescan is now recorded in data.json, so the YAML flag is done

const stats = { homepages: 0, homeFailed: 0, discovered: 0, newFonts: 0, captured: 0, low: 0, fontFailed: 0 };
const { browser, newContext } = await launch();

/* ---------- homepages ---------- */
async function homepages() {
  const due = foundries.filter(f => f.scan === "pending" || f.rescan || (f.scan === "failed" && olderThan(f.attemptAt, RETRY_DAYS))).slice(0, LIMIT);
  log(`homepages: ${due.length} due`);
  await pool(due, CONC, async f => {
    if (timeUp()) return;
    const ctx = await newContext(); const page = await ctx.newPage();
    try {
      await open(page, f.url);
      await prepare(page);
      await page.evaluate(() => { try { window.scrollTo(0, 0); } catch (e) { document.scrollingElement.scrollTop = 0; } });
      await sleep(300);
      await writeShot(await shoot(page), f.id);
      Object.assign(f, { scan: "done", shotId: f.id, shotAt: now(), scannedAt: now(), scannedUrl: f.url, attemptAt: now() });
      delete f.failReason;
      stats.homepages++; log("  ✓ home", f.id);
    } catch (e) {
      Object.assign(f, { scan: "failed", failReason: String(e.message).slice(0, 120), attemptAt: now(), scannedUrl: f.url });
      stats.homeFailed++; log("  ✗ home", f.id, e.message);
    } finally { await ctx.close(); save(); }
  });
}

/* ---------- catalogue discovery ---------- */
const KW = /font|type|famil|product|collection|catalog|retail|fonderie|^l$|(^|\/)(l|shop|store|p)(\/|\*|$)/i;
const EXCL = /trial|licen[cs]e|eula|blog|journal|news|gift|merch|cart|checkout|account|log-?in|sign-?in|about|contact|faq|terms|privacy|shipping|in-use|cookie|support|newsletter|press|jobs|career|imprint|impressum|legal|refund|apparel|t-shirt|tote|poster-shop|specimen-pdf|\.(zip|pdf)$/i;
const BUNDLE = /bundle|collection-pack|complete-family-pack|\bpack\b/i;
// top-level pages that are site sections, not fonts
const NAV = /^(home|index|about|studio|customs?|contact|info|information|shop|shop-new|store|typefaces|fonts|type|trials?|trial-fonts|licen[cs]es?|licensing|eula|faqs?|privacy|privacy-policy|terms.*|cart|basket|bag|account|login|dashboard|checkout|work|projects|services|research|journal|blog|news|editorial|press.*|designers|articles|legal.*|editor|wiki|inuse|fontsinuse|fonts?-in-use|font-in-use|mockups|branding|free-fonts|type-tester|tester|tips|technical-specifications|irregular|disclaimer|imprint|search|newsletter|events|students|hardware|client-work|customize-fonts|collections|pages|products|downloads?|team|people|specimens?|catalogue|catalog|library|retail|[a-z]{2}(-[a-z]{2})?)$/i;

function pickFonts(r, cfg) {
  const excl = (cfg.exclude || []).map(s => new RegExp(s, "i"));
  const bad = l => { const p = new URL(l.u).pathname; return EXCL.test(p) || EXCL.test(l.t) || excl.some(re => re.test(l.u) || re.test(l.t)); };
  const dedupe = ls => { const seen = new Set(); return ls.filter(l => !seen.has(l.u) && seen.add(l.u)); };
  let links = [];
  if (cfg.fontLinkPattern) {
    const re = new RegExp(cfg.fontLinkPattern, "i");
    links = dedupe(r.all.filter(l => re.test(l.u)));
  } else {
    const kwGroups = r.groups.filter(g => KW.test(g.k) && !EXCL.test(g.k));
    const best = gs => gs.filter(g => g.links.some(l => !bad(l))).sort((a, b) => b.n - a.n)[0];
    // 1) parent-path group with a font-ish name, 2) same for /a/<id>/<slug> prefixes,
    // 3) fonts living at top-level paths (/gela, /sk_saturnika), 4) a lone product page
    const top = dedupe(r.all.filter(l => { const p = new URL(l.u).pathname.split("/").filter(Boolean); return p.length === 1 && !NAV.test(p[0]); }));
    const g = best(kwGroups.filter(g => !g.k.endsWith("/*") && g.n >= 2)) || best(kwGroups.filter(g => g.k.endsWith("/*") && g.n >= 2));
    if (g) links = g.links;
    else if (top.filter(l => !bad(l)).length >= 3) links = top;
    else { const one = best(kwGroups.filter(g => !g.k.endsWith("/*"))); if (one) links = one.links; }
  }
  links = links.filter(l => !bad(l));
  const nonBundle = links.filter(l => !BUNDLE.test(new URL(l.u).pathname) && !BUNDLE.test(l.t));
  return nonBundle.length ? nonBundle : links; // keep bundles only if bundles are all there is
}

const safeDecode = s => { try { return decodeURIComponent(s); } catch { return s; } };
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0; return h.toString(36); };
const CTA = /^(explore|view|buy|shop|more|discover|see|try|details|learn more|read more|open|go|font|fonts|typeface|new)$/i;
function nameFor(text, slug) {
  const words = String(text || "").replace(/[→↗›»]/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && /^\d+$/.test(words[0])) words.shift(); // "6 Cyan Mono", catalogue ids
  slug = slug.replace(/^\d{4,}-/, "");
  // shortest leading run of words whose slug ends with the URL slug ("ABC Areal Explore" + areal -> "ABC Areal")
  for (let k = 1; k <= Math.min(words.length, 8); k++) {
    const s = slugify(words.slice(0, k).join(" "));
    if (s === slug || s.endsWith("-" + slug) || s === slug.replace(/\d+$/, "")) return words.slice(0, k).join(" ");
  }
  const t = words.join(" ");
  // Hebrew/Arabic/Cyrillic names: use the link text when the URL isn't Latin, or when the text also carries
  // a Latin word from the URL ("ראפידה Rapida" for /rapidaheblatar). Skip glyph samples like "א".
  if (t && t.length >= 3 && t.length <= 40 && /[\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]{2,}/.test(t) && !CTA.test(t)) {
    const latin = (t.match(/[A-Za-z]{3,}/g) || []).map(w => w.toLowerCase());
    if (/^x[0-9a-z]+$/.test(slug) || latin.some(w => slug.replace(/-/g, "").includes(w))) return t;
  }
  const slugIsWordy = /[a-z]{3,}/.test(slug) && !/^x[0-9a-z]+$/.test(slug);
  if (t && t.length <= 32 && /\p{L}/u.test(t) && !CTA.test(t) && !slugIsWordy) return t;
  return slug.replace(/[_-]+/g, " ").replace(/\d+$/, "").trim().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function discoverOne(page, f) {
  const start = f.cfg?.catalogUrl || f.catalogUrl || f.url;
  const tryUrl = async url => {
    await open(page, url);
    await page.evaluate(hideCookieBanners).catch(() => {});
    for (let i = 0; i < 8; i++) { await page.evaluate(() => window.scrollBy(0, innerHeight * 2)); await sleep(350); } // lazy lists
    return page.evaluate(discoverLinks);
  };
  let r = await tryUrl(start), url = start;
  let picked = pickFonts(r, f.cfg || {});
  if (!picked.length && !f.cfg?.catalogUrl) {
    const nav = r.nav.find(n => n.u.startsWith(r.origin) && n.u.replace(/\/$/, "") !== start.replace(/\/$/, ""));
    if (nav) { url = nav.u; r = await tryUrl(url); picked = pickFonts(r, f.cfg || {}); }
  }
  if (!picked.length && !f.cfg?.catalogUrl && r.shopify) { url = r.origin + "/collections/all"; r = await tryUrl(url); picked = pickFonts(r, f.cfg || {}); }
  return { url, links: picked };
}

/** Add newly seen links as fonts. Returns the new font records. */
function addFonts(f, links, markNew) {
  // URLs already listed under any foundry (e.g. a "Display" sub-shop entry overlapping the main shop) aren't added twice
  const key = u => u.replace(/\/$/, "").toLowerCase();
  const have = new Set(data.fonts.map(x => key(x.url)));
  const ids = new Set(data.fonts.map(x => x.id));
  let order = Math.max(0, ...data.fonts.filter(x => x.foundryId === f.id).map(x => x.order || 0));
  const added = [];
  for (const l of links) {
    const u = l.u.replace(/\/$/, "");
    if (have.has(key(u))) continue;
    // Hebrew/Cyrillic/etc. paths slugify to nothing: fall back to a short stable hash of the URL
    let slug = slugify(safeDecode(u.split("/").pop())) || slugify(l.t);
    if (!slug) slug = "x" + hash(u);
    let id = `${f.id}--${slug}`, n = 2;
    while (ids.has(id)) id = `${f.id}--${slug}-${n++}`;
    const ov = f.cfg?.fonts?.[slug] || {};
    if (ov.skip) continue;
    const font = { id, foundryId: f.id, name: ov.name || nameFor(l.t, slug), url: l.u, order: ++order, addedAt: now(), scan: "queued", listText: l.t.slice(0, 120) };
    if (markNew) font.newSince = now();
    data.fonts.push(font); ids.add(id); have.add(key(u)); added.push(font);
  }
  return added;
}

async function discover(release = false) {
  const due = foundries.filter(f => {
    if (f.kind === "Library") return false;
    if (f.kind === "Typeface") return !data.fonts.some(x => x.foundryId === f.id);
    if (release) return !!f.catalogCheckedAt && f.catalog !== "none";
    return !f.catalogCheckedAt && olderThan(f.discoverAttemptAt, f.discoverFailed ? RETRY_DAYS : 0);
  }).slice(0, release ? Infinity : LIMIT);
  log(`${release ? "release check" : "discovery"}: ${due.length} due`);
  const report = [];
  await pool(due, CONC, async f => {
    if (timeUp()) return;
    if (f.kind === "Typeface") {
      const added = addFonts(f, [{ u: f.url, t: f.name }], false);
      added.forEach(x => { x.name = f.name; delete x.listText; });
      f.catalog = "listed"; f.catalogCheckedAt = now(); f.typefaces = [f.name];
      stats.newFonts += added.length; save(); return;
    }
    if (f.cfg?.source === "google-fonts") {
      try {
        const fams = await googleFamilies({ limit: f.cfg.limit || 300 });
        const have = new Set(data.fonts.filter(x => x.foundryId === f.id).map(x => x.url));
        let order = Math.max(0, ...data.fonts.filter(x => x.foundryId === f.id).map(x => x.order || 0));
        const wasChecked = !!f.catalogCheckedAt, added = [];
        for (const g of fams) {
          if (have.has(g.u)) continue;
          const id = `${f.id}--${slugify(g.family)}`;
          if (f.cfg?.fonts?.[slugify(g.family)]?.skip) continue;
          const rec = googleFontRecord(f, g, id, ++order, release && wasChecked);
          data.fonts.push(rec); added.push(rec);
        }
        Object.assign(f, { catalog: "listed", catalogUrl: "https://fonts.google.com/metadata/fonts", catalogCheckedAt: now(), discoverAttemptAt: now() });
        f.typefaces = data.fonts.filter(x => x.foundryId === f.id).map(x => x.name);
        const fresh = added.filter(x => x.newSince);
        if (fresh.length) { f.newReleases = fresh.map(x => x.name); f.newSince = now(); report.push({ f, added: fresh }); }
        stats.discovered++; stats.newFonts += added.length;
        log(`  ✓ google fonts: ${fams.length} families, ${added.length} new`);
      } catch (e) { Object.assign(f, { discoverAttemptAt: now(), discoverFailed: String(e.message).slice(0, 120) }); log("  ✗ google fonts", e.message); }
      save(); return;
    }
    const ctx = await newContext(); const page = await ctx.newPage();
    try {
      const { url, links } = await discoverOne(page, f);
      const wasChecked = !!f.catalogCheckedAt;
      if (f.rescan && links.length) { // a rescan drops fonts that are no longer in the catalogue
        const keep = new Set(links.map(l => l.u.replace(/\/$/, "")));
        for (const x of data.fonts.filter(x => x.foundryId === f.id && !keep.has(x.url.replace(/\/$/, "")))) removeShot(x.shotId || `fonts/${x.id}`);
        data.fonts = data.fonts.filter(x => x.foundryId !== f.id || keep.has(x.url.replace(/\/$/, "")));
      }
      const added = addFonts(f, links, release && wasChecked);
      Object.assign(f, { catalog: links.length ? "listed" : "none", catalogUrl: links.length ? url : f.catalogUrl, catalogCheckedAt: now(), discoverAttemptAt: now() });
      delete f.discoverFailed;
      f.typefaces = data.fonts.filter(x => x.foundryId === f.id).map(x => x.name);
      if (release && wasChecked && added.length) {
        f.newReleases = added.map(x => x.name); f.newSince = now();
        report.push({ f, added });
      }
      stats.discovered++; stats.newFonts += added.length;
      log(`  ✓ ${release ? "check" : "catalogue"} ${f.id}: ${links.length} fonts${added.length ? `, ${added.length} new` : ""}`);
    } catch (e) {
      Object.assign(f, { discoverAttemptAt: now(), discoverFailed: String(e.message).slice(0, 120) });
      log("  ✗ catalogue", f.id, e.message);
    } finally { await ctx.close(); save(); }
  });
  if (release && report.length) {
    const md = [`New releases found ${new Date().toISOString().slice(0, 10)}:`, ""];
    for (const { f, added } of report) {
      md.push(`### ${f.name}`);
      added.forEach(x => md.push(`- [${x.name}](${x.url})`));
      md.push("");
    }
    fs.writeFileSync(path.join(ROOT, "release-report.md"), md.join("\n"));
    log(`release report: ${report.reduce((n, r) => n + r.added.length, 0)} new fonts`);
  }
}

/* ---------- font capture ---------- */
// Shops where the font only exists as artwork in the product image (live text is the shop's own UI font).
// Per foundry in foundries.yaml: `capture: image` to use the cover image, `capture: page` to force a page shot.
const NOT_FONT = /\b(icons?|icon set|mockups?|templates?|presets?|brush(es)?|textures?|lightroom|procreate|stickers?|illustrations?|ui kit|wallpapers?|logos?|patterns?|luts?|app kit|ui kit|website|landing page)\b/i;
const IMAGE_HOSTS = /(^|\.)gumroad\.com$/i;
const wantsCover = (font, f) => f.cfg?.capture === "image" || (f.cfg?.capture !== "page" && IMAGE_HOSTS.test(new URL(font.url).hostname));

async function captureCover(page, font) {
  const c = await page.evaluate(coverImage).catch(() => null);
  if (!c?.src) return false;
  const res = await page.request.get(c.src, { timeout: 30000 }).catch(() => null);
  if (!res?.ok() || !/^image\//.test(res.headers()["content-type"] || "")) return false;
  await writeImageShot(await res.body(), `fonts/${font.id}`);
  return true;
}

async function captureGoogle(page, font) {
  await page.setContent(specimenHtml(font.gf), { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 20000 }).catch(() => {});
  const ok = await page.evaluate(() => document.body.dataset.ready === "1");
  await sleep(300);
  await writeShot(await shoot(page), `fonts/${font.id}`);
  const g = font.gf;
  Object.assign(font, { shotId: `fonts/${font.id}`, shotAt: now(), scan: "done", attemptAt: now(), shot: "specimen", free: true,
    category: f_override(font) || g.category || font.category, styles: g.styles, ...(g.variable ? { variable: true } : {}) });
  if (!g.category && !font.category) delete font.category;
  if (ok) { delete font.quality; delete font.qualityNote; } else { font.quality = "low"; font.qualityNote = "webfont did not load"; }
  delete font.failReason;
  return { ok, score: ok ? 9 : 1, reasons: ok ? [] : ["webfont did not load"] };
}
const f_override = font => byId.get(font.foundryId)?.cfg?.fonts?.[font.id.split("--").slice(1).join("--")]?.category;

async function captureOne(page, font, f) {
  if (font.gf) return captureGoogle(page, font);
  await open(page, font.url);
  await prepare(page);
  if (wantsCover(font, f) && await captureCover(page, font)) return finishFont(page, font, f, { ok: true, score: 9, reasons: [], cover: true });
  await page.evaluate(typeSnippet);
  await sleep(900);
  await page.evaluate(finishAnimations).catch(() => {});
  let best = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    const q = await page.evaluate(qualityCheck);
    const png = await shoot(page);
    if (!best || q.score > best.q.score) best = { png, q };
    if (q.ok) break;
    if (attempt < 3) { await page.evaluate(() => window.scrollBy(0, 650)); await sleep(900); await page.evaluate(finishAnimations).catch(() => {}); }
  }
  if (!best.q.ok && await page.evaluate(scrollToTypeTester)) {
    await sleep(900);
    const q = await page.evaluate(qualityCheck);
    const png = await shoot(page);
    if (q.score > best.q.score) best = { png, q };
  }
  await writeShot(best.png, `fonts/${font.id}`);
  return finishFont(page, font, f, best.q);
}

async function finishFont(page, font, f, q) {
  const best = { q };
  const text = await page.evaluate(pageText).catch(() => ({ title: "", h1: "", head: "", body: "" }));
  const slug = font.id.split("--").slice(1).join("--");
  const ov = f.cfg?.fonts?.[slug] || {};
  const h = (text.h1 || "").trim(), hs = slugify(h);
  if (!ov.name && h && h.length <= 48 && (hs === slug || hs.endsWith("-" + slug) || hs === slugify(font.name))) font.name = h; // nicer casing/diacritics/prefix
  if (q.cover) {
    const title = h || text.title.split(/[|–—-]/)[0].trim();
    // shop pages sell more than fonts: a font page talks about fonts (Bueno: "OTF, TTF, WOFF…"), a template page doesn't
    const fonty = /\b(fonts?|typefaces?|glyphs?|otf|ttf|woff2?|opentype|ligatures?)\b/i.test(title + "\n" + text.head + "\n" + text.body);
    if (!fonty || (NOT_FONT.test(title) && !/\b(font|typeface|type family)\b/i.test(title))) {
      removeShot(`fonts/${font.id}`);
      for (const k of ["shotId", "shotAt", "shot", "quality", "qualityNote"]) delete font[k];
      Object.assign(font, { scan: "excluded", failReason: "not a font: " + title.slice(0, 60), attemptAt: now() });
      return { ok: true, score: 0, reasons: [], excluded: true };
    }
    const clean = title.replace(/\s+(typeface|font family|font|type family)\b.*$/i, "").trim();
    if (!ov.name && clean && clean.length <= 40) font.name = clean;
  }
  const c = categorise({ ...text, name: font.name, listText: font.listText });
  let category = c.category;
  if (!category) category = await categoriseWithHaiku({ ...text, name: font.name, listText: font.listText });
  Object.assign(font, {
    shotId: `fonts/${font.id}`, shotAt: now(), scan: "done", attemptAt: now(), ...(q.cover ? { shot: "image" } : {}),
    category: ov.category || category || font.category || null,
    styles: ov.styles ?? c.styles ?? font.styles ?? null,
    variable: ov.variable ?? (c.variable || !!font.variable),
    free: ov.free ?? c.free ?? font.free ?? null,
  });
  if (best.q.ok) { delete font.quality; delete font.qualityNote; }
  else { font.quality = "low"; font.qualityNote = best.q.reasons.join("; "); }
  for (const k of ["styles", "free", "category"]) if (font[k] == null) delete font[k];
  if (!font.variable) delete font.variable;
  if (!q.cover) delete font.shot;
  delete font.failReason;
  return best.q;
}

async function capture() {
  const ids = new Set(foundries.map(f => f.id));
  const due = data.fonts.filter(x => ids.has(x.foundryId) && (x.scan === "queued" || (x.scan === "failed" && olderThan(x.attemptAt, RETRY_DAYS))))
    .sort((a, b) => (byId.get(a.foundryId).order - byId.get(b.foundryId).order) || (a.order - b.order))
    .slice(0, LIMIT);
  log(`capture: ${due.length} fonts due`);
  const groups = [...due.reduce((m, x) => m.set(x.foundryId, [...(m.get(x.foundryId) || []), x]), new Map()).values()];
  await pool(groups, CONC, async list => {
    const f = byId.get(list[0].foundryId);
    const ctx = await newContext(); const page = await ctx.newPage();
    try {
      for (const font of list) {
        if (timeUp()) return;
        try {
          const q = await captureOne(page, font, f);
          if (q.excluded) { log(`  – ${font.id} skipped (${font.failReason})`); continue; }
          stats.captured++; if (!q.ok) stats.low++;
          log(`  ✓ ${font.id} ${font.category || "?"}${font.styles ? " " + font.styles + "st" : ""}${font.variable ? " VF" : ""}${q.ok ? "" : " [low: " + q.reasons.join(", ") + "]"}`);
        } catch (e) {
          Object.assign(font, { scan: "failed", failReason: String(e.message).slice(0, 120), attemptAt: now() });
          stats.fontFailed++; log("  ✗", font.id, e.message);
          if (e.blocked) { list.filter(x => x.scan === "queued").forEach(x => Object.assign(x, { scan: "failed", failReason: e.message, attemptAt: now() })); return; }
        } finally { save(); }
      }
    } finally { await ctx.close(); }
  });
}

/* ---------- run ---------- */
try {
  if (PHASES.release) await discover(true);
  if (PHASES.homepages) await homepages();
  if (PHASES.discover) await discover(false);
  if (PHASES.capture) await capture();
} finally {
  await browser.close();
  save(true);
  const q = data.fonts.filter(x => x.scan === "queued").length;
  log("done", JSON.stringify(stats), `· fonts total ${data.fonts.length}, queued ${q}`, timeUp() ? "· stopped at time budget" : "");
}

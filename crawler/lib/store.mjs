// data.json + foundries.yaml: loading, merging, saving.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA = path.join(ROOT, "data/data.json");
export const YAML_FILE = path.join(ROOT, "foundries.yaml");
export const SHOTS = path.join(ROOT, "public/shots");

// Fields that foundries.yaml owns. Everything else in data.json belongs to the crawler.
export const USER_FIELDS = ["name", "by", "url", "kind", "tags", "note", "order", "addedAt"];

// "Basic price per weight", set by hand in foundries.yaml: `price: 60 USD`, `price: free`, or per font under `fonts:`.
// USD rates are rough and only used for sorting; the page shows the foundry's own currency.
const USD = { USD: 1, EUR: 1.08, GBP: 1.27, CHF: 1.12, ILS: 0.27, NZD: 0.6, AUD: 0.65, CAD: 0.73, SEK: 0.095, DKK: 0.145, NOK: 0.093, JPY: 0.0067 };
const SYM = { "$": "USD", "€": "EUR", "£": "GBP", "₪": "ILS", "¥": "JPY" };
export function parsePrice(v) {
  if (v == null || v === "") return null;
  if (v === 0 || /^\s*(free|0)\s*$/i.test(String(v))) return { amount: 0, currency: "USD", usd: 0 };
  let amount, currency;
  if (typeof v === "object") ({ amount, currency } = v);
  else {
    const m = String(v).trim().match(/^([$€£₪¥])?\s*(\d+(?:[.,]\d{1,2})?)\s*([A-Za-z]{3})?$/);
    if (!m) throw new Error(`foundries.yaml: can't read price "${v}" (use e.g. "60 USD", "€45" or "free")`);
    amount = parseFloat(m[2].replace(",", ".")); currency = (m[3] || SYM[m[1]] || "USD").toUpperCase();
  }
  if (!USD[currency]) throw new Error(`foundries.yaml: unknown currency "${currency}" in price`);
  return { amount, currency, usd: Math.round(amount * USD[currency]) };
}
export const KINDS = ["Foundry", "Typeface", "Library"];

export const now = () => new Date().toISOString();
export const slugify = s => String(s || "")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* ---------- data.json: one record per line, so git diffs stay small ---------- */
export function dump(d) {
  const L = ["{" + ["updatedAt", "repo"].map(k => JSON.stringify(k) + ":" + JSON.stringify(d[k] ?? null)).join(",") + ","];
  for (const k of ["foundries", "fonts"]) {
    const rs = d[k] || [];
    L.push(`"${k}":[`);
    rs.forEach((r, i) => L.push(JSON.stringify(r) + (i < rs.length - 1 ? "," : "")));
    L.push(k === "foundries" ? "]," : "]}");
  }
  return L.join("\n") + "\n";
}
export function loadData() {
  if (!fs.existsSync(DATA)) return { updatedAt: null, repo: null, foundries: [], fonts: [] };
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}
let lastSaved = null;
export function saveData(d) {
  const out = dump(d);
  if (out === lastSaved) return false;
  const tmp = DATA + ".tmp";
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, DATA);
  lastSaved = out;
  return true;
}

/* ---------- foundries.yaml ---------- */
export function loadYamlDoc() {
  return YAML.parseDocument(fs.readFileSync(YAML_FILE, "utf8"));
}
export function yamlEntries(doc) {
  const js = doc.toJS() || {};
  const list = Array.isArray(js) ? js : (js.foundries || []);
  const seen = new Set();
  return list.map((e, i) => {
    if (!e || !e.url) throw new Error(`foundries.yaml entry #${i + 1} has no url`);
    const id = String(e.id || slugify(e.name) || slugify(host(e.url)));
    if (seen.has(id)) throw new Error(`foundries.yaml: duplicate id "${id}"`);
    seen.add(id);
    return { ...e, id, kind: KINDS.includes(e.kind) ? e.kind : "Foundry", tags: (e.tags || []).map(String), order: e.order ?? i + 1 };
  });
}

/** Clear `rescan: true` flags in the YAML once handled, keeping comments and formatting. */
export function clearRescanFlags(ids) {
  if (!ids.length) return;
  const doc = loadYamlDoc();
  const seq = doc.get("foundries");
  for (const item of seq.items) {
    const id = item.get("id");
    if (ids.includes(id)) item.delete("rescan");
  }
  fs.writeFileSync(YAML_FILE, doc.toString({ lineWidth: 0 }));
}

/**
 * Merge foundries.yaml on top of data.json, the way the old page merged db edits.
 * Returns { data, rescans: [ids], removed: [ids] }.
 */
export function merge(data, entries) {
  const byId = new Map(data.foundries.map(f => [f.id, f]));
  const out = [], rescans = [];
  for (const e of entries) {
    const cur = byId.get(e.id) || { id: e.id, scan: "pending", typefaces: [], newReleases: [] };
    const urlChanged = cur.scannedUrl && cur.scannedUrl !== e.url;
    for (const k of USER_FIELDS) if (e[k] !== undefined) cur[k] = e[k];
    if (!cur.addedAt) cur.addedAt = now();
    // crawl settings from YAML (not shown on the page, but the crawler reads them from here)
    cur.cfg = pick(e, ["catalogUrl", "fontLinkPattern", "exclude", "skip", "fonts", "capture", "source", "limit", "includeNew", "include"]);
    if (e.rescan || urlChanged) {
      rescans.push(e.id);
      cur.scan = "pending"; cur.catalogCheckedAt = null; cur.rescan = true;
    }
    out.push(cur);
    byId.delete(e.id);
  }
  // prices: font override > foundry price
  const cfgById = new Map(out.map(f => [f.id, f]));
  for (const f of out) { const p = parsePrice(entries.find(e => e.id === f.id)?.price); if (p) f.price = p; else delete f.price; }
  for (const x of data.fonts) {
    const fd = cfgById.get(x.foundryId); if (!fd) continue;
    const ov = fd.cfg?.fonts?.[x.id.split("--").slice(1).join("--")]?.price;
    const p = ov != null ? parsePrice(ov) : fd.price || null;
    if (p) x.price = p; else delete x.price;
  }
  const removed = [...byId.keys()];
  const removedFonts = data.fonts.filter(f => removed.includes(f.foundryId));
  data.foundries = out;
  data.fonts = data.fonts.filter(f => !removed.includes(f.foundryId));
  return { data, rescans, removed, removedFonts };
}
const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** Strip crawler-only transient fields before writing data.json. */
export function forSave(data) {
  return {
    ...data,
    foundries: data.foundries.map(({ cfg, rescan, ...f }) => f),
  };
}

// One-off migration: appendix D data.json -> foundries.yaml + data/data.json.
// Usage: node scripts/seed.mjs scripts/seed-data.json
import fs from "node:fs";
import YAML from "yaml";
import { YAML_FILE, slugify, host, dump, DATA, yamlEntries, loadYamlDoc } from "../crawler/lib/store.mjs";

const src = JSON.parse(fs.readFileSync(process.argv[2] || "scripts/seed-data.json", "utf8"));

const idFor = f => {
  const full = slugify(f.name) || slugify(f.by) || slugify(host(f.url));
  const short = slugify(String(f.name).replace(/\s+(type foundry|foundry|type co\.?|fonts|type)\s*$/i, ""));
  return short.length >= 4 ? short : full;
};
const idMap = new Map();
for (const f of src.foundries) {
  const id = idFor(f);
  if ([...idMap.values()].includes(id)) throw new Error("duplicate id " + id + " for " + f.name);
  idMap.set(f.id, id);
}

const HEADER = `# Foundries: the source list for the type index.
# Edit this file on GitHub. The nightly crawl picks up changes.
#
# Per entry:
#   id        stable slug (used for screenshot filenames; don't change once set)
#   name, by, url, note, tags, order, addedAt
#   kind      Foundry (full catalogue) | Typeface (one font: the page itself) | Library (homepage shot only)
# Optional crawl overrides:
#   rescan: true          redo homepage + catalogue + all fonts on the next run (cleared automatically)
#   skip: true            never crawl this entry (it still shows on the page)
#   catalogUrl            page that lists all fonts, if not the homepage
#   fontLinkPattern       regex every font link must match, e.g. "/fonts/[^/]+$"
#   exclude               list of regexes; matching font links are ignored
#   fonts:                per-font overrides, keyed by font slug (the part after "<id>--")
#     some-font: { category: Serif, styles: 12, variable: true, free: false, name: "Some Font", skip: true }
`;

const entries = src.foundries.map(f => {
  const e = { id: idMap.get(f.id), name: f.name };
  if (f.by) e.by = f.by;
  e.url = f.url;
  e.kind = f.kind;
  if (f.tags?.length) e.tags = f.tags;
  if (f.note) e.note = f.note;
  e.order = f.order;
  e.addedAt = f.addedAt;
  if (f.catalogUrl) e.catalogUrl = f.catalogUrl;
  return e;
});
const doc = new YAML.Document({ foundries: entries });
YAML.visit(doc, { Seq(_, node) { if (node.items.every(YAML.isScalar)) node.flow = true; } }); // tags: [a, b]
fs.writeFileSync(YAML_FILE, HEADER + "\n" + doc.toString({ lineWidth: 0 }));

// data.json: foundries start pending (recapture everything), fonts queued.
const data = {
  updatedAt: null,
  repo: null,
  foundries: src.foundries.map(f => ({
    id: idMap.get(f.id), name: f.name, by: f.by || "", url: f.url, kind: f.kind, tags: f.tags || [], note: f.note || "",
    order: f.order, addedAt: f.addedAt, scan: "pending",
    typefaces: f.typefaces || [], newReleases: [],
    ...(f.catalogUrl ? { catalog: f.catalog || "listed", catalogUrl: f.catalogUrl, catalogCheckedAt: f.catalogCheckedAt || f.scannedAt || null } : {}),
  })),
  fonts: src.fonts.map(x => {
    const fid = idMap.get(x.foundryId);
    const slug = x.id.split("--").slice(1).join("--");
    return { id: `${fid}--${slug}`, foundryId: fid, name: x.name, url: x.url, order: x.order, addedAt: x.addedAt, scan: "queued",
      ...(x.category ? { category: x.category } : {}), ...(x.styles ? { styles: x.styles } : {}), ...(x.variable ? { variable: true } : {}) };
  }),
};
fs.writeFileSync(DATA, dump(data));

// Verify: YAML round-trips and counts match.
const back = yamlEntries(loadYamlDoc());
const kinds = back.reduce((m, e) => (m[e.kind] = (m[e.kind] || 0) + 1, m), {});
for (const [i, e] of back.entries()) {
  const o = src.foundries[i];
  for (const k of ["name", "url", "kind", "by", "note"]) if ((e[k] || "") !== (o[k] || "")) throw new Error(`round-trip mismatch ${o.id}.${k}: ${e[k]} vs ${o[k]}`);
  if (JSON.stringify(e.tags) !== JSON.stringify(o.tags || [])) throw new Error("tags mismatch " + o.id);
}
const ids = new Set(data.fonts.map(f => f.id));
if (ids.size !== data.fonts.length) throw new Error("duplicate font ids");
console.log(back.length, "foundries", kinds, "·", data.fonts.length, "fonts", "· klim id:", idMap.get("f023"));

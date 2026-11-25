// Assemble the static site for GitHub Pages into _site/ (no bundling: just copies).
// foundries.yaml is merged in here too, so name/tag/note edits show up without waiting for a crawl.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadData, loadYamlDoc, yamlEntries, merge, forSave, dump } from "../crawler/lib/store.mjs";
const out = path.join(ROOT, "_site");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "data"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "site/index.html"), path.join(out, "index.html"));
const { data } = merge(loadData(), yamlEntries(loadYamlDoc()));
data.repo = process.env.GITHUB_REPOSITORY || data.repo || null;
// a paused foundry (skip: true) keeps its card, but fonts from a bad catalogue scan stay off the site
const paused = new Set(data.foundries.filter(f => f.cfg?.skip).map(f => f.id));
data.fonts = data.fonts.filter(f => !paused.has(f.foundryId));
fs.writeFileSync(path.join(out, "data/data.json"), dump(forSave(data)));
fs.cpSync(path.join(ROOT, "public/shots"), path.join(out, "shots"), { recursive: true });
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`built _site/ (${data.foundries.length} foundries, ${data.fonts.length} fonts)`);

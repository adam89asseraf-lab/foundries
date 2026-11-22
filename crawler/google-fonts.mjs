// Google Fonts as a source: families come from Google's public metadata, and each is shot as our own
// specimen page rendered with the Google Fonts CSS API (large, consistent, no scraping of Google's UI).
import { slugify, now } from "./lib/store.mjs";

const META = "https://fonts.google.com/metadata/fonts";
const CAT = { "Sans Serif": "Sans", "Serif": "Serif", "Display": "Display", "Handwriting": "Script", "Monospace": "Mono" };
const SAMPLES = {
  latin: "The quick brown fox jumps over the lazy dog",
  "japanese": "いろはにほへと ちりぬるを 永遠の愛", "korean": "다람쥐 헌 쳇바퀴에 타고파", "chinese-simplified": "天地玄黄 宇宙洪荒 日月盈昃",
  "chinese-traditional": "天地玄黃 宇宙洪荒 日月盈昃", "arabic": "أبجد هوز حطي كلمن سعفص قرشت", "hebrew": "שפת אמת ודבר חכמה",
  "devanagari": "ऋषियों को सताने वाले दुष्ट राक्षसों", "cyrillic": "Съешь же ещё этих мягких французских булок", "greek": "Ξεσκεπάζω την ψυχοφθόρα βδελυγμία",
  "thai": "เป็นมนุษย์สุดประเสริฐเลิศคุณค่า", "bengali": "আমার সোনার বাংলা", "tamil": "யாமறிந்த மொழிகளிலே",
};

export async function googleFamilies({ limit = 300, newDays = 30 } = {}) {
  const res = await fetch(META, { headers: { "user-agent": "Mozilla/5.0 (foundries index)" } });
  if (!res.ok) throw new Error("Google Fonts metadata HTTP " + res.status);
  const txt = await res.text();
  const all = JSON.parse(txt.slice(txt.indexOf("{"))).familyMetadataList;
  const popular = [...all].sort((a, b) => a.popularity - b.popularity).slice(0, limit);
  const cutoff = Date.now() - newDays * 864e5;
  const fresh = all.filter(f => Date.parse(f.dateAdded) > cutoff && !popular.includes(f));
  return [...popular, ...fresh].map(f => {
    const weights = Object.keys(f.fonts).filter(k => !k.endsWith("i")).map(Number).sort((a, b) => a - b);
    // show a font's own script when it has one (Noto Sans JP in Japanese); Cyrillic/Greek-capable Latin fonts stay Latin
    const native = f.subsets.find(s => SAMPLES[s] && !["latin", "cyrillic", "greek"].includes(s));
    const script = native || (f.subsets.includes("latin") ? "latin" : (f.subsets.find(s => SAMPLES[s]) || "latin"));
    return {
      u: "https://fonts.google.com/specimen/" + f.family.replace(/ /g, "+"),
      t: f.family,
      family: f.family,
      category: f.stroke === "Slab Serif" || (f.classifications || []).some(c => /slab/i.test(c)) ? "Slab" : (CAT[f.category] || null),
      styles: Object.keys(f.fonts).length,
      variable: (f.axes || []).length > 0,
      designers: (f.designers || []).join(", "),
      weights: weights.length ? weights : [400],
      script,
      dateAdded: f.dateAdded,
      fresh: Date.parse(f.dateAdded) > cutoff,
    };
  });
}

/** Specimen HTML in the index's own look: label, the family name huge, then sample lines in up to 3 weights. */
export function specimenHtml(g) {
  const w = g.weights, pick = [...new Set([w[0], w.reduce((a, b) => Math.abs(b - 400) < Math.abs(a - 400) ? b : a), w[w.length - 1]])];
  const fam = g.family.replace(/ /g, "+");
  const css = `https://fonts.googleapis.com/css2?family=${fam}:wght@${pick.join(";")}&display=block`;
  const sample = SAMPLES[g.script] || SAMPLES.latin;
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const name = g.family;
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${css}">
<style>
html,body{margin:0;background:#ededea;color:#121214;height:100%;overflow:hidden}
body{display:flex;flex-direction:column;justify-content:center;padding:0 72px;box-sizing:border-box;font-family:"${g.family}",sans-serif}
.label{position:absolute;top:44px;left:72px;right:72px;display:flex;justify-content:space-between;font:500 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;color:#6b6b72}
.name{font-size:220px;line-height:1;white-space:nowrap;font-weight:${pick[Math.min(1, pick.length - 1)]};letter-spacing:-.01em}
.line{font-size:64px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:clip;margin-top:26px}
</style></head><body>
<div class="label"><span>${esc(g.family)}</span><span>${esc([g.category, g.styles + (g.styles === 1 ? " style" : " styles"), g.variable ? "Variable" : ""].filter(Boolean).join(" · "))}</span></div>
<div class="name" id="n">${esc(name)}</div>
${pick.map(x => `<div class="line" ${["arabic", "hebrew"].includes(g.script) ? 'dir="rtl"' : ""} style="font-weight:${x}">${esc(sample)}</div>`).join("\n")}
<script>
(()=>{ // own scope: setContent() reuses the page's global scope between fonts
const n=document.getElementById("n"),max=innerWidth-144;
document.fonts.ready.then(()=>{let s=220;while(n.scrollWidth>max&&s>40){s-=6;n.style.fontSize=s+"px"}document.body.dataset.ready=[...document.fonts].some(f=>f.family.replace(/"/g,"")===${JSON.stringify(g.family)}&&f.status==="loaded")?"1":"0"});
})();
</script></body></html>`;
}

export function googleFontRecord(f, g, id, order, markNew) {
  return {
    id, foundryId: f.id, name: g.family, url: g.u, order, addedAt: now(), scan: "queued",
    listText: g.designers.slice(0, 120),
    gf: { family: g.family, weights: g.weights, script: g.script, category: g.category, styles: g.styles, variable: g.variable },
    ...(markNew && g.fresh ? { newSince: now() } : {}),
  };
}

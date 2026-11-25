// Uniform specimens: every font shown the same way — same background, same ink, same sentence.
// Runs inside the font's own page (its webfont is already loaded there); nothing is downloaded.

export const SAMPLE = {
  latin: { head: "Quirky swamp tigers", body: "The quick brown fox jumps over the lazy dog 0123" },
  hebrew: { head: "אותיות בעברית", body: "דג סקרן שט בים מאוכזב ולפתע מצא חברה", dir: "rtl" },
  cyrillic: { head: "Шрифтология", body: "Съешь же ещё этих мягких французских булок 0123" },
};

/** In page: candidate faces for the font on this page, best first (a family named like the font, then the
 *  biggest text). The site's own interface fonts (nav, header, links, buttons, body) only count when named. */
export function detectFace(fontName) {
  const GENERIC = /^(serif|sans-serif|monospace|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|cursive|fantasy|emoji|math|arial|helvetica( neue)?|times( new roman)?|georgia|verdana|segoe ui|inherit|initial)$/i;
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9֐-׿Ѐ-ӿ]+/g, "");
  const bare = String(fontName || "").replace(/^[A-Z]{2,4}\s+(?=\S)/, ""); // "GT Mechanik", "FKT Rhosyn", "SK Volchok" → the name itself
  const want = norm(bare).slice(0, 6);
  const full = norm(bare);
  const isNamed = fam => want.length >= 3 && norm(fam).includes(want) ? (norm(fam).includes(full) ? 2 : 1) : 0; // 2 = the whole name
  const first = el => getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
  const bodyFam = first(document.body);
  const siteFams = new Set([bodyFam, ...[...document.querySelectorAll("nav *, header *, footer *")].slice(0, 400).map(first)]);
  const seen = new Map();
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("nav, header, footer, [class*=cookie], [id*=cookie]")) continue;
    // type testers keep their text in inputs/textareas, not text nodes
    const txt = (/^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value || el.placeholder || "" : [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("")).trim();
    if (txt.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 5 || r.height < 5) continue;
    const fam = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (!fam || GENERIC.test(fam)) continue;
    const fs = parseFloat(cs.fontSize);
    const key = [fam, cs.fontWeight, cs.fontStyle, cs.fontVariationSettings, cs.fontStretch].join("|");
    const score = fs * fs * Math.min(txt.length, 30) * (fam === bodyFam ? 0.05 : 1); // the site's own text face rarely is the product
    const named = isNamed(fam);
    const prev = seen.get(key);
    if (!prev || score > prev.score) seen.set(key, { fam, weight: cs.fontWeight, style: cs.fontStyle, vars: cs.fontVariationSettings, stretch: cs.fontStretch, fs, score, named, text: txt.slice(0, 30) });
  }
  // how far a family is from the font itself: another design (mono, condensed, stencil…) is far, an italic is a little off
  const DESIGN = ["mono", "condensed", "cond", "compressed", "narrow", "extended", "expanded", "wide", "stencil", "sans", "serif", "slab", "rounded", "round", "soft", "script", "outline", "inline", "fono", "duplex"];
  const words = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  const nameWords = new Set(words(fontName));
  const off = fam => { const w = words(fam); return 10 * DESIGN.filter(x => w.includes(x) && !nameWords.has(x)).length + (w.includes("italic") && !nameWords.has("italic") ? 1 : 0); };
  for (const c of seen.values()) c.off = off(c.fam) + (c.style !== "normal" ? 1 : 0);
  const all = [...seen.values()].filter(c => c.named || !siteFams.has(c.fam)).sort((a, b) => (b.named - a.named) || (a.off - b.off) || (b.score - a.score));
  const out = all.filter(c => c.named);
  // a loaded webfont named like the font (testers often load it without visible text): take its most regular style
  const loaded = [...document.fonts].filter(f => f.status === "loaded" && isNamed(f.family));
  if (loaded.length) {
    const w = f => { const n = parseInt(f.weight) || 400; return Math.abs(n - 500) + (f.style === "normal" ? 0 : 300); };
    for (const f of loaded.sort((a, b) => w(a) - w(b)).slice(0, 3))
      out.push({ fam: f.family.replace(/^["']|["']$/g, ""), weight: String(parseInt(f.weight) || 400), style: f.style === "normal" ? "normal" : "italic", vars: "normal", stretch: "normal", named: isNamed(f.family), fromFaces: true, off: off(f.family) + (f.style === "normal" ? 0 : 1) });
  }
  // a face named like the font exists: never fall back to some other face on the page (it would be the wrong font)
  if (!out.length) out.push(...all.filter(c => !c.named).slice(0, 3));
  const key = c => [c.fam, c.weight, c.style].join("|");
  out.sort((a, b) => (b.named - a.named) || (a.off - b.off)); // closest to the font first; a sibling design only as a last resort
  return out.filter((c, i) => out.findIndex(d => key(d) === key(c)) === i).slice(0, 8);
}

/** In page: how many characters of `text` this face is missing (they'd fall back to another font). */
export async function missingGlyphs({ fam, weight, style, text }) {
  const spec = s => `${style === "italic" ? "italic " : ""}${weight} 80px "${fam}", ${s}`;
  try { await document.fonts.load(spec("serif"), text); } catch {}
  const c = document.createElement("canvas").getContext("2d");
  const miss = [];
  for (const ch of new Set([...text.replace(/\s/g, "")])) {
    // missing = the face draws it exactly like the fallback alone, with two different fallbacks
    const w = f => { c.font = f; return c.measureText(ch).width; };
    const same = fb => Math.abs(w(spec(fb)) - w(`${style === "italic" ? "italic " : ""}${weight} 80px ${fb}`)) < 0.01;
    if (same("serif") && same("monospace")) miss.push(ch);
  }
  return miss;
}

/** In page: cover the page with the uniform specimen in this face. */
export async function renderUniform({ face, sample, colors }) {
  document.getElementById("__uni")?.remove();
  // first time: empty the page (its fonts stay loaded) and undo smooth-scroll/transform tricks that would move our layer
  if (!document.documentElement.dataset.uni) {
    document.documentElement.dataset.uni = "1";
    try { document.body.replaceChildren(); } catch {}
    const reset = `margin:0;padding:0;transform:none;filter:none;contain:none;perspective:none;overflow:hidden;width:100vw;height:100vh;position:static;background:${colors.bg}`;
    for (const el of [document.documentElement, document.body]) for (const decl of reset.split(";")) { const [k, v] = decl.split(":"); el.style.setProperty(k, v, "important"); }
    document.scrollingElement.scrollTop = 0; document.scrollingElement.scrollLeft = 0;
  }
  const box = document.createElement("div"); box.id = "__uni";
  box.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:${colors.bg};color:${colors.ink};display:flex;flex-direction:column;justify-content:center;gap:4vh;padding:0 7vw;box-sizing:border-box;overflow:hidden`;
  box.dir = sample.dir || "ltr";
  // every font in its regular upright style (the closest real one if it has none; never faked)
  const font = `font-family:"${face.fam}",serif;font-weight:400;font-style:normal;font-synthesis:none;font-variation-settings:normal;font-stretch:normal;font-feature-settings:normal;text-transform:none;letter-spacing:0;word-spacing:normal;margin:0;white-space:nowrap;font-kerning:normal`;
  const fitTo = "align-self:flex-start;width:max-content;max-width:none";
  const head = document.createElement("div"); head.id = "__uni_h"; head.textContent = sample.head; head.style.cssText = font + `;${fitTo};line-height:1.05;font-size:100px`;
  const body = document.createElement("div"); body.id = "__uni_b"; body.textContent = sample.body; body.style.cssText = font + `;${fitTo};line-height:1.2;font-size:40px`;
  box.append(head, body); document.documentElement.append(box);
  await document.fonts.ready;
  // fit: the big word fills the width (but never taller than ~42% of the screen); the sentence fits on one line
  const W = innerWidth * 0.86;
  const hs = Math.min(100 * W / head.scrollWidth, innerHeight * 0.5);
  head.style.fontSize = hs + "px";
  const bs = Math.min(hs * 0.22, 40 * W / body.scrollWidth);
  body.style.fontSize = bs + "px";
  return { hs: Math.round(hs), bs: Math.round(bs) };
}

/** Node side: which fonts Chrome actually used to draw the specimen (from the DevTools protocol).
 *  Returns the number of glyphs drawn by anything other than the page's own webfont (0 = full coverage). */
export async function fallbackGlyphs(cdp) {
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  let n = 0;
  for (const sel of ["#__uni_h", "#__uni_b"]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    if (!nodeId) return Infinity;
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    n += fonts.filter(f => !f.isCustomFont).reduce((a, f) => a + f.glyphCount, 0);
  }
  return n;
}

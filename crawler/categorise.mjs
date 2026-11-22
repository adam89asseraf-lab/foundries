// Font categorising: page-text rules first, optional Claude Haiku fallback, manual override always wins.
export const CATS = ["Sans", "Serif", "Slab", "Mono", "Display", "Script"];

const RULES = [
  // [category, regex, weight]
  ["Mono", /\b(mono(space[d]?)?|monospaced)\b/gi, 3],
  ["Slab", /\bslab(\s?serif)?\b/gi, 3],
  ["Script", /\b(script|handwrit\w*|brush|calligraph\w*|hand-?lettered|cursive)\b/gi, 2],
  ["Sans", /\b(sans(-|\s)?serif|sans|grotesk|grotesque|grotesk\w*|neo-?grotesk\w*|geometric sans|humanist sans|gothic)\b/gi, 2],
  ["Serif", /\b(?<!sans[\s-]?)(?<!slab[\s-]?)(serif|didone|antiqua|old-?style|transitional serif|modern serif|garalde)\b/gi, 2],
  ["Display", /\b(display|decorative|stencil|blackletter|fraktur|headline\s+typeface|poster)\b/gi, 1],
];

function score(text, weight = 1) {
  const s = Object.fromEntries(CATS.map(c => [c, 0]));
  for (const [cat, re, w] of RULES) {
    const m = String(text || "").match(re);
    if (m) s[cat] += m.length * w * weight;
  }
  return s;
}

/**
 * @param {{name, listText, title, h1, head, body}} t  text from the catalogue link and the font page
 * @returns {{category: string|null, styles: number|null, variable: boolean, free: boolean|null, source: string}}
 */
export function categorise(t) {
  // The font's own name is the strongest signal ("Söhne Mono", "Domaine Sans"), then the catalogue
  // card text and page headings, then the body (weakest: navs and filters mention every category).
  const total = Object.fromEntries(CATS.map(c => [c, 0]));
  const add = s => { for (const c of CATS) total[c] += s[c]; };
  add(score(t.name, 20));
  add(score(t.listText, 6));
  add(score(t.h1 + "\n" + t.title, 4));
  add(score(t.head, 2));
  add(score((t.body || "").slice(0, 8000), 0.5));
  const ranked = Object.entries(total).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  let category = null;
  if (best[1] >= 2 && best[1] >= second[1] * 1.5) category = best[0];

  const all = [t.listText, t.head, t.body].join("\n");
  let styles = null;
  for (const m of all.matchAll(/\b(\d{1,3})\s+(styles|fonts|weights|cuts|variants|font files)\b/gi)) {
    const n = +m[1];
    if (n >= 1 && n <= 200 && (!styles || n > styles)) styles = n;
  }
  const variable = /\bvariable\s+(font|axes|axis|version|weight|typeface)s?\b|\bvariable\b(?=[^.\n]{0,40}\b(included|available|axis|axes)\b)|\bVF\b/i.test(all);
  let free = null;
  if (/\b(free\s+(for\s+(personal|commercial)|download|font|typeface)|download\s+(it\s+)?for\s+free|100%\s+free|SIL\s+Open\s+Font|open\s+font\s+licen[sc]e|\bOFL\b)/i.test(all)) free = true;

  return { category, styles, variable, free, source: category ? "rules" : "none" };
}

/** Optional Haiku fallback: only if FOUNDRIES_HAIKU=1 and ANTHROPIC_API_KEY is set. */
export const haikuEnabled = () => process.env.FOUNDRIES_HAIKU === "1" && !!process.env.ANTHROPIC_API_KEY;
let client = null;
export async function categoriseWithHaiku(t) {
  if (!haikuEnabled()) return null;
  try {
    if (!client) { const { default: Anthropic } = await import("@anthropic-ai/sdk"); client = new Anthropic(); }
    const res = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: `You classify typefaces. Answer with exactly one word from: ${CATS.join(", ")}.`,
      messages: [{ role: "user", content: `Typeface: ${t.name}\nPage title: ${t.title}\nCatalogue text: ${t.listText || ""}\nPage text:\n${(t.head + "\n" + t.body).slice(0, 3000)}` }],
    });
    if (res.stop_reason === "refusal") return null;
    const txt = res.content.filter(b => b.type === "text").map(b => b.text).join(" ");
    return CATS.find(c => new RegExp(`\\b${c}\\b`, "i").test(txt)) || null;
  } catch (e) {
    console.warn("  haiku categorise failed:", e.message);
    return null;
  }
}

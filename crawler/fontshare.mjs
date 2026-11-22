// Fontshare (ITF's free font library) as a source: the full catalogue from its public API, rendered as our own
// specimens through Fontshare's CSS API (same specimen page as Google Fonts).
const API = "https://api.fontshare.com/v2/fonts";
const CAT = { sans: "Sans", serif: "Serif", slab: "Slab", display: "Display", script: "Script", handwritten: "Script", mono: "Mono", monospace: "Mono" };

export async function fontshareFamilies() {
  const res = await fetch(API, { headers: { "user-agent": "Mozilla/5.0 (foundries index)" } });
  if (!res.ok) throw new Error("Fontshare API HTTP " + res.status);
  const { fonts } = await res.json();
  if (!Array.isArray(fonts) || !fonts.length) throw new Error("Fontshare API returned no fonts");
  return fonts.map(f => {
    const styles = f.styles || [];
    const weights = [...new Set(styles.filter(s => !s.is_italic && !s.is_variable).map(s => s.weight?.number).filter(Boolean))].sort((a, b) => a - b);
    const first = String(f.category || "").split(",")[0].trim().toLowerCase();
    return {
      provider: "fontshare", slug: f.slug,
      u: "https://www.fontshare.com/fonts/" + f.slug,
      t: f.name, family: f.name,
      category: CAT[first] || null,
      styles: styles.filter(s => !s.is_variable).length || styles.length,
      variable: styles.some(s => s.is_variable) || (f.axes || []).length > 0,
      designers: (f.designers || []).map(d => d.name).filter(Boolean).join(", "),
      weights: weights.length ? weights : [400],
      script: "latin",
      dateAdded: f.inserted_at,
      fresh: !!f.is_new,
      picked: true, // the whole catalogue: new families are always added
    };
  });
}

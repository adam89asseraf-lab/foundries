// Font personality: Claude Haiku looks at a font's screenshot once and scores four opposite pairs, 0–100.
// Runs only when ANTHROPIC_API_KEY is set (a GitHub secret in Actions). One consistent scale for every font.
import fs from "node:fs";
import path from "node:path";
import { SHOTS } from "./lib/store.mjs";

export const AXES = [
  ["calm", "loud"],          // 0 = quiet, restrained, text-like · 100 = loud, attention-grabbing, shouty
  ["serious", "playful"],    // 0 = sober, formal, institutional · 100 = playful, quirky, fun
  ["classic", "futuristic"], // 0 = traditional, historical, old-style · 100 = futuristic, techno, experimental
  ["clean", "rough"],        // 0 = clean, precise, geometric · 100 = rough, textured, distressed, hand-made
];

export const personalityEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client = null, schema = null, zodFormat = null;
async function init() {
  if (client) return;
  const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
    import("@anthropic-ai/sdk"), import("zod"), import("@anthropic-ai/sdk/helpers/zod"),
  ]);
  client = new Anthropic();
  const score = z.number().int().min(0).max(100);
  schema = z.object({ ...Object.fromEntries(AXES.map(([a, b]) => [`${a}_${b}`, score])), category: z.enum(["Sans", "Serif", "Slab", "Mono", "Display", "Script"]) });
  zodFormat = zodOutputFormat;
}

const PROMPT = `This is a screenshot of a typeface's specimen (sometimes the foundry's product page around it). Judge the TYPEFACE itself — its letterforms — not the page layout, photos or UI chrome. Score each scale from 0 to 100:
- calm_loud: 0 = calm, quiet, restrained (a text face) … 100 = loud, heavy, attention-grabbing (a shouting display face)
- serious_playful: 0 = serious, formal, sober … 100 = playful, quirky, fun
- classic_futuristic: 0 = classic, traditional, historical … 100 = futuristic, techno, experimental
- clean_rough: 0 = clean, precise, smooth … 100 = rough, textured, distressed, hand-made
Use the whole range; 50 means truly in between.
Also give its category: Sans, Serif, Slab, Mono, Display (decorative, stencil, pixel, blackletter, heavily stylised) or Script (handwritten, brush, calligraphic).`;

/** @returns {Promise<{mood:number[], category:string}|null>} scores in AXES order, plus a category */
export async function ratePersonality(font) {
  await init();
  const file = path.join(SHOTS, (font.shotId || `fonts/${font.id}`) + ".thumb.webp");
  if (!fs.existsSync(file)) return null;
  const res = await client.messages.parse({
    model: "claude-haiku-5-5",
    max_tokens: 2048,
    output_config: { effort: "low", format: zodFormat(schema) },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/webp", data: fs.readFileSync(file).toString("base64") } },
        { type: "text", text: `Typeface: ${font.name}\n\n${PROMPT}` },
      ],
    }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  return { mood: AXES.map(([a, b]) => res.parsed_output[`${a}_${b}`]), category: res.parsed_output.category };
}

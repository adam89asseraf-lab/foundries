// Frames a uniform specimen: a short 5:2 picture centred on the words, on white.
// The text keeps its size when it fits; taller text (big Hebrew heads, short names) is scaled down to fit.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const FRAME = { w: 1600, h: 640, thumbW: 800, thumbH: 320, margin: 0.07, pad: 0.14 };
export const WHITE = { r: 255, g: 255, b: 255 };

/** png/webp buffer of a full-screen specimen → { full, thumb } webp buffers.
 *  recolor: { bg, ink } of an older render to remap onto white (antialiasing stays exact: it's a linear map). */
export async function frameSpecimen(buf, { dir = "ltr", recolor } = {}) {
  const W = FRAME.w, H0 = 1000;
  let img = sharp(buf).resize(W, H0, { fit: "cover" }).removeAlpha();
  if (recolor) {
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const bg = hex(recolor.bg).map(v => v - 4), ink = hex(recolor.ink); // a touch under the bg so compression noise lands on pure white
    const a = bg.map((b, i) => (255 - ink[i]) / (b - ink[i]));
    img = img.linear(a, a.map((k, i) => ink[i] - k * ink[i]));
  }
  const base = await img.png().toBuffer();
  // where the ink is
  const { data, info } = await sharp(base).greyscale().raw().toBuffer({ resolveWithObject: true });
  let top = -1, bot = -1, left = W, right = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++)
    if (data[y * info.width + x] < 200) { if (top < 0) top = y; bot = y; if (x < left) left = x; if (x > right) right = x; }
  if (top < 0) { top = H0 / 2; bot = H0 / 2; left = 0; right = W; }
  const H = FRAME.h, pad = Math.round(H * FRAME.pad);
  const s = Math.min(1, (H - 2 * pad) / (bot - top + 1));
  const R = Math.round(H / s), y0 = Math.round((top + bot) / 2 - R / 2);
  // room above/below so the crop can run past the edges
  const ext = Math.max(0, -y0, y0 + R - H0);
  let out = sharp(await sharp(base).extend({ top: ext, bottom: ext, background: WHITE }).png().toBuffer())
    .extract({ left: 0, top: y0 + ext, width: W, height: R });
  if (s < 1) {
    const w2 = Math.round(W * s);
    const scaled = await out.resize(w2, H).png().toBuffer();
    const m = Math.round(W * FRAME.margin);
    const x = Math.max(0, Math.min(W - w2, dir === "rtl" ? W - m - Math.round(right * s) - 1 : m - Math.round(left * s)));
    out = sharp({ create: { width: W, height: H, channels: 3, background: WHITE } }).composite([{ input: scaled, left: x, top: 0 }]);
  }
  const framed = await out.png().toBuffer();
  return {
    full: await sharp(framed).webp({ quality: 82 }).toBuffer(),
    thumb: await sharp(framed).resize(FRAME.thumbW, FRAME.thumbH).webp({ quality: 80 }).toBuffer(),
  };
}

export async function writeSpecimen(buf, file, opts) {
  const { full, thumb } = await frameSpecimen(buf, opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".webp", full);
  fs.writeFileSync(file + ".thumb.webp", thumb);
}

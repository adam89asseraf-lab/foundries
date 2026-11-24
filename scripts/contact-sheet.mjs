// Contact sheet of every .webp in a folder: node scripts/contact-sheet.mjs <dir>  → <dir>/sheet.png
import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
const dir = process.argv[2], files = fs.readdirSync(dir).filter(f => f.endsWith(".webp")).sort();
const W = 400, H = 250, C = 4, comps = [];
for (let i = 0; i < files.length; i++) {
  comps.push({ input: await sharp(path.join(dir, files[i])).resize(W - 6, H - 30).png().toBuffer(), left: (i % C) * W + 3, top: Math.floor(i / C) * H + 3 });
  comps.push({ input: Buffer.from(`<svg width="${W}" height="24"><text x="6" y="17" font-family="Menlo" font-size="13" fill="#000">${files[i].replace(".webp", "")}</text></svg>`), left: (i % C) * W, top: Math.floor(i / C) * H + H - 26 });
}
await sharp({ create: { width: W * C, height: H * Math.ceil(files.length / C), channels: 3, background: "#bbb" } }).composite(comps).png().toFile(path.join(dir, "sheet.png"));

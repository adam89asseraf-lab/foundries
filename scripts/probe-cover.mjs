// Debug helper: list the largest images on a page. node scripts/probe-cover.mjs <url>
import { launch, open, prepare } from "../crawler/lib/browser.mjs";
const { browser, newContext } = await launch(); const p = await (await newContext()).newPage();
await open(p, process.argv[2]); await prepare(p);
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("img, [role=img], video")].map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: String(e.className).slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), nw: e.naturalWidth, nh: e.naturalHeight, src: (e.currentSrc || e.src || "").slice(0, 80) }; }).filter(x => x.w > 200).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 5)), null, 1));
await browser.close();

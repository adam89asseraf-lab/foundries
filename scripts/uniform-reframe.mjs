// One-off: put existing uniform specimens on white in the short 5:2 frame (new ones are made that way by the crawler).
// node scripts/uniform-reframe.mjs
import fs from "node:fs"; import path from "node:path";
import { loadData, saveData, ROOT } from "../crawler/lib/store.mjs";
import { writeSpecimen } from "../crawler/lib/specimen-frame.mjs";
const d = loadData();
const todo = d.fonts.filter(f => f.shot === "uniform" && !f.uniformFrame);
let n = 0;
for (const f of todo) {
  const file = path.join(ROOT, "public/shots/fonts", f.id);
  if (!fs.existsSync(file + ".webp")) continue;
  await writeSpecimen(fs.readFileSync(file + ".webp"), file, { dir: f.uniformScript === "hebrew" ? "rtl" : "ltr", recolor: { bg: "#ededea", ink: "#121214" } });
  f.uniformFrame = 2; f.shotAt = new Date().toISOString(); n++;
  if (n % 100 === 0) console.log(n);
}
saveData(d);
console.log(`reframed ${n} of ${todo.length}`);

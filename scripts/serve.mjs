// Local preview: http://localhost:4173  (/ → site/, /data → data/, /shots → public/shots/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../crawler/lib/store.mjs";
const MAP = [["/data/", "data/"], ["/shots/", "public/shots/"], ["/", "site/"]];
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".webp": "image/webp", ".js": "text/javascript", ".css": "text/css" };
const port = +process.env.PORT || 4173;
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") p = "/index.html";
  const [pre, dir] = MAP.find(([pre]) => p.startsWith(pre));
  const file = path.join(ROOT, dir, p.slice(pre.length));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Foundries preview on http://localhost:${port}`));

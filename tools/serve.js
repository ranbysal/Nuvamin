/* Zero-dependency static server for local preview: `npm start`.
   Mirrors the Vercel config — clean URLs (/faq → faq.html) and 404.html. */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

function resolve(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](tools|node_modules|\.git)([\\/]|$)/.test(file.slice(ROOT.length))) return null;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  if (!path.extname(file) && fs.existsSync(file + ".html")) return file + ".html";
  return null;
}

http.createServer((req, res) => {
  const file = resolve(req.url);
  const status = file ? 200 : 404;
  const target = file || path.join(ROOT, "404.html");
  res.writeHead(status, { "Content-Type": TYPES[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => {
  console.log("Nuvamin → http://localhost:" + PORT);
});

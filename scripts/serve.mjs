// Tiny static file server (node:http only, no dependencies).
// Serves web/ plus deployments/ so the UI can read deployments/<chainId>.json.
// Usage: node scripts/serve.mjs [port]   (default 8080)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.argv[2] || 8080);
const ROOT = new URL("../", import.meta.url).pathname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") path = "/web/index.html";
    if (path.startsWith("/deployments/") || path.startsWith("/web/")) {
      const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
      const data = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(data);
      return;
    }
    res.writeHead(404).end("not found");
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`PayLink UI at http://127.0.0.1:${PORT}/`));

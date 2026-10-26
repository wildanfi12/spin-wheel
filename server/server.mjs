import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createSpinWheelApiMiddleware } from "./apiMiddleware.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

const PORT = process.env.PORT || 5173;
const HOST = process.env.HOST || "127.0.0.1";

const apiMiddleware = createSpinWheelApiMiddleware();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  // Try API middleware first
  apiMiddleware(req, res, () => {
    // Static file serving fallback
    let rawUrl = req.url || "/";
    let pathname = rawUrl.replace(/^\/spin-wheel/, "").split("?")[0];
    if (pathname === "/" || pathname === "") pathname = "/index.html";

    // Try distDir first, then rootDir
    let filePath = path.join(distDir, pathname);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(rootDir, pathname);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexHtml = path.join(distDir, "index.html");
    if (fs.existsSync(indexHtml)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      fs.createReadStream(indexHtml).pipe(res);
      return;
    }

    res.statusCode = 404;
    res.end("Not Found");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`HOWELL Spin & Win Server running at http://${HOST}:${PORT}/spin-wheel/`);
});

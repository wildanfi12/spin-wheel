import type { IncomingMessage, ServerResponse } from "http";
import { globalBackendEngine } from "./backendEngine";

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "https://spin.howellcable.site,http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
);

function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!allowedOrigins.has(origin) && !isLocalhost && origin !== "https://wildanfi12.github.io") {
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  return true;
}

function sendJson(req: IncomingMessage, res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  applyCors(req, res);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer | string) => {
      body += String(chunk);
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function createSpinWheelApiMiddleware() {
  return async function apiMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) {
    const rawUrl = req.url || "/";
    const cleanUrl = rawUrl.replace(/^\/spin-wheel/, "");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      if (!applyCors(req, res)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.end();
      return;
    }

    if (!applyCors(req, res)) {
      sendJson(req, res, 403, { success: false, error: "Origin tidak diizinkan." });
      return;
    }

    if (!cleanUrl.startsWith("/api/")) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && (cleanUrl === "/api/status" || cleanUrl === "/api/admin")) {
        const status = globalBackendEngine.getAdminStatus();
        sendJson(req, res, 200, status);
        return;
      }

      if (req.method === "GET" && cleanUrl === "/api/health") {
        sendJson(req, res, 200, {
          success: true,
          service: "howell-spin-wheel-api",
          time: new Date().toISOString(),
          status: "healthy",
        });
        return;
      }

      if (req.method === "POST" && cleanUrl === "/api/spin") {
        const body = await parseJsonBody(req);
        const result = await globalBackendEngine.spin({
          sessionId: body.sessionId || "default-session",
          clientRequestId: body.clientRequestId,
        });
        sendJson(req, res, 200, { success: true, ...result });
        return;
      }

      sendJson(req, res, 404, { success: false, error: "Endpoint not found" });
    } catch (err: unknown) {
      console.error("API Error on", cleanUrl, err);
      sendJson(req, res, /habis/i.test(err instanceof Error ? err.message : "") ? 409 : 500, {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      });
    }
  };
}

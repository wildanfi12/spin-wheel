import type { IncomingMessage, ServerResponse } from "http";
import { globalBackendEngine } from "./backendEngine";

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
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
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.end();
      return;
    }

    if (!cleanUrl.startsWith("/api/")) {
      next();
      return;
    }

    try {
      if (req.method === "GET" && (cleanUrl === "/api/status" || cleanUrl === "/api/admin")) {
        const status = globalBackendEngine.getAdminStatus();
        sendJson(res, 200, status);
        return;
      }

      if (req.method === "POST" && cleanUrl === "/api/spin") {
        const body = await parseJsonBody(req);
        const result = await globalBackendEngine.spin({
          sessionId: body.sessionId || "default-session",
          clientRequestId: body.clientRequestId,
          overrideRandom: body.overrideRandom,
        });
        sendJson(res, 200, { success: true, ...result });
        return;
      }

      if (req.method === "POST" && cleanUrl === "/api/time/simulate") {
        const body = await parseJsonBody(req);
        globalBackendEngine.setSimulatedTime(body.simulatedTime || null);
        const status = globalBackendEngine.getAdminStatus();
        sendJson(res, 200, { message: "Simulated time updated", ...status });
        return;
      }

      if (req.method === "POST" && cleanUrl === "/api/time/reset") {
        globalBackendEngine.setSimulatedTime(null);
        const status = globalBackendEngine.getAdminStatus();
        sendJson(res, 200, { message: "Clock restored to real time", ...status });
        return;
      }

      if (req.method === "POST" && cleanUrl === "/api/admin/reset-all") {
        await globalBackendEngine.resetAll();
        const status = globalBackendEngine.getAdminStatus();
        sendJson(res, 200, { message: "All state reset", ...status });
        return;
      }

      sendJson(res, 404, { success: false, error: "Endpoint not found" });
    } catch (err: unknown) {
      console.error("API Error on", cleanUrl, err);
      sendJson(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      });
    }
  };
}

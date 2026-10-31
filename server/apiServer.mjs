import http from "node:http";
import { createSpinWheelApiMiddleware } from "./apiMiddleware.ts";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3102);
const api = createSpinWheelApiMiddleware();

const server = http.createServer((req, res) => {
  api(req, res, () => {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ success: false, error: "Not Found" }));
  });
});

server.listen(port, host, () => {
  console.log(`HOWELL Spin Wheel API listening on http://${host}:${port}`);
});

process.on("SIGTERM", () => {
  console.log("Shutting down API server gracefully...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

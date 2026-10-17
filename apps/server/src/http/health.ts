import { Hono } from "hono";

export const healthRoutes = new Hono();

healthRoutes.get("/", (c) => {
  return c.json({
    service: "alpenchaos-server",
    status: "ok",
    health: "/health",
    scenarios: "/scenarios",
  });
});

healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "alpenchaos-server",
    timestamp: new Date().toISOString(),
  });
});
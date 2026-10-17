
import { Hono } from "hono";
import { healthRoutes } from "./http/health";
import { scenarioRoutes } from "./http/scenarios";
import { sessionRoutes } from "./http/sessions";

export const app = new Hono();

app.route("/", healthRoutes);
app.route("/", scenarioRoutes);
app.route("/", sessionRoutes);

app.notFound((c) =>
  c.json(
    {
      error: "NOT_FOUND",
      message: "Route not found",
    },
    404,
  ),
);

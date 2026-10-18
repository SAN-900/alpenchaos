import { Hono } from "hono";
import { dailyScenario, dateKey, listScenarios } from "@alpenchaos/scenarios";
import { resolveScenario } from "../rooms/room";

export const scenarioRoutes = new Hono();

scenarioRoutes.get("/scenarios", (c) => {
  const scenarios = listScenarios().map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    tagline: scenario.tagline,
    description: scenario.description,
    lesson: scenario.lesson,
    difficulty: scenario.difficulty,
    tags: scenario.tags,
    mode: scenario.mode,
    durationMs: scenario.durationMs,
  }));

  return c.json({ count: scenarios.length, scenarios });
});

/** Today's challenge (UTC). Create a session for it with its `id`. */
scenarioRoutes.get("/scenarios/daily", (c) => {
  const date = dateKey(new Date());
  return c.json({ date, scenario: dailyScenario(date) });
});

/** Full scenario, including annotations and objective, for the intro screen. */
scenarioRoutes.get("/scenarios/:id", (c) => {
  const scenario = resolveScenario(c.req.param("id"));
  if (!scenario) return c.json({ error: "SCENARIO_NOT_FOUND", message: "Unknown scenario" }, 404);
  return c.json(scenario);
});

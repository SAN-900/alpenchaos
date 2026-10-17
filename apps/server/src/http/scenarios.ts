import { Hono } from "hono";
import { listScenarios } from "@alpenchaos/scenarios";

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

  return c.json({
    count: scenarios.length,
    scenarios,
  });
});
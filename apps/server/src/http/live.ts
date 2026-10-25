import { Hono } from "hono";
import { LIVE_CLUSTERS, type LiveCluster } from "../live/types";
import { LiveObserver } from "../live/observer";

export function liveRoutes(observer: LiveObserver) {
  const routes = new Hono();

  routes.get("/live", (c) => {
    const cluster = c.req.query("cluster");

    if (cluster === undefined) {
      return c.json({
        clusters: observer.getAllSnapshots(),
      });
    }

    if (!LIVE_CLUSTERS.includes(cluster as LiveCluster)) {
      return c.json(
        {
          error: "INVALID_CLUSTER",
          message: "Use devnet, testnet, or mainnet.",
        },
        400,
      );
    }

    return c.json(observer.getSnapshot(cluster as LiveCluster));
  });

  return routes;
}
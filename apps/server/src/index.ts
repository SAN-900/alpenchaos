import { serve } from "bun";
import { app } from "./app";

const port = Number(Bun.env.PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${Bun.env.PORT}`);
}

serve({
  port,
  fetch: app.fetch,
});

console.log(`AlpenChaos server listening on http://localhost:${port}`);

/** Origins allowed to call the HTTP API and open WebSockets. */
export function getAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const configured = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isProduction = env.NODE_ENV === "production";

  if (isProduction && configured.length === 0) {
    throw new Error(
      "ALLOWED_ORIGINS must be explicitly configured in production",
    );
  }

  const defaults = isProduction
    ? []
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];

  return [...new Set([...defaults, ...configured])];
}

/** Validate browser origins for HTTP and WebSocket connections. */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true;
  return allowed.includes(origin);
}
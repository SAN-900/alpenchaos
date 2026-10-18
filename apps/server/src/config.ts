
/** Origins allowed to call the HTTP API and open WebSockets. */
export function getAllowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const defaults = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://hoppscotch.io",
    "https://hoppscotch.com",
  ];

  return [
    ...new Set([
      ...defaults,
      ...(env.ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ]),
  ];
}

/** Validate browser origins for HTTP and WebSocket connections. */
export function isOriginAllowed(
  origin: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin) return true;
  return allowed.includes(origin);
}

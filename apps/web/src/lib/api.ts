export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function websocketUrl(path: string): string {
  const base = API_BASE.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "message" in body && typeof body.message === "string") {
      return body.message;
    }
  } catch {
    return `Server returned HTTP ${response.status}.`;
  }
  return `Server returned HTTP ${response.status}.`;
}

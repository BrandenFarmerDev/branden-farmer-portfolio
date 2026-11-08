import { errorResponse, toHex } from "./http";
import type { Env } from "../types";

const UNIDENTIFIED_CLIENT = "unidentified";
const ADMISSION_DEADLINE_MS = 1000;

function canonicalClientAddress(value: string | null): string {
  if (!value || value.length > 45) return UNIDENTIFIED_CLIENT;
  if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) {
    return value.split(".").every((octet) => Number(octet) <= 255) ? value : UNIDENTIFIED_CLIENT;
  }
  if (!value.includes(":") || !/^[a-fA-F0-9:.]+$/.test(value)) return UNIDENTIFIED_CLIENT;
  try {
    return new URL(`http://[${value}]/`).hostname;
  } catch {
    return UNIDENTIFIED_CLIENT;
  }
}

/** Null admits dispatch; every other outcome fails closed before any route effects. */
export async function protectRequest(request: Request, env: Env): Promise<Response | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outcome: unknown;
  try {
    outcome = await Promise.race([
      (async () => {
        const address = canonicalClientAddress(request.headers.get("CF-Connecting-IP"));
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
        return await env.API_RATE_LIMITER?.limit({ key: `api:v1:${toHex(digest)}` });
      })(),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ADMISSION_DEADLINE_MS); }),
    ]);
  } catch {
    outcome = undefined;
  } finally {
    clearTimeout(timer);
  }
  if (outcome && typeof outcome === "object" && "success" in outcome && outcome.success === true) return null;
  const denied = !!outcome && typeof outcome === "object" && "success" in outcome && outcome.success === false;
  const status = denied ? 429 : 503;
  const error = denied ? "rate_limited" : "rate_limit_unavailable";
  console.warn(JSON.stringify({ event: "api_admission", outcome: error, status }));
  return errorResponse(status, error,
    denied ? "Too many requests. Wait a minute before trying again." : "Request admission is temporarily unavailable. Wait a minute before trying again.",
    undefined, { "Retry-After": "60" });
}

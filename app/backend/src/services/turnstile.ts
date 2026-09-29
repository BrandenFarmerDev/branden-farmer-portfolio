import type { ContactRequest } from "@portfolio/shared";
import type { Env } from "../types";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EXPECTED_ACTION = "contact_form";
const LOCAL_TEST_SECRET = "1x0000000000000000000000000000000AA";
const LOCAL_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
}

export type TurnstileResult =
  | { success: true }
  | { success: false; reason: "invalid" | "unavailable" };

export async function verifyTurnstile(
  contact: ContactRequest,
  request: Request,
  env: Env,
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME) {
    return { success: false, reason: "unavailable" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: contact.turnstileToken,
        remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return { success: false, reason: "unavailable" };

    const result = await response.json<TurnstileResponse>();
    // Cloudflare's public dummy token has synthetic metadata (the live
    // Siteverify response currently reports example.com with no action).
    // Trust only Siteverify's success flag for this exact local test pair.
    const localTestResponse = env.TURNSTILE_SECRET_KEY === LOCAL_TEST_SECRET
      && env.TURNSTILE_EXPECTED_HOSTNAME === "localhost"
      && contact.turnstileToken === LOCAL_TEST_TOKEN;
    const valid = result.success && (localTestResponse || (result.action === EXPECTED_ACTION
      && result.hostname === env.TURNSTILE_EXPECTED_HOSTNAME));

    return valid ? { success: true } : { success: false, reason: "invalid" };
  } catch {
    return { success: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

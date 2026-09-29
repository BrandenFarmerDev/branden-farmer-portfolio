import type { ApiErrorResponse, ContactSuccessResponse } from "@portfolio/shared";
import { CONTACT_BODY_LIMIT, validateContactRequest } from "../services/contact-validation";
import { deliverContact } from "../services/resend";
import { verifyTurnstile } from "../services/turnstile";
import type { Env } from "../types";

function errorResponse(
  status: number,
  error: string,
  message: string,
  fieldErrors?: ApiErrorResponse["fieldErrors"],
): Response {
  return Response.json({ error, message, fieldErrors } satisfies ApiErrorResponse, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function createRateLimitKey(request: Request): Promise<string> {
  const clientNetwork = request.headers.get("CF-Connecting-IP") ?? "local";
  const input = new TextEncoder().encode(clientNetwork);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `contact:${hash}`;
}

async function readBodyWithLimit(request: Request): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (bytesRead > CONTACT_BODY_LIMIT) {
        await reader.cancel();
        return null;
      }

      body += decoder.decode(value, { stream: true });
    }

    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function contactRoute(request: Request, env: Env): Promise<Response> {
  if (!env.CONTACT_RATE_LIMITER || !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME
    || !env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) {
    return errorResponse(503, "service_unavailable", "The contact form is temporarily unavailable. Please use direct email instead.");
  }

  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "unsupported_media_type", "Send the contact request as JSON.");
  }

  const declaredLength = Number(request.headers.get("Content-Length") ?? 0);
  if (declaredLength > CONTACT_BODY_LIMIT) {
    return errorResponse(413, "request_too_large", "The contact request is too large.");
  }

  let rawBody: string | null;
  try {
    rawBody = await readBodyWithLimit(request);
  } catch {
    return errorResponse(400, "invalid_request", "The contact request could not be read.");
  }

  if (rawBody === null) {
    return errorResponse(413, "request_too_large", "The contact request is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "invalid_json", "The contact request contains invalid JSON.");
  }

  const validation = validateContactRequest(body);
  if (!validation.success) {
    return errorResponse(400, "validation_error", "Review the highlighted fields and try again.", validation.fieldErrors);
  }

  const rateLimitKey = await createRateLimitKey(request);
  let rateLimit: RateLimitOutcome;
  try {
    rateLimit = await env.CONTACT_RATE_LIMITER.limit({ key: rateLimitKey });
  } catch {
    return errorResponse(503, "rate_limit_unavailable", "The contact form is temporarily unavailable. Please try again.");
  }
  if (!rateLimit.success) {
    return new Response(JSON.stringify({
      error: "rate_limited",
      message: "Too many contact attempts. Please wait a minute and try again.",
    } satisfies ApiErrorResponse), {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    });
  }

  const verification = await verifyTurnstile(validation.data, request, env);
  if (!verification.success) {
    const unavailable = verification.reason === "unavailable";
    return errorResponse(
      unavailable ? 503 : 422,
      unavailable ? "verification_unavailable" : "verification_failed",
      unavailable
        ? "The security check is temporarily unavailable. Please try again."
        : "The security check expired or was rejected. Please complete it again.",
    );
  }

  const delivery = await deliverContact(validation.data, env);
  if (!delivery.success) {
    return errorResponse(
      delivery.reason === "unavailable" ? 503 : 502,
      delivery.reason === "unavailable" ? "service_unavailable" : "delivery_failed",
      "Your message could not be delivered. Please try again or use direct email.",
    );
  }

  const response: ContactSuccessResponse = {
    ok: true,
    message: delivery.confirmationSent
      ? "Your message was sent. A confirmation email is on its way, and Branden will reply by email."
      : "Your message reached Branden, but the confirmation email could not be sent. Branden will still reply by email.",
  };

  return Response.json(response, { status: 200, headers: { "Cache-Control": "no-store" } });
}

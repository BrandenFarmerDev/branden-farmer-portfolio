import type { ContactSuccessResponse } from "@portfolio/shared";
import { CONTACT_BODY_LIMIT, validateContactRequest } from "../services/contact-validation";
import { claimContact, finishContact, saveContact } from "../services/contact-store";
import { errorResponse, hashClient, readJson } from "../services/http";
import { deliverContact } from "../services/resend";
import { turnstileError, verifyTurnstile } from "../services/turnstile";
import type { Env } from "../types";

function accepted(message: string, status = 202): Response {
  return Response.json({ ok: true, message } satisfies ContactSuccessResponse, { status });
}

export async function contactRoute(request: Request, env: Env): Promise<Response> {
  const db = env.PORTFOLIO_DB;
  if (!env.CONTACT_RATE_LIMITER || !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME
    || !env.RESEND_API_KEY || !env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL || !db) {
    return errorResponse(503, "service_unavailable", "The contact form is temporarily unavailable. Please use direct email instead.");
  }

  const body = await readJson(request, CONTACT_BODY_LIMIT);
  if (!body.ok) return body.response;

  const validation = validateContactRequest(body.value);
  if (!validation.success) {
    return errorResponse(400, "validation_error", "Review the highlighted fields and try again.", validation.fieldErrors);
  }

  let rateLimit: RateLimitOutcome;
  try {
    rateLimit = await env.CONTACT_RATE_LIMITER.limit({ key: await hashClient(request, "contact") });
  } catch {
    return errorResponse(503, "rate_limit_unavailable", "The contact form is temporarily unavailable. Please try again.");
  }
  if (!rateLimit.success) {
    return errorResponse(429, "rate_limited", "Too many contact attempts. Please wait a minute and try again.", undefined,
      { "Retry-After": "60" });
  }

  const verification = await verifyTurnstile(validation.data.turnstileToken, "contact_form", request, env);
  if (!verification.success) return turnstileError(verification.reason);

  let stored: Awaited<ReturnType<typeof saveContact>>;
  let claimed: boolean;
  try {
    stored = await saveContact(db, validation.data);
    if (!stored) return errorResponse(409, "submission_conflict", "This submission ID was already used for a different message.");
    claimed = await claimContact(db, validation.data.submissionId);
  } catch {
    return errorResponse(503, "storage_unavailable", "Your message could not be saved. Please use direct email instead.");
  }

  if (!claimed) {
    if (stored.confirmation_state === "sent") return accepted("Your message reached Branden, and your confirmation email was sent.", 200);
    return accepted(stored.owner_notification_state === "sent"
      ? "Your message reached Branden. Confirmation delivery is pending."
      : "Your message was saved. Email delivery is pending.");
  }

  const delivery = await deliverContact(validation.data, env, stored.owner_notification_state === "sent");
  try {
    await finishContact(db, validation.data.submissionId, delivery.success, delivery.success && delivery.confirmationSent);
  } catch {
    return accepted("Your message was saved. Delivery status is being checked.");
  }
  if (!delivery.success) return accepted("Your message was saved, but the email could not be sent yet. Delivery will be retried.");

  return accepted(delivery.confirmationSent
    ? "Your message was sent. A confirmation email is on its way, and Branden will reply by email."
    : "Your message reached Branden, but the confirmation email could not be sent. Branden will still reply by email.", 200);
}

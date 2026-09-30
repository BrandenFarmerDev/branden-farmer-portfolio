import type { ContactRequest } from "@portfolio/shared";
import type { Env } from "../types";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

export type DeliveryResult =
  | { success: true; confirmationSent: boolean }
  | { success: false; reason: "failed" | "unavailable" };

function formatMessage(contact: ContactRequest): string {
  return [
    "New portfolio contact",
    "",
    `Name: ${contact.name}`,
    `Email: ${contact.email}`,
    `Company: ${contact.company}`,
    `Position: ${contact.position}`,
    "",
    "Message:",
    contact.message,
  ].join("\n");
}

function formatConfirmation(contact: ContactRequest): string {
  return [
    `Hi ${contact.name},`,
    "",
    "Thanks for contacting Branden Farmer. This email confirms that your message was received.",
    "",
    `Company: ${contact.company}`,
    `Position: ${contact.position}`,
    "",
    "Branden will reply to the email address you provided.",
    "",
    "Regards,",
    "Branden Farmer",
  ].join("\n");
}

async function sendEmail(
  apiKey: string,
  idempotencyKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  return response.ok;
}

export async function deliverContact(contact: ContactRequest, env: Env, ownerAlreadySent = false): Promise<DeliveryResult> {
  const { RESEND_API_KEY: apiKey, CONTACT_FROM_EMAIL: fromEmail, CONTACT_TO_EMAIL: toEmail } = env;
  if (!apiKey || !fromEmail || !toEmail) {
    return { success: false, reason: "unavailable" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let notificationSent = ownerAlreadySent;

  try {
    if (!notificationSent) notificationSent = await sendEmail(apiKey,
      `portfolio-contact/${contact.submissionId}`, {
        from: fromEmail,
        to: [toEmail],
        reply_to: contact.email,
        subject: `Portfolio contact: ${contact.position} at ${contact.company}`,
        text: formatMessage(contact),
      }, controller.signal);
    if (!notificationSent) return { success: false, reason: "failed" };

    const confirmationSent = await sendEmail(apiKey,
      `portfolio-contact-confirmation/${contact.submissionId}`, {
        from: fromEmail,
        to: [contact.email],
        reply_to: toEmail,
        subject: "Your message to Branden Farmer was received",
        text: formatConfirmation(contact),
      }, controller.signal);

    return { success: true, confirmationSent };
  } catch {
    return notificationSent
      ? { success: true, confirmationSent: false }
      : { success: false, reason: "failed" };
  } finally {
    clearTimeout(timeout);
  }
}

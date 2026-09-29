import type { ContactFieldErrors, ContactRequest } from "@portfolio/shared";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONTACT_BODY_LIMIT = 16_384;

interface ValidationSuccess {
  success: true;
  data: ContactRequest;
}

interface ValidationFailure {
  success: false;
  fieldErrors: ContactFieldErrors;
}

export type ContactValidationResult = ValidationSuccess | ValidationFailure;

function normalizedString(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function hasHeaderControlCharacters(value: string): boolean {
  return /[\r\n\u0000-\u001f\u007f]/.test(value);
}

export function validateContactRequest(value: unknown): ContactValidationResult {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const submissionId = normalizedString(input.submissionId);
  const name = normalizedString(input.name);
  const email = normalizedString(input.email).toLowerCase();
  const company = normalizedString(input.company);
  const position = normalizedString(input.position);
  const message = normalizedString(input.message);
  const turnstileToken = normalizedString(input.turnstileToken);
  const fieldErrors: ContactFieldErrors = {};

  if (!UUID_PATTERN.test(submissionId)) fieldErrors.turnstileToken = "Please refresh the page and try again.";
  if (name.length < 2 || name.length > 100 || hasHeaderControlCharacters(name)) {
    fieldErrors.name = "Enter a name between 2 and 100 characters.";
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email) || hasHeaderControlCharacters(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (company.length < 2 || company.length > 120 || hasHeaderControlCharacters(company)) {
    fieldErrors.company = "Enter a company name between 2 and 120 characters.";
  }
  if (position.length < 2 || position.length > 120 || hasHeaderControlCharacters(position)) {
    fieldErrors.position = "Enter a position between 2 and 120 characters.";
  }
  if (message.length < 20 || message.length > 3_000) {
    fieldErrors.message = "Enter a message between 20 and 3,000 characters.";
  }
  if (!turnstileToken || turnstileToken.length > 2_048) {
    fieldErrors.turnstileToken = "Complete the security check before sending.";
  }

  if (Object.keys(fieldErrors).length > 0) return { success: false, fieldErrors };

  return {
    success: true,
    data: {
      submissionId,
      name,
      email,
      company,
      position,
      message,
      turnstileToken,
    },
  };
}

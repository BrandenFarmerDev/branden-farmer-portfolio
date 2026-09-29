import type { ApiErrorResponse, ContactRequest, ContactSuccessResponse, HealthResponse } from "@portfolio/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health`, { signal });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}

export class ContactApiError extends Error {
  status: number;
  details: ApiErrorResponse;

  constructor(status: number, details: ApiErrorResponse) {
    super(details.message);
    this.name = "ContactApiError";
    this.status = status;
    this.details = details;
  }
}

export async function submitContact(contact: ContactRequest, signal?: AbortSignal): Promise<ContactSuccessResponse> {
  const response = await fetch(`${apiBaseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
    signal,
  });

  const body = await response.json().catch(() => null) as ContactSuccessResponse | ApiErrorResponse | null;

  if (!response.ok) {
    const details: ApiErrorResponse = body && "error" in body
      ? body
      : { error: "request_failed", message: "The contact service returned an unexpected response." };
    throw new ContactApiError(response.status, details);
  }

  if (!body || !("ok" in body) || !body.ok) {
    throw new ContactApiError(502, {
      error: "invalid_response",
      message: "The contact service returned an unexpected response.",
    });
  }

  return body;
}

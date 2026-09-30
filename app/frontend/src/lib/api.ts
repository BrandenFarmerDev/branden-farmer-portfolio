import type {
  ApiErrorResponse,
  AskRequest,
  AskResponse,
  ContactRequest,
  ContactStatus,
  ContactSuccessResponse,
  HealthResponse,
  ManualBookingRequest,
  OwnerBooking,
  OwnerContact,
} from "@portfolio/shared";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health`, { signal });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}

export class ApiRequestError extends Error {
  status: number;
  details: ApiErrorResponse;

  constructor(status: number, details: ApiErrorResponse) {
    super(details.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

export { ApiRequestError as ContactApiError };

function failure(status: number, body: unknown, fallback: string): ApiRequestError {
  const details = body && typeof body === "object" && "error" in body && "message" in body
    ? body as ApiErrorResponse
    : { error: "request_failed", message: fallback };
  return new ApiRequestError(status, details);
}

export async function submitContact(contact: ContactRequest, signal?: AbortSignal): Promise<ContactSuccessResponse> {
  const response = await fetch(`${apiBaseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
    signal,
  });

  const body = await response.json().catch(() => null) as ContactSuccessResponse | ApiErrorResponse | null;
  if (!response.ok) throw failure(response.status, body, "The contact service returned an unexpected response.");

  if (!body || !("ok" in body) || !body.ok) {
    throw new ApiRequestError(502, {
      error: "invalid_response",
      message: "The contact service returned an unexpected response.",
    });
  }

  return body;
}

export async function submitAsk(request: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  const response = await fetch(`${apiBaseUrl}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  const body = await response.json().catch(() => null) as AskResponse | ApiErrorResponse | null;
  // Quota and outage responses still carry usable evidence links.
  if (body && "status" in body && Array.isArray(body.evidence)) return body;
  throw failure(response.status, body, "Ask Branden returned an unexpected response.");
}

async function ownerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/owner/${path}`, {
    ...init,
    credentials: "include",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  const body = await response.json().catch(() => null) as T | ApiErrorResponse | null;
  if (!response.ok) throw failure(response.status, body, "The owner service returned an unexpected response.");
  return body as T;
}

export const ownerApi = {
  contacts: (query = "") => ownerRequest<{ contacts: OwnerContact[] }>(`contacts?q=${encodeURIComponent(query)}`),
  setContactStatus: (id: string, status: ContactStatus) =>
    ownerRequest(`contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  retryContact: (id: string) => ownerRequest<{ ok: boolean; message: string }>(`contacts/${encodeURIComponent(id)}/retry`, { method: "POST" }),
  deleteContact: (id: string) => ownerRequest(`contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  bookings: (query = "") => ownerRequest<{ bookings: OwnerBooking[] }>(`bookings?q=${encodeURIComponent(query)}`),
  addBooking: (booking: ManualBookingRequest) => ownerRequest("bookings", { method: "POST", body: JSON.stringify(booking) }),
  deleteBooking: (id: string) => ownerRequest(`bookings/${encodeURIComponent(id)}`, { method: "DELETE" }),
  settings: () => ownerRequest<{ aiEnabled: boolean; deploymentAiEnabled: boolean }>("settings"),
  setAiEnabled: (aiEnabled: boolean) => ownerRequest("settings", { method: "PUT", body: JSON.stringify({ aiEnabled }) }),
  exportHistory: () => ownerRequest<unknown>("export"),
};

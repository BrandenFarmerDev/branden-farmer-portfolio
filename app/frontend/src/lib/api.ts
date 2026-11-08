import type {
  ApiErrorResponse,
  AskRequest,
  AskResponse,
  AskStatusResponse,
  ContactRequest,
  ContactStatus,
  ContactSuccessResponse,
  HealthResponse,
  ManualBookingRequest,
  OwnerBooking,
  OwnerContact,
} from "@portfolio/shared";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

const UNCERTAIN_WRITE_MESSAGE = "The request outcome is unconfirmed. Check the current app state before repeating this action.";

function preserveCancellation(error: unknown, signal?: AbortSignal | null): void {
  signal?.throwIfAborted();
  if (error && typeof error === "object" && "name" in error
    && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
}

function connectionFailure(read: boolean): ApiRequestError {
  return new ApiRequestError(0, { error: "connection_unavailable", message: read
    ? "The service could not be reached. Check your connection and try again."
    : UNCERTAIN_WRITE_MESSAGE });
}

function isAskResponse(value: unknown): value is AskResponse {
  return !!value && typeof value === "object" && "status" in value && "evidence" in value && Array.isArray(value.evidence);
}

async function fetchOnce(url: string, init: RequestInit): Promise<{ response: Response; body: unknown }> {
  const read = !init.method || init.method === "GET" || init.method === "HEAD";
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, init);
    init.signal?.throwIfAborted();
    text = await response.text();
    init.signal?.throwIfAborted();
  } catch (error) {
    preserveCancellation(error, init.signal);
    throw connectionFailure(read);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // A complete non-JSON edge response is distinct from an interrupted stream.
  }
  if (response.status === 429 && !(url.endsWith("/api/ask") && isAskResponse(body))) {
    throw new ApiRequestError(429, { error: "rate_limited", message: "Too many requests. Wait a minute before trying again." });
  }
  if (response.status === 503 && body && typeof body === "object" && "error" in body && body.error === "rate_limit_unavailable") {
    throw new ApiRequestError(503, { error: "rate_limit_unavailable", message: "Request admission is temporarily unavailable. Wait a minute before trying again." });
  }
  if (response.ok && !read && (!body || typeof body !== "object" || Array.isArray(body))) {
    throw new ApiRequestError(502, { error: "invalid_response", message: UNCERTAIN_WRITE_MESSAGE });
  }
  return { response, body };
}

export async function getApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const { response, body } = await fetchOnce(`${apiBaseUrl}/api/health`, { credentials: "include", signal });

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  if (!body || typeof body !== "object" || !("status" in body) || body.status !== "ok"
    || !("service" in body) || body.service !== "portfolio-api" || !("timestamp" in body) || typeof body.timestamp !== "string") {
    throw new Error("The API session could not be verified. Sign in to the portfolio API, then reload.");
  }
  return body as HealthResponse;
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
  const { response, body } = await fetchOnce(`${apiBaseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(contact),
    signal,
  });

  if (!response.ok) throw failure(response.status, body, "The contact service returned an unexpected response.");

  if (!body || typeof body !== "object" || !("ok" in body) || !body.ok) {
    throw new ApiRequestError(502, {
      error: "invalid_response",
      message: UNCERTAIN_WRITE_MESSAGE,
    });
  }

  return body as ContactSuccessResponse;
}

export async function submitAsk(request: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  const { response, body } = await fetchOnce(`${apiBaseUrl}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
    signal,
  });
  // Quota and outage responses still carry usable evidence links.
  if (isAskResponse(body)) return body;
  throw failure(response.status, body, response.ok ? UNCERTAIN_WRITE_MESSAGE : "Ask Branden returned an unexpected response.");
}

function isAskStatus(value: unknown): value is AskStatusResponse {
  if (!value || typeof value !== "object" || typeof (value as AskStatusResponse).aiEnabled !== "boolean") return false;
  const { allowance } = value as AskStatusResponse;
  return allowance === null || (typeof allowance === "object" && typeof allowance.used === "number"
    && typeof allowance.limit === "number" && typeof allowance.remaining === "number" && typeof allowance.resetsAt === "string");
}

export async function getAskStatus(signal?: AbortSignal): Promise<AskStatusResponse> {
  const { response, body } = await fetchOnce(`${apiBaseUrl}/api/ask/status`, { credentials: "include", signal });
  if (!response.ok || !isAskStatus(body)) throw failure(response.status, body, "The Ask allowance could not be loaded.");
  return body;
}

async function ownerRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { response, body } = await fetchOnce(`${apiBaseUrl}/api/owner/${path}`, {
    ...init,
    credentials: "include",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) throw failure(response.status, body, "The owner service returned an unexpected response.");
  return body as T;
}

async function ownerWriteRequest(path: string, init: RequestInit): Promise<{ ok: true }> {
  const result = await ownerRequest<unknown>(path, init);
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
    throw new ApiRequestError(502, { error: "invalid_response", message: UNCERTAIN_WRITE_MESSAGE });
  }
  return result as { ok: true };
}

export const ownerApi = {
  contacts: (query = "") => ownerRequest<{ contacts: OwnerContact[] }>(`contacts?q=${encodeURIComponent(query)}`),
  setContactStatus: (id: string, status: ContactStatus) =>
    ownerWriteRequest(`contacts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  retryContact: async (id: string): Promise<{ ok: boolean; message: string }> => {
    const result = await ownerRequest<unknown>(`contacts/${encodeURIComponent(id)}/retry`, { method: "POST" });
    if (!result || typeof result !== "object" || !("ok" in result) || typeof result.ok !== "boolean"
      || !("message" in result) || typeof result.message !== "string") {
      throw new ApiRequestError(502, { error: "invalid_response", message: UNCERTAIN_WRITE_MESSAGE });
    }
    return result as { ok: boolean; message: string };
  },
  deleteContact: (id: string) => ownerWriteRequest(`contacts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  bookings: (query = "") => ownerRequest<{ bookings: OwnerBooking[] }>(`bookings?q=${encodeURIComponent(query)}`),
  addBooking: (booking: ManualBookingRequest) => ownerWriteRequest("bookings", { method: "POST", body: JSON.stringify(booking) }),
  deleteBooking: (id: string) => ownerWriteRequest(`bookings/${encodeURIComponent(id)}`, { method: "DELETE" }),
  settings: () => ownerRequest<{ aiEnabled: boolean; deploymentAiEnabled: boolean }>("settings"),
  setAiEnabled: (aiEnabled: boolean) => ownerWriteRequest("settings", { method: "PUT", body: JSON.stringify({ aiEnabled }) }),
  exportHistory: () => ownerRequest<unknown>("export"),
};

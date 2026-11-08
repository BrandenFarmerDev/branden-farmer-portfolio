import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactApiError, getApiHealth, getAskStatus, ownerApi, submitAsk, submitContact } from "./api";

const contact = {
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Portfolio Visitor",
  email: "visitor@example.com",
  company: "Example Company",
  position: "Application Developer",
  message: "I would like to discuss an application development opportunity.",
  turnstileToken: "verified-token",
};

describe("API client", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it("reads health responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      status: "ok",
      service: "portfolio-api",
      timestamp: "2026-09-29T00:00:00.000Z",
    }));

    await expect(getApiHealth()).resolves.toMatchObject({ status: "ok" });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/health", { credentials: "include", signal: undefined });
  });

  it("rejects failed health responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(getApiHealth()).rejects.toThrow("Health check failed with status 503");
  });

  it("rejects login HTML and malformed successful health responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("<html>Sign in</html>"))
      .mockResolvedValueOnce(Response.json({ status: "ok", service: "another-service" }));
    await expect(getApiHealth()).rejects.toThrow("Sign in to the portfolio API");
    await expect(getApiHealth()).rejects.toThrow("Sign in to the portfolio API");
  });

  it("loads the Ask allowance with credentials and rejects malformed status bodies", async () => {
    const allowance = { used: 2, limit: 5, remaining: 3, resetsAt: "2026-10-02T00:00:00.000Z" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ aiEnabled: true, allowance }))
      .mockResolvedValueOnce(Response.json({ aiEnabled: false, allowance: null }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
      .mockResolvedValueOnce(Response.json({ aiEnabled: true, allowance: { used: "2" } }))
      .mockResolvedValueOnce(Response.json({ error: "origin_forbidden", message: "Blocked." }, { status: 403 }));

    await expect(getAskStatus()).resolves.toEqual({ aiEnabled: true, allowance });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/ask/status", { credentials: "include", signal: undefined });
    await expect(getAskStatus()).resolves.toEqual({ aiEnabled: false, allowance: null });
    await expect(getAskStatus()).rejects.toThrow("The Ask allowance could not be loaded.");
    await expect(getAskStatus()).rejects.toThrow("The Ask allowance could not be loaded.");
    await expect(getAskStatus()).rejects.toMatchObject({ status: 403, message: "Blocked." });
  });

  it("submits a contact payload and validates success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, message: "Message sent." }));

    await expect(submitContact(contact)).resolves.toEqual({ ok: true, message: "Message sent." });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/contact", expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(contact),
    }));
  });

  it("preserves structured API errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      error: "validation_failed",
      message: "Review the fields.",
      fieldErrors: { company: "Company is required." },
    }, { status: 400 }));

    const error = await submitContact(contact).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ContactApiError);
    expect(error).toMatchObject({ status: 400, message: "Review the fields." });
  });

  it("normalizes malformed error and success responses", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("not-json", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ unexpected: true }));

    await expect(submitContact(contact)).rejects.toMatchObject({
      status: 502,
      details: { error: "request_failed" },
    });
    await expect(submitContact(contact)).rejects.toMatchObject({
      status: 502,
      details: { error: "invalid_response" },
      message: expect.stringContaining("outcome is unconfirmed"),
    });
  });

  it("returns Ask evidence even for quota and outage statuses, with credentials", async () => {
    const evidenceOnly = { status: "evidence_only", message: "Used up.", evidence: [], remaining: 0 };
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(evidenceOnly, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ error: "validation_error", message: "Too short." }, { status: 400 }));
    const request = { mode: "question" as const, text: "Power BI?", turnstileToken: "token" };

    await expect(submitAsk(request)).resolves.toEqual(evidenceOnly);
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/ask", expect.objectContaining({ credentials: "include" }));
    await expect(submitAsk(request)).rejects.toMatchObject({ status: 400, message: "Too short." });
  });

  it("calls owner routes with Access credentials and surfaces failures", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ contacts: [] }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(Response.json({ error: "forbidden", message: "Owner access is required." }, { status: 403 }));

    await expect(ownerApi.contacts("a&b")).resolves.toEqual({ contacts: [] });
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/owner/contacts?q=a%26b", expect.objectContaining({ credentials: "include" }));
    await ownerApi.setContactStatus("id/1", "replied");
    expect(fetch).toHaveBeenLastCalledWith("http://localhost:8787/api/owner/contacts/id%2F1", expect.objectContaining({
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "replied" }),
    }));
    await expect(ownerApi.settings()).rejects.toMatchObject({ status: 403 });
  });
});


describe("admission and connection recovery", () => {
  beforeEach(() => { vi.mocked(fetch).mockReset(); });

  it.each(["json", "html"])("shows manual retry for %s 429 without replay or raw HTML", async (kind) => {
    vi.mocked(fetch).mockResolvedValue(kind === "json" ? Response.json({ error: "rate_limited", message: "private-provider-text" }, { status: 429 }) : new Response("<html>private-provider-text</html>", { status: 429 }));
    await expect(submitContact(contact)).rejects.toMatchObject({ status: 429, message: "Too many requests. Wait a minute before trying again." });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles admission outages and Ask admission denial while preserving quota evidence", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "rate_limit_unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429 }));
    await expect(ownerApi.deleteContact("id")).rejects.toMatchObject({ status: 503, message: expect.stringContaining("Wait a minute") });
    await expect(submitAsk({ mode: "question", text: "Question", turnstileToken: "token" })).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("distinguishes opaque read and write failures without replaying actions", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(ownerApi.contacts()).rejects.toThrow("Check your connection");
    await expect(ownerApi.deleteBooking("id")).rejects.toThrow("outcome is unconfirmed");
    await expect(submitContact(contact)).rejects.toThrow("Check the current app state");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["read", "write"])("preserves %s cancellation and the caller signal with exactly one fetch", async (kind) => {
    const controller = new AbortController();
    const error = new DOMException("Aborted", "AbortError");
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => { expect(init?.signal).toBe(controller.signal); controller.abort(error); throw error; });
    await expect(kind === "read" ? getAskStatus(controller.signal) : submitContact(contact, controller.signal)).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});


describe("response body interruption recovery", () => {
  beforeEach(() => { vi.mocked(fetch).mockReset(); });

  function interruptedResponse(status: number, reason: unknown, interrupt?: () => void): Response {
    return new Response(new ReadableStream({
      pull(controller) {
        interrupt?.();
        controller.error(reason);
      },
    }, { highWaterMark: 0 }), { status, headers: { "Content-Type": "application/json" } });
  }

  for (const status of [200, 429, 503]) {
    it.each(["AbortError", "TimeoutError"])(`preserves body-phase %s and caller reason for read/write HTTP ${status}`, async (name) => {
      for (const read of [true, false]) {
        const controller = new AbortController();
        const reason = new DOMException("caller interruption", name);
        const response = interruptedResponse(status, new TypeError("stream interrupted"), () => controller.abort(reason));
        vi.mocked(fetch).mockResolvedValueOnce(response);
        await expect(read ? getApiHealth(controller.signal) : submitContact(contact, controller.signal)).rejects.toBe(reason);
        expect(response.bodyUsed).toBe(true);
      }
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  }

  it.each(["AbortError", "TimeoutError"])("preserves body-phase %s without an explicit signal", async (name) => {
    const reason = new DOMException("stream interrupted", name);
    vi.mocked(fetch).mockResolvedValueOnce(interruptedResponse(503, reason));
    await expect(ownerApi.setContactStatus("id", "replied")).rejects.toBe(reason);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports uncertain successful mutation outcomes on stream loss instead of resolving or replaying", async () => {
    for (const action of [() => submitContact(contact), () => ownerApi.setContactStatus("id", "replied"),
      () => submitAsk({ mode: "question", text: "Question", turnstileToken: "token" })]) {
      vi.mocked(fetch).mockResolvedValueOnce(interruptedResponse(200, new TypeError("connection lost")));
      await expect(action()).rejects.toMatchObject({ status: 0, message: expect.stringContaining("outcome is unconfirmed") });
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["not-json", "null", "false", "[]", ""])("rejects unreadable successful owner mutations: %j", async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(body, { status: 200 }));
    await expect(ownerApi.setContactStatus("id", "replied")).rejects.toMatchObject({
      status: 502, details: { error: "invalid_response" }, message: expect.stringContaining("Check the current app state"),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports uncertainty when a completed successful Ask body cannot confirm the result", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ unexpected: true }));
    await expect(submitAsk({ mode: "question", text: "Question", turnstileToken: "token" })).rejects.toThrow("outcome is unconfirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses connectivity guidance for interrupted reads and distinguishes completed HTML throttling", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(interruptedResponse(200, new TypeError("connection lost")))
      .mockResolvedValueOnce(new Response("<html>throttled</html>", { status: 429 }))
      .mockResolvedValueOnce(interruptedResponse(429, new TypeError("connection lost")));
    await expect(getAskStatus()).rejects.toThrow("Check your connection");
    await expect(submitContact(contact)).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Wait a minute") });
    await expect(submitContact(contact)).rejects.toMatchObject({ status: 0, message: expect.stringContaining("outcome is unconfirmed") });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("decodes admission outages and Ask quota evidence exactly once", async () => {
    const outage = Response.json({ error: "rate_limit_unavailable" }, { status: 503 });
    const evidenceOnly = { status: "evidence_only", message: "Used up.", evidence: [], remaining: 0 };
    const quota = Response.json(evidenceOnly, { status: 429 });
    const outageRead = vi.spyOn(outage, "text");
    const quotaRead = vi.spyOn(quota, "text");
    const clone = vi.spyOn(outage, "clone");
    vi.mocked(fetch).mockResolvedValueOnce(outage).mockResolvedValueOnce(quota);
    await expect(submitContact(contact)).rejects.toMatchObject({ status: 503, details: { error: "rate_limit_unavailable" } });
    await expect(submitAsk({ mode: "question", text: "Question", turnstileToken: "token" })).resolves.toEqual(evidenceOnly);
    expect(outageRead).toHaveBeenCalledTimes(1); expect(quotaRead).toHaveBeenCalledTimes(1);
    expect(clone).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(2);
  });
});


describe("owner mutation acknowledgments", () => {
  beforeEach(() => { vi.mocked(fetch).mockReset(); });

  const writes = [
    ["contact status", () => ownerApi.setContactStatus("id", "replied")],
    ["contact delete", () => ownerApi.deleteContact("id")],
    ["booking add", () => ownerApi.addBooking({ name: "Visitor", email: "visitor@example.com", startAt: "2026-11-08T10:00:00Z", endAt: "2026-11-08T11:00:00Z" })],
    ["booking delete", () => ownerApi.deleteBooking("id")],
    ["AI setting", () => ownerApi.setAiEnabled(false)],
  ] as const;

  for (const [name, action] of writes) {
    it.each([{}, { ok: false }, { ok: "true" }, { ok: 1 }])(`rejects missing, negative or invalid ${name} acknowledgment: %j`, async (body) => {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
      await expect(action()).rejects.toMatchObject({ status: 502, details: { error: "invalid_response" },
        message: expect.stringContaining("Check the current app state before repeating") });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it(`accepts a positive ${name} acknowledgment with one fetch`, async () => {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, bookingUid: "booking", aiEnabled: false }));
      await expect(action()).resolves.toMatchObject({ ok: true });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }

  it.each([true, false])("preserves a valid retry-contact business outcome ok=%s", async (ok) => {
    const body = { ok, message: ok ? "Delivery retried." : "Delivery failed and will be retried." };
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
    await expect(ownerApi.retryContact("id")).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { ok: "true", message: "Wrong type" }, { ok: false }, { ok: true, message: null }])("rejects malformed retry-contact outcomes: %j", async (body) => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body));
    await expect(ownerApi.retryContact("id")).rejects.toMatchObject({ status: 502,
      message: expect.stringContaining("outcome is unconfirmed") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

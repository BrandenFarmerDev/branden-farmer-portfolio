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
    expect(fetch).toHaveBeenCalledWith("http://localhost:8787/api/health", { signal: undefined });
  });

  it("rejects failed health responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(getApiHealth()).rejects.toThrow("Health check failed with status 503");
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

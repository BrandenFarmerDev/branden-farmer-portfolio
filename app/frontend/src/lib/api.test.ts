import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactApiError, getApiHealth, submitContact } from "./api";

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
});

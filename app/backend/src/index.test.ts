import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { hmacHex } from "./services/http";
import type { Env } from "./types";

describe("contact origin enforcement", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a contact POST from an unauthorized origin before route processing", async () => {
    const request = new Request("https://api.brandenfarmer.com/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: "{}",
    });

    const response = await worker.fetch(
      request as unknown as Parameters<typeof worker.fetch>[0],
      { ALLOWED_ORIGIN: "https://brandenfarmer.com" },
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("allows the configured origin to complete preflight", async () => {
    const request = new Request("https://api.brandenfarmer.com/api/contact", {
      method: "OPTIONS",
      headers: { Origin: "https://brandenfarmer.com" },
    });

    const response = await worker.fetch(
      request as unknown as Parameters<typeof worker.fetch>[0],
      { ALLOWED_ORIGIN: "https://brandenfarmer.com" },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://brandenfarmer.com");
  });

  it("serves health with no-store security headers and a request identifier", async () => {
    const response = await worker.fetch(
      new Request("https://api.brandenfarmer.com/api/health") as unknown as Parameters<typeof worker.fetch>[0],
      {},
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"event":"request_complete"'));
  });

  it("gates Ask by origin, rejects unsupported methods, and protects owner routes", async () => {
    const env = { ALLOWED_ORIGIN: "https://brandenfarmer.com" };
    const call = (path: string, init?: RequestInit) => worker.fetch(
      new Request(`https://api.brandenfarmer.com${path}`, init) as unknown as Parameters<typeof worker.fetch>[0], env);

    const foreignAsk = await call("/api/ask", { method: "POST", headers: { Origin: "https://attacker.example" } });
    const unconfiguredAsk = await call("/api/ask", { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN } });
    const methodResponse = await call("/api/health", { method: "POST" });
    const webhookMethod = await call("/api/webhooks/cal");
    const owner = await call("/api/owner/contacts");
    const foreignStatus = await call("/api/ask/status", { headers: { Origin: "https://attacker.example" } });
    const pausedStatus = await call("/api/ask/status", { headers: { Origin: env.ALLOWED_ORIGIN } });
    const statusMethod = await call("/api/ask/status", { method: "POST", headers: { Origin: env.ALLOWED_ORIGIN } });

    expect(foreignAsk.status).toBe(403);
    expect(unconfiguredAsk.status).toBe(503);
    expect(unconfiguredAsk.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("GET");
    expect(webhookMethod.status).toBe(405);
    expect(owner.status).toBe(503);
    expect(owner.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(foreignStatus.status).toBe(403);
    expect(await pausedStatus.json()).toEqual({ aiEnabled: false, allowance: null });
    expect(pausedStatus.headers.get("Access-Control-Allow-Origin")).toBe(env.ALLOWED_ORIGIN);
    expect(statusMethod.status).toBe(405);
  });

  it("runs scheduled maintenance without leaking errors", async () => {
    const waitUntil = vi.fn();
    worker.scheduled({} as ScheduledController, {}, { waitUntil } as unknown as ExecutionContext);
    await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("limits the inherited Cal bypass to signed exact POSTs and content-free exact-origin preflight", async () => {
    const env: Env = { ALLOWED_ORIGIN: "https://brandenfarmer.com", CAL_WEBHOOK_SECRET: "test-webhook-secret", PORTFOLIO_DB: {} as D1Database };
    const body = JSON.stringify({ triggerEvent: "MEETING_ENDED", payload: {} });
    const signature = await hmacHex(env.CAL_WEBHOOK_SECRET!, body);
    const call = (path: string, init?: RequestInit) => worker.fetch(
      new Request(`https://api.brandenfarmer.com${path}`, init) as unknown as Parameters<typeof worker.fetch>[0], env);
    expect((await call("/api/webhooks/cal", { method: "POST", headers: { "x-cal-signature-256": signature }, body })).status).toBe(202);
    expect((await call("/api/webhooks/cal", { method: "POST", body })).status).toBe(401);
    expect((await call("/api/webhooks/cal")).status).toBe(405);
    for (const path of ["/api/webhooks/cal/private", "/api/webhooks/cal/", "/api/webhooks/calibration", "/api/webhooks/cal/../owner/contacts", "/api/webhooks/cal/%2e%2e/owner/contacts"]) {
      expect((await call(path, { method: "POST", headers: { "x-cal-signature-256": signature }, body })).status).toBe(404);
      const preflight = await call(path, { method: "OPTIONS", headers: { Origin: env.ALLOWED_ORIGIN! } });
      expect(preflight.status).toBe(204);
      expect(await preflight.text()).toBe("");
    }
    const preflight = await call("/api/webhooks/cal", { method: "OPTIONS", headers: { Origin: env.ALLOWED_ORIGIN! } });
    expect(preflight.status).toBe(204);
    expect(await preflight.text()).toBe("");
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    for (const origin of ["https://attacker.example", "https://www.brandenfarmer.com"]) {
      const denied = await call("/api/webhooks/cal", { method: "OPTIONS", headers: { Origin: origin } });
      expect(denied.status).toBe(403);
      expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });

  it("returns a safe not-found response for unknown routes", async () => {
    const response = await worker.fetch(
      new Request("https://api.brandenfarmer.com/api/missing") as unknown as Parameters<typeof worker.fetch>[0],
      {},
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });
});

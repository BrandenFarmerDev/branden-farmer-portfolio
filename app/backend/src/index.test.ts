import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

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

  it("keeps Ask Branden unavailable and rejects unsupported methods", async () => {
    const askResponse = await worker.fetch(
      new Request("https://api.brandenfarmer.com/api/ask", { method: "POST" }) as unknown as Parameters<typeof worker.fetch>[0],
      {},
    );
    const methodResponse = await worker.fetch(
      new Request("https://api.brandenfarmer.com/api/health", { method: "POST" }) as unknown as Parameters<typeof worker.fetch>[0],
      {},
    );

    expect(askResponse.status).toBe(501);
    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("GET");
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

import { mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../index";
import type { Env } from "../types";
import { protectRequest } from "./request-protection";

const request = (ip?: string) => new Request("https://api.example/api/private?token=private-marker", {
  headers: ip === undefined ? {} : { "CF-Connecting-IP": ip },
});
const fetchWorker = (req: Request, env: Env) => worker.fetch(req as Parameters<typeof worker.fetch>[0], env);

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("API admission", () => {
  it("hashes the canonical trusted address once and ignores caller identity, route and method", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    const digest = vi.spyOn(crypto.subtle, "digest");
    const env = { API_RATE_LIMITER: { limit } };
    await protectRequest(request("2001:0DB8:0000:0:0:0:0:1"), env);
    await protectRequest(new Request("https://api.example/random?ip=attacker", { method: "DELETE", headers: {
      "CF-Connecting-IP": "2001:db8::1", "X-Forwarded-For": "192.0.2.8", "X-Real-IP": "192.0.2.9", Cookie: "identity=other",
    } }), env);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(digest).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0][0]).toEqual(limit.mock.calls[1][0]);
    expect(limit.mock.calls[0][0].key).toMatch(/^api:v1:[a-f0-9]{64}$/);
    await protectRequest(request("192.0.2.8"), env);
    expect(limit.mock.calls[2][0]).not.toEqual(limit.mock.calls[0][0]);
  });

  it("collapses missing, malformed, nonliteral and overlength IPs into one bounded bucket", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    for (const ip of [undefined, "", "999.0.0.1", "01.2.3.4", "a.example", "192.0.2.1:80", "[::1]", "fe80::1%eth0", "1.2.3.4,1.2.3.5", "a".repeat(46), "::::"]) {
      await protectRequest(request(ip), { API_RATE_LIMITER: { limit } });
    }
    expect(new Set(limit.mock.calls.map(([options]) => options.key)).size).toBe(1);
  });

  it.each([undefined, null, {}, { success: "true" }, { success: 1 }, { success: null }])("rejects malformed native outcomes %j", async (outcome) => {
    const response = await protectRequest(request(), { API_RATE_LIMITER: { limit: vi.fn().mockResolvedValue(outcome) } });
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: "rate_limit_unavailable" });
  });

  it("fails closed for missing, throwing and rejecting bindings without leaking diagnostics", async () => {
    for (const env of [{}, { API_RATE_LIMITER: { limit: vi.fn(() => { throw new Error("secret-marker"); }) } },
      { API_RATE_LIMITER: { limit: vi.fn().mockRejectedValue(new Error("secret-marker")) } }]) {
      const response = await protectRequest(request("192.0.2.1"), env);
      expect(response?.status).toBe(503);
      expect(response?.headers.get("Retry-After")).toBe("60");
    }
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(vi.mocked(console.warn).mock.calls.flat()).toEqual(Array(3).fill(JSON.stringify({ event: "api_admission", outcome: "rate_limit_unavailable", status: 503 })));
  });

  it.each(["resolve", "reject"])("bounds a stalled binding and ignores late %s without dispatch", async (settlement) => {
    vi.useFakeTimers();
    let resolve!: (outcome: { success: boolean }) => void;
    let reject!: (reason: Error) => void;
    const limit = vi.fn(() => new Promise<{ success: boolean }>((yes, no) => { resolve = yes; reject = no; }));
    const origin = vi.fn(() => "https://allowed.example");
    const req = request();
    const startedAt = Date.now();
    const responsePromise = fetchWorker(req, { API_RATE_LIMITER: { limit }, get ALLOWED_ORIGIN() { return origin(); } });
    // Native crypto completes outside the fake timer scheduler.
    await vi.waitFor(() => expect(limit).toHaveBeenCalledTimes(1));
    let completed = false;
    void responsePromise.then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(999 - (Date.now() - startedAt));
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await responsePromise).status).toBe(503);
    // Response hardening may consult the origin, but no business dispatch occurs.
    const calls = origin.mock.calls.length;
    if (settlement === "resolve") resolve({ success: true }); else reject(new Error("private-marker"));
    await Promise.resolve(); await Promise.resolve();
    expect(origin).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each(["missing", "throw", "reject", "malformed"])("prevents business effects when admission is %s", async (failure) => {
    const downstream = vi.fn(() => { throw new Error("must not dispatch"); });
    const limit = vi.fn().mockResolvedValue({ success: "true" });
    if (failure === "throw") limit.mockImplementation(() => { throw new Error("private-marker"); });
    if (failure === "reject") limit.mockRejectedValue(new Error("private-marker"));
    const req = new Request("https://api.example/api/contact", { method: "POST", body: "private-marker", headers: { Origin: "https://allowed.example" } });
    const read = vi.spyOn(req, "text");
    const response = await fetchWorker(req, {
      API_RATE_LIMITER: failure === "missing" ? undefined : { limit }, ALLOWED_ORIGIN: "https://allowed.example",
      get PORTFOLIO_DB() { return downstream(); }, get TURNSTILE_SECRET_KEY() { return downstream(); },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "rate_limit_unavailable" });
    expect(read).not.toHaveBeenCalled(); expect(downstream).not.toHaveBeenCalled();
  });

  it.each([
    ["OPTIONS", "/api/contact"], ["GET", "/api/health"], ["HEAD", "/api/owner/private-marker"],
    ["POST", "/api/contact"], ["POST", "/api/ask"], ["POST", "/api/webhooks/cal"],
    ["DELETE", "/api/owner/contacts"], ["PATCH", "/unknown/private-marker"],
  ])("counts and denies %s %s before route/auth/body/provider effects", async (method, path) => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const downstream = vi.fn(() => { throw new Error("must not dispatch"); });
    const req = new Request(`https://api.example${path}?secret=private-marker`, { method, headers: { Origin: "https://allowed.example", "CF-Connecting-IP": "192.0.2.1" },
      ...(["POST", "PATCH"].includes(method) ? { body: "private-marker" } : {}) });
    const bodyRead = vi.spyOn(req, "text");
    const response = await fetchWorker(req, { API_RATE_LIMITER: { limit }, ALLOWED_ORIGIN: "https://allowed.example",
      get PORTFOLIO_DB() { return downstream(); }, get ACCESS_AUD() { return downstream(); },
      get CAL_WEBHOOK_SECRET() { return downstream(); }, get TURNSTILE_SECRET_KEY() { return downstream(); } });
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledTimes(1);
    expect(bodyRead).not.toHaveBeenCalled(); expect(downstream).not.toHaveBeenCalled();
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Access-Control-Expose-Headers")).toBe("Retry-After");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://allowed.example");
    if (method === "HEAD") { expect(await response.text()).toBe(""); expect(response.headers.get("X-Robots-Tag")).toBe("noindex"); }
    else expect(await response.json()).toMatchObject({ error: "rate_limited" });
    expect(console.warn).toHaveBeenCalledTimes(1); expect(console.info).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private-marker|192\.0\.2\.1|api:v1|DELETE|PATCH/);
  });

  it("does not expose CORS permission to a denied foreign origin and keeps admitted HEAD bodyless", async () => {
    const denied = await fetchWorker(new Request("https://api.example/api/health", { headers: { Origin: "https://foreign.example" } }), { API_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } });
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const admitted = await fetchWorker(new Request("https://api.example/private-marker?token=private-marker", { method: "HEAD" }), { API_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) } });
    expect(admitted.status).toBe(404); expect(await admitted.text()).toBe("");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private-marker");
  });

  it("omits arbitrary request metadata from admitted error diagnostics", async () => {
    const origin = vi.fn().mockImplementationOnce(() => { throw new Error("private-marker"); }).mockReturnValue("https://allowed.example");
    const response = await fetchWorker(new Request("https://api.example/api/contact?token=private-marker", { method: "POST" }), {
      API_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
      get ALLOWED_ORIGIN() { return origin(); },
    });
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-marker");
  });
});


it("measures bounded local guard overhead with one mocked native call per sample", async () => {
  const limit = vi.fn().mockResolvedValue({ success: true });
  const env = { API_RATE_LIMITER: { limit } };
  const req = request("192.0.2.1");
  for (let i = 0; i < 100; i += 1) await protectRequest(req, env);
  const samples: number[] = [];
  for (let i = 0; i < 500; i += 1) {
    const started = performance.now();
    await protectRequest(req, env);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const evidence = { runtime: process.version, platform: process.platform, arch: process.arch,
    workload: "sequential warmed SHA-256 admission, mocked immediately successful native binding; no business dispatch",
    warmups: 100, samples: samples.length, p50Ms: samples[249], p95Ms: samples[474], maxMs: samples[499], nativeCalls: limit.mock.calls.length,
    caveat: "Local Node/Vitest measurement, not Cloudflare or production latency" };
  mkdirSync("../../reports", { recursive: true });
  writeFileSync("../../reports/api-rate-portfolio-guard-benchmark.json", JSON.stringify(evidence, null, 2));
  expect(limit).toHaveBeenCalledTimes(600);
  expect(evidence.p95Ms).toBeLessThan(10);
});

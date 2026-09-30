import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildKnowledgePassages, buildKnowledgeSql } from "../knowledge/corpus";
import { createTestD1 } from "../test/sqlite-d1";
import type { Env } from "../types";
import { askRoute, validateAskRequest } from "./ask";

let db: D1Database;
let close: () => void;
const answer = JSON.stringify({ answer: "Branden builds Power BI dashboards.", relevant: ["Power BI"], gaps: [],
  citations: ["skills-business-intelligence"] });

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORTFOLIO_DB: db,
    ASK_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    ASK_SIGNING_SECRET: "signing-secret",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    TURNSTILE_EXPECTED_HOSTNAME: "brandenfarmer.com",
    AI_ENABLED: "true",
    AI: { run: vi.fn().mockResolvedValue({ response: answer }) } as unknown as Ai,
    ...overrides,
  };
}

function ask(body: unknown = { mode: "question", text: "What Power BI experience does he have?", turnstileToken: "token" }, cookie?: string) {
  return new Request("https://api.brandenfarmer.com/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  ({ db, close } = createTestD1());
  await db.exec(buildKnowledgeSql(buildKnowledgePassages(), "v1", "2026-09-29T00:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
    Response.json({ success: true, action: "ask_branden", hostname: "brandenfarmer.com" })));
});

afterEach(() => {
  close();
  vi.unstubAllGlobals();
});

describe("askRoute", () => {
  it("answers with cited evidence, sets a visitor cookie, and declines the sixth daily answer", async () => {
    const env = createEnv();
    const first = await askRoute(ask(), env);
    const body = await first.json();
    expect(first.status).toBe(200);
    expect(body).toMatchObject({
      status: "answered",
      answer: "Branden builds Power BI dashboards.",
      evidence: [{ id: "skills-business-intelligence", url: "/resume#resume-skills-heading" }],
      remaining: 4,
    });
    const cookie = first.headers.get("Set-Cookie")!.split(";")[0];

    for (let index = 0; index < 4; index += 1) expect((await askRoute(ask(undefined, cookie), env)).status).toBe(200);
    const sixth = await askRoute(ask(undefined, cookie), env);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ status: "evidence_only", remaining: 0 });
    expect(env.AI!.run).toHaveBeenCalledTimes(5);
  });

  it("returns evidence without calling the model when AI is paused or evidence is missing", async () => {
    const env = createEnv({ AI_ENABLED: "false" });
    expect(await (await askRoute(ask(), env)).json()).toMatchObject({ status: "evidence_only", remaining: null });
    const missing = await askRoute(ask({ mode: "question", text: "What is his favorite color?", turnstileToken: "token" }), createEnv());
    expect(await missing.json()).toMatchObject({ status: "no_evidence", evidence: [{ url: "/resume" }, { url: "/about" }, { url: "/work" }] });
    expect(env.AI!.run).not.toHaveBeenCalled();
  });

  it("falls back to evidence when the model output is unsupported", async () => {
    const env = createEnv({ AI: { run: vi.fn().mockResolvedValue({ response: "{\"answer\":\"Guess\",\"citations\":[\"invented\"]}" }) } as unknown as Ai });
    expect(await (await askRoute(ask(), env)).json()).toMatchObject({ status: "evidence_only", remaining: 4 });
  });

  it("rejects invalid, throttled, and unverified requests before retrieval", async () => {
    expect((await askRoute(ask({ mode: "question", text: "x", turnstileToken: "token" }), createEnv())).status).toBe(400);
    const throttled = createEnv({ ASK_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } });
    expect((await askRoute(ask(), throttled)).status).toBe(429);
    const limiterDown = createEnv({ ASK_RATE_LIMITER: { limit: vi.fn().mockRejectedValue(new Error("down")) } });
    expect((await askRoute(ask(), limiterDown)).status).toBe(503);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ success: true, action: "contact_form", hostname: "brandenfarmer.com" }));
    expect((await askRoute(ask(), createEnv())).status).toBe(422);
  });

  it("fails closed when configuration or storage is unavailable", async () => {
    expect((await askRoute(ask(), createEnv({ PORTFOLIO_DB: undefined }))).status).toBe(503);
    const broken = { prepare: () => { throw new Error("down"); } } as unknown as D1Database;
    expect((await askRoute(ask(), createEnv({ PORTFOLIO_DB: broken }))).status).toBe(503);
    const noBatch = Object.assign(Object.create(db), { batch: () => Promise.reject(new Error("down")) }) as D1Database;
    const env = createEnv({ PORTFOLIO_DB: noBatch });
    expect((await askRoute(ask(), env)).status).toBe(503);
    expect(env.AI!.run).not.toHaveBeenCalled();
  });
});

describe("validateAskRequest", () => {
  it("enforces mode-specific lengths and strips control characters", () => {
    expect(validateAskRequest({ mode: "job_description", text: "short", turnstileToken: "t" })).toBeNull();
    expect(validateAskRequest({ mode: "job_description", text: `${"a".repeat(40)}\u0007`, turnstileToken: "t" }))
      .toEqual({ mode: "job_description", text: "a".repeat(40), turnstileToken: "t" });
    expect(validateAskRequest({ mode: "other", text: "Power BI", turnstileToken: "t" })).toBeNull();
    expect(validateAskRequest({ mode: "question", text: "Power BI", turnstileToken: "" })).toBeNull();
  });
});

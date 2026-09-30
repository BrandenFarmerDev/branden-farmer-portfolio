import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "../test/sqlite-d1";
import { DAILY_LIMITS, isAiEnabled, reserveQuota, resolveVisitor, type Visitor } from "./quota";

const secret = "test-signing-secret";
const day = "2026-09-29";
let db: D1Database;
let close: () => void;

function request(cookie?: string, ip = "192.0.2.1") {
  return new Request("https://api.brandenfarmer.com/api/ask", {
    headers: { "CF-Connecting-IP": ip, ...(cookie ? { Cookie: cookie } : {}) },
  });
}

async function counts() {
  return (await db.prepare("SELECT scope, count FROM ai_daily_usage ORDER BY scope").bind().all<{ scope: string; count: number }>()).results;
}

beforeEach(() => {
  ({ db, close } = createTestD1());
});

afterEach(() => close());

describe("visitor identity", () => {
  it("issues a signed cookie and recognizes it without reissuing", async () => {
    const first = await resolveVisitor(request(), secret, day);
    expect(first.setCookie).toMatch(/^ab_visitor=[0-9a-f-]{36}\.[0-9a-f]{32}; Path=\/api\/ask; .*HttpOnly; Secure; SameSite=Lax$/);

    const cookie = first.setCookie!.split(";")[0];
    const second = await resolveVisitor(request(`other=1; ${cookie}`), secret, day);
    expect(second).toMatchObject({ browserKey: first.browserKey, setCookie: undefined });

    const tampered = await resolveVisitor(request(`${cookie.slice(0, -1)}0`), secret, day);
    expect(tampered.browserKey).not.toBe(first.browserKey);
    expect(tampered.setCookie).toBeDefined();
  });
});

describe("daily allowance", () => {
  it("admits five browser questions, then rejects without charging other scopes", async () => {
    const visitor = await resolveVisitor(request(), secret, day);
    const remaining = [];
    for (let index = 0; index < DAILY_LIMITS.browser; index += 1) {
      const result = await reserveQuota(db, visitor, day);
      remaining.push(result.ok ? result.remaining : -1);
    }
    expect(remaining).toEqual([4, 3, 2, 1, 0]);
    expect(await reserveQuota(db, visitor, day)).toEqual({ ok: false });
    expect(await counts()).toEqual([
      { scope: "browser", count: 5 }, { scope: "global", count: 5 }, { scope: "ip", count: 5 },
    ]);
  });

  it("enforces the network and global limits across browsers", async () => {
    const visitors: Visitor[] = [];
    for (let index = 0; index < 4; index += 1) visitors.push(await resolveVisitor(request(), secret, day));
    let admitted = 0;
    for (const visitor of visitors) {
      for (let index = 0; index < DAILY_LIMITS.browser; index += 1) {
        if ((await reserveQuota(db, visitor, day)).ok) admitted += 1;
      }
    }
    expect(admitted).toBe(DAILY_LIMITS.ip);

    await db.prepare("UPDATE ai_daily_usage SET count = ? WHERE scope = 'global'").bind(DAILY_LIMITS.global).run();
    const outsider = await resolveVisitor(request(undefined, "198.51.100.7"), secret, day);
    expect(await reserveQuota(db, outsider, day)).toEqual({ ok: false });
  });

  it("rethrows storage errors so callers fail closed", async () => {
    const visitor = await resolveVisitor(request(), secret, day);
    const broken = { prepare: db.prepare, batch: () => Promise.reject(new Error("D1 unavailable")) } as unknown as D1Database;
    await expect(reserveQuota(broken, visitor, day)).rejects.toThrow("D1 unavailable");
  });
});

describe("AI kill switch", () => {
  it("requires the deployment flag, binding, and owner setting", async () => {
    const ai = {} as Ai;
    expect(await isAiEnabled({ AI_ENABLED: "false", AI: ai }, db)).toBe(false);
    expect(await isAiEnabled({ AI_ENABLED: "true" }, db)).toBe(false);
    expect(await isAiEnabled({ AI_ENABLED: "true", AI: ai }, db)).toBe(true);
    await db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('ai_enabled', 'false', ?)").bind(day).run();
    expect(await isAiEnabled({ AI_ENABLED: "true", AI: ai }, db)).toBe(false);
    const broken = { prepare: () => { throw new Error("down"); } } as unknown as D1Database;
    expect(await isAiEnabled({ AI_ENABLED: "true", AI: ai }, broken)).toBe(false);
  });
});

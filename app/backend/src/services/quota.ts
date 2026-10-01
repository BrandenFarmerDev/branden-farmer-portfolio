import type { AskAllowance } from "@portfolio/shared";
import { hmacHex, timingSafeEqual } from "./http";

export const DAILY_LIMITS = { browser: 5, ip: 15, global: 100 } as const;
const COOKIE_NAME = "ab_visitor";

type Scope = keyof typeof DAILY_LIMITS;
type ScopeCounts = Record<Scope, number>;

export function usageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function allowanceFrom(day: string, counts: ScopeCounts): AskAllowance {
  const resetsAt = new Date(`${day}T00:00:00Z`);
  resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
  const remaining = Math.min(...(Object.keys(DAILY_LIMITS) as Scope[]).map((scope) => DAILY_LIMITS[scope] - counts[scope]));
  return { used: counts.browser, limit: DAILY_LIMITS.browser, remaining: Math.max(0, remaining), resetsAt: resetsAt.toISOString() };
}

export interface Visitor {
  browserKey: string;
  ipKey: string;
  setCookie?: string;
}

export async function resolveVisitor(request: Request, secret: string, day: string): Promise<Visitor> {
  const cookie = request.headers.get("Cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  const [id, signature] = cookie?.split(".") ?? [];
  const valid = Boolean(id && signature && /^[0-9a-f-]{36}$/.test(id)
    && timingSafeEqual(signature, (await hmacHex(secret, `visitor:${id}`)).slice(0, 32)));
  const visitorId = valid ? id : crypto.randomUUID();
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";

  return {
    browserKey: await hmacHex(secret, `browser:${visitorId}`),
    ipKey: await hmacHex(secret, `ip:${day}:${ip}`),
    setCookie: valid ? undefined : `${COOKIE_NAME}=${visitorId}.${(await hmacHex(secret, `visitor:${visitorId}`)).slice(0, 32)}; `
      + "Path=/api/ask; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax",
  };
}

export async function readAllowance(db: D1Database, visitor: Visitor, day: string): Promise<AskAllowance> {
  const { results } = await db.prepare(`SELECT scope, count FROM ai_daily_usage WHERE usage_day = ?
    AND ((scope = 'browser' AND key_hash = ?) OR (scope = 'ip' AND key_hash = ?) OR (scope = 'global' AND key_hash = 'all'))`)
    .bind(day, visitor.browserKey, visitor.ipKey).all<{ scope: Scope; count: number }>();
  const counts: ScopeCounts = { browser: 0, ip: 0, global: 0 };
  for (const row of results) counts[row.scope] = row.count;
  return allowanceFrom(day, counts);
}

export type QuotaResult = { ok: true; remaining: number; allowance: AskAllowance } | { ok: false };

export async function reserveQuota(db: D1Database, visitor: Visitor, day: string): Promise<QuotaResult> {
  const now = new Date().toISOString();
  const statement = db.prepare(`INSERT INTO ai_daily_usage (usage_day, scope, key_hash, count, daily_limit, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT (usage_day, scope, key_hash) DO UPDATE SET count = ai_daily_usage.count + 1,
      daily_limit = excluded.daily_limit, updated_at = excluded.updated_at
    RETURNING scope, count, daily_limit`);
  try {
    // One D1 batch is a transaction: a CHECK failure on any scope rolls back all three reservations.
    const results = await db.batch<{ scope: Scope; count: number }>([
      statement.bind(day, "browser", visitor.browserKey, DAILY_LIMITS.browser, now),
      statement.bind(day, "ip", visitor.ipKey, DAILY_LIMITS.ip, now),
      statement.bind(day, "global", "all", DAILY_LIMITS.global, now),
    ]);
    const counts: ScopeCounts = { browser: 0, ip: 0, global: 0 };
    for (const { results: [row] } of results) counts[row.scope] = row.count;
    const allowance = allowanceFrom(day, counts);
    return { ok: true, remaining: allowance.remaining, allowance };
  } catch (error) {
    if (error instanceof Error && /CHECK constraint failed/i.test(error.message)) return { ok: false };
    throw error;
  }
}

export async function isAiEnabled(env: { AI_ENABLED?: string; AI?: Ai }, db: D1Database): Promise<boolean> {
  if (env.AI_ENABLED !== "true" || !env.AI) return false;
  try {
    const setting = await db.prepare("SELECT value FROM app_settings WHERE key = 'ai_enabled'").first<{ value: string }>();
    return setting?.value !== "false";
  } catch {
    return false;
  }
}

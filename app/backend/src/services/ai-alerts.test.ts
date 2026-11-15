/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "../test/sqlite-d1";
import type { Env } from "../types";
import { attemptAlertDelivery, dispatchAiFailureAlert, recordAiFailure, runAiAlertMaintenance, VERIFICATION_KEY } from "./ai-alerts";

let db: D1Database;
let close: () => void;
const DAY = "2026-11-16";
const at = (time: string, day = DAY) => new Date(`${day}T${time}Z`);
const accepted = (id = "0f5d5c1e-1111-4222-8333-444455556666") => Response.json({ id });
const status = (code: number, name = "error") => Response.json({ name }, { status: code });
const documentedSeed = readFileSync(new URL("../../../../docs/ask-model-migration.md", import.meta.url), "utf8")
  .match(/INSERT INTO app_settings \(key, value, updated_at\) VALUES \('ai_failure_alert_verification'[\s\S]+?DO NOTHING;/)![0];

function env(overrides: Partial<Env> = {}): Env {
  return {
    PORTFOLIO_DB: db,
    RESEND_API_KEY: "resend-key",
    CONTACT_FROM_EMAIL: "Portfolio <alerts@example.com>",
    CONTACT_TO_EMAIL: "sandbox@example.com",
    OWNER_EMAIL: "owner@example.com",
    ALLOWED_ORIGIN: "https://preview.example.com",
    ...overrides,
  };
}

async function value(key: string): Promise<string | undefined> {
  return (await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>())?.value;
}
const stored = async (key: string) => { const raw = await value(key); return raw === undefined ? null : JSON.parse(raw); };
const count = async (key: string) => Number(await value(key));

function sentRequest(call: number) {
  const [, init] = vi.mocked(fetch).mock.calls[call] as [string, RequestInit];
  return { headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
}

/** A D1 stand-in that lets a test intercept particular statements. */
function interceptingDb(onPrepare: (sql: string) => void): D1Database {
  return new Proxy(db, { get: (target, property) => property === "prepare"
    ? (sql: string) => { onPrepare(sql); return target.prepare(sql); }
    : Reflect.get(target, property) });
}

/** Fails the outcome write of any attempt that submits after this point, simulating a lost acknowledgement. */
function lostAckAfterSend(): D1Database {
  const submitted = vi.mocked(fetch).mock.calls.length;
  return interceptingDb((sql) => {
    if (sql.startsWith("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ? AND value = ?")
      && vi.mocked(fetch).mock.calls.length > submitted) throw new Error("D1 unavailable");
  });
}

async function arm(): Promise<void> {
  await db.exec(documentedSeed.replaceAll("<ISO time>", new Date().toISOString()));
}

beforeEach(() => {
  ({ db, close } = createTestD1());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at("10:00:00.000"));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => accepted()));
});

afterEach(() => {
  close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("recording failures (B1)", () => {
  it("counts every one of many simultaneous same-category failures once, under a single incident", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => recordAiFailure(db, "timeout")));
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await count(`ai_failure_count:timeout:${DAY}`)).toBe(12);
    expect(await stored(`ai_failure_alert:timeout:${DAY}`)).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("starts a new record each UTC day without overwriting an unsent one", async () => {
    await recordAiFailure(db, "provider_error");
    vi.setSystemTime(at("00:00:01.000", "2026-11-17"));
    expect(await recordAiFailure(db, "provider_error")).toEqual({ key: "ai_failure_alert:provider_error:2026-11-17", created: true });
    expect(await stored(`ai_failure_alert:provider_error:${DAY}`)).toMatchObject({ status: "pending" });
    expect(await count(`ai_failure_count:provider_error:${DAY}`)).toBe(1);
  });
});

describe("delivery", () => {
  it("sends the first alert immediately with fixed content to the environment recipient", async () => {
    const { key } = await recordAiFailure(db, "provider_error");
    expect(await dispatchAiFailureAlert(env(), key)).toBe("accepted");
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = sentRequest(0);
    expect(request.headers["Idempotency-Key"]).toBe(`ai-failure-alert/preview.example.com/provider_error/${DAY}`);
    expect(Object.keys(request.body).sort()).toEqual(["from", "subject", "text", "to"]);
    expect(request.body).toMatchObject({ to: ["sandbox@example.com"], subject: "Ask Branden AI failure: provider_error (preview.example.com)" });
    expect(await stored(key)).toMatchObject({ status: "sent", attempts: 1, providerId: "0f5d5c1e-1111-4222-8333-444455556666", claimId: null });
  });

  it("retries with the identical frozen payload, then stops at three attempts", async () => {
    vi.mocked(fetch).mockImplementation(async () => status(429));
    const { key } = await recordAiFailure(db, "invalid_output");
    expect(await dispatchAiFailureAlert(env(), key)).toBe("retry_later");
    await expect(runAiAlertMaintenance(env())).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sentRequest(2)).toEqual(sentRequest(0));
    expect(await stored(key)).toMatchObject({ status: "failed", attempts: 3, possiblyAccepted: false });
    await runAiAlertMaintenance(env());
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("lets only one of several concurrent dispatchers claim and send", async () => {
    const { key } = await recordAiFailure(db, "provider_error");
    const results = await Promise.all([dispatchAiFailureAlert(env(), key), dispatchAiFailureAlert(env(), key), runAiAlertMaintenance(env())]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result === "accepted")).toHaveLength(1);
  });

  it("does not let a stale worker overwrite the outcome of a newer claim", async () => {
    const { key } = await recordAiFailure(db, "provider_error");
    vi.mocked(fetch).mockImplementationOnce(async () => {
      vi.setSystemTime(at("10:02:00.000")); // the first worker stalls past its lease
      expect(await attemptAlertDelivery(env(), key, (await value(key))!, Date.now() + 16_000)).toBe("accepted");
      return accepted("aaaaaaaa-1111-4222-8333-444455556666");
    }).mockResolvedValueOnce(accepted("bbbbbbbb-2222-4333-8444-555566667777"));
    expect(await attemptAlertDelivery(env(), key, (await value(key))!, Date.now() + 16_000)).toBe("not_eligible");
    expect(await stored(key)).toMatchObject({ status: "sent", attempts: 2, providerId: "bbbbbbbb-2222-4333-8444-555566667777" });
  });

  it("sends at most one alert per category per dispatch day, including a retry that crosses midnight", async () => {
    vi.setSystemTime(at("23:00:00.000"));
    vi.mocked(fetch).mockImplementation(async () => status(429));
    const late = await recordAiFailure(db, "provider_error");
    await dispatchAiFailureAlert(env(), late.key);
    vi.mocked(fetch).mockImplementation(async () => accepted());
    vi.setSystemTime(at("07:00:00.000", "2026-11-17"));
    await runAiAlertMaintenance(env());
    expect(await stored(late.key)).toMatchObject({ status: "sent", attempts: 3 });
    vi.setSystemTime(at("07:30:00.000", "2026-11-17"));
    const next = await recordAiFailure(db, "provider_error");
    expect(await dispatchAiFailureAlert(env(), next.key)).toBe("deferred");
    expect(await stored(next.key)).toMatchObject({ status: "pending", attempts: 0 });
    expect((await dispatchAiFailureAlert(env(), (await recordAiFailure(db, "timeout")).key))).toBe("accepted");
    vi.setSystemTime(at("07:00:00.000", "2026-11-18"));
    await runAiAlertMaintenance(env());
    expect(await stored(next.key)).toMatchObject({ status: "sent", attempts: 1 });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it("stays pending without configuration or background time, without any outbound call", async () => {
    const { key } = await recordAiFailure(db, "provider_error");
    expect(await dispatchAiFailureAlert(env({ RESEND_API_KEY: undefined }), key)).toBe("unavailable");
    expect(await dispatchAiFailureAlert(env(), key, Date.now() - 27_000)).toBe("retry_later");
    expect(await dispatchAiFailureAlert({}, key)).toBe("unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect(await stored(key)).toMatchObject({ status: "pending", attempts: 0 });
  });
});

describe("dispatch day and deadline after asynchronous work (B3)", () => {
  it("sends nothing when a delayed claim leaves no time inside the shared deadline", async () => {
    vi.setSystemTime(at("23:59:59.000"));
    const { key } = await recordAiFailure(db, "timeout");
    const startedAt = Date.now();
    let delayed = false;
    const slow = interceptingDb((sql) => {
      if (!delayed && sql.startsWith("UPDATE app_settings SET value = ?")) { delayed = true; vi.setSystemTime(at("00:00:30.000", "2026-11-17")); }
    });
    expect(await dispatchAiFailureAlert(env({ PORTFOLIO_DB: slow }), key, startedAt)).toBe("retry_later");
    expect(fetch).not.toHaveBeenCalled();
    expect(await stored(key)).toMatchObject({ status: "pending", attempts: 0, payload: null });
  });

  it("counts a delayed claim that crosses midnight against the new day's slot", async () => {
    vi.setSystemTime(at("23:59:55.000"));
    const { key } = await recordAiFailure(db, "timeout");
    let delayed = false;
    const slow = interceptingDb((sql) => {
      if (!delayed && sql.startsWith("UPDATE app_settings SET value = ?")) { delayed = true; vi.setSystemTime(at("00:00:05.000", "2026-11-17")); }
    });
    expect(await dispatchAiFailureAlert(env({ PORTFOLIO_DB: slow }), key, Date.now())).toBe("accepted");
    expect(await value("ai_failure_alert_slot:timeout:2026-11-17")).toBe(key);
    expect(await value(`ai_failure_alert_slot:timeout:${DAY}`)).toBeUndefined();
    const next = await recordAiFailure(db, "timeout");
    expect(await dispatchAiFailureAlert(env(), next.key)).toBe("deferred");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("unused dispatch reservations are released (B3)", () => {
  const CLAIM = "UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ? AND value = ?";
  const SLOT = "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING RETURNING value";
  /** Advances the clock once, after the first claim write or after the first slot reservation batch. */
  function delayingDb(after: "claim" | "slot", ms: number, during?: () => Promise<void>): D1Database {
    let armed = true;
    let slotPending = false;
    return new Proxy(db, { get: (target, property) => {
      if (property === "prepare") return (sql: string) => {
        const statement = target.prepare(sql);
        if (sql.startsWith(SLOT)) slotPending = true;
        if (after !== "claim" || !sql.startsWith(CLAIM)) return statement;
        return { ...statement, bind: (...values: unknown[]) => { const bound = statement.bind(...values);
          return { ...bound, run: async () => { const result = await bound.run();
            if (armed && JSON.parse(String(values[0])).status === "claimed") { armed = false; vi.setSystemTime(Date.now() + ms); await during?.(); }
            return result; } }; } };
      };
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        const result = await target.batch(statements);
        if (after === "slot" && armed && slotPending) { armed = false; vi.setSystemTime(Date.now() + ms); await during?.(); }
        slotPending = false;
        return result;
      };
      return Reflect.get(target, property);
    } });
  }

  it.each(["claim", "slot"] as const)("frees today's slot when a prior-day retry runs out of time after its %s", async (after) => {
    const previous = await recordAiFailure(db, "timeout", at("22:00:00.000", "2026-11-15"));
    vi.setSystemTime(at("06:59:50.000"));
    const result = await attemptAlertDelivery(env({ PORTFOLIO_DB: delayingDb(after, 17_000) }), previous.key, (await value(previous.key))!, Date.now() + 16_000);
    expect(result).toBe("retry_later");
    expect(fetch).not.toHaveBeenCalled();
    expect(await value(`ai_failure_alert_slot:timeout:${DAY}`)).toBeUndefined();
    expect(await stored(previous.key)).toMatchObject({ status: "pending", attempts: 0 });

    const today = await recordAiFailure(db, "timeout");
    expect(await dispatchAiFailureAlert(env(), today.key)).toBe("accepted");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await value(`ai_failure_alert_slot:timeout:${DAY}`)).toBe(today.key);
  });

  it("keeps a slot that an earlier, possibly accepted same-incident submission used", async () => {
    const previous = await recordAiFailure(db, "timeout", at("22:00:00.000", "2026-11-15"));
    vi.setSystemTime(at("07:00:00.000"));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network"));
    await attemptAlertDelivery(env(), previous.key, (await value(previous.key))!, Date.now() + 16_000);
    expect(await stored(previous.key)).toMatchObject({ status: "pending", attempts: 1, possiblyAccepted: true });

    expect(await attemptAlertDelivery(env({ PORTFOLIO_DB: delayingDb("claim", 17_000) }), previous.key,
      (await value(previous.key))!, Date.now() + 16_000)).toBe("retry_later");
    expect(await value(`ai_failure_alert_slot:timeout:${DAY}`)).toBe(previous.key);
    expect(await dispatchAiFailureAlert(env(), (await recordAiFailure(db, "timeout")).key)).toBe("deferred");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never frees a slot that a newer claimant of the same incident is relying on", async () => {
    const { key } = await recordAiFailure(db, "timeout");
    const replacement = async () => {
      // The first worker stalls past its lease; a second worker reclaims the incident and sends under the same slot.
      expect(await attemptAlertDelivery(env(), key, (await value(key))!, Date.now() + 16_000)).toBe("accepted");
    };
    const stalled = delayingDb("slot", 70_000, replacement);
    expect(await attemptAlertDelivery(env({ PORTFOLIO_DB: stalled }), key, (await value(key))!, Date.now() + 16_000)).toBe("retry_later");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await value(`ai_failure_alert_slot:timeout:${DAY}`)).toBe(key);
    expect(await stored(key)).toMatchObject({ status: "sent", attempts: 2, possiblyAccepted: true });
  });
});

describe("possible acceptance is sticky (B4)", () => {
  it("keeps an uncertain submission unknown after later definite failures", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(status(429)).mockResolvedValueOnce(status(429));
    const { key } = await recordAiFailure(db, "timeout");
    await dispatchAiFailureAlert(env(), key);
    await runAiAlertMaintenance(env());
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await stored(key)).toMatchObject({ status: "unknown", possiblyAccepted: true });
  });

  it("keeps a payload conflict after an uncertain attempt unknown, and resolves only on a positive acknowledgement", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(status(409, "invalid_idempotent_request"));
    const conflict = await recordAiFailure(db, "timeout");
    await dispatchAiFailureAlert(env(), conflict.key);
    expect(await stored(conflict.key)).toMatchObject({ status: "unknown", attempts: 2 });

    vi.mocked(fetch).mockResolvedValueOnce(status(409, "concurrent_idempotent_requests")).mockResolvedValueOnce(accepted());
    const resolved = await recordAiFailure(db, "provider_error");
    expect(await dispatchAiFailureAlert(env(), resolved.key)).toBe("accepted");
    expect(await stored(resolved.key)).toMatchObject({ status: "sent", possiblyAccepted: true });
    expect(sentRequest(3).headers["Idempotency-Key"]).toBe(sentRequest(2).headers["Idempotency-Key"]);
  });

  it("treats an abandoned in-flight claim as possibly accepted when reclaimed or expired", async () => {
    const reclaimed = await recordAiFailure(db, "timeout");
    await dispatchAiFailureAlert(env({ PORTFOLIO_DB: lostAckAfterSend() }), reclaimed.key); // sent, but the outcome was never recorded
    expect(await stored(reclaimed.key)).toMatchObject({ status: "claimed", possiblyAccepted: false });

    vi.setSystemTime(at("10:05:00.000"));
    vi.mocked(fetch).mockResolvedValueOnce(status(422));
    await runAiAlertMaintenance(env());
    expect(await stored(reclaimed.key)).toMatchObject({ status: "unknown", possiblyAccepted: true });

    vi.setSystemTime(at("11:00:00.000"));
    const expired = await recordAiFailure(db, "provider_error");
    await dispatchAiFailureAlert(env({ PORTFOLIO_DB: lostAckAfterSend() }), expired.key);
    vi.setSystemTime(at("10:30:00.000", "2026-11-17"));
    await runAiAlertMaintenance(env());
    expect(await stored(expired.key)).toMatchObject({ status: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps an accepted-but-unrecorded submission unknown when routing changes before recovery", async () => {
    const events = await Promise.all(Array.from({ length: 16 }, () => recordAiFailure(db, "timeout")));
    const { key } = events.find((event) => event.created)!;
    await dispatchAiFailureAlert(env({ PORTFOLIO_DB: lostAckAfterSend() }), key); // provider accepted; outcome write lost
    const outstanding = await stored(key);
    expect(outstanding).toMatchObject({ status: "claimed", possiblyAccepted: false });

    vi.setSystemTime(Date.now() + 120_000);
    await expect(runAiAlertMaintenance(env({ CONTACT_TO_EMAIL: "revised-sandbox@example.com" }))).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await stored(key)).toMatchObject({ status: "unknown", possiblyAccepted: true, providerId: null, payload: outstanding.payload });
    expect(await count(`ai_failure_count:timeout:${DAY}`)).toBe(16);
  });

  it("still records a definite failure when nothing was possibly accepted before routing changed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(status(429));
    const { key } = await recordAiFailure(db, "timeout");
    await attemptAlertDelivery(env(), key, (await value(key))!, Date.now() + 16_000);
    await expect(runAiAlertMaintenance(env({ CONTACT_TO_EMAIL: "revised-sandbox@example.com" }))).rejects.toThrow();
    expect(await stored(key)).toMatchObject({ status: "failed", possiblyAccepted: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires an uncertain attempt as unknown after the idempotency window instead of resending", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({})).mockRejectedValueOnce(new TypeError("network"));
    const { key } = await recordAiFailure(db, "provider_error");
    await dispatchAiFailureAlert(env(), key);
    vi.setSystemTime(at("09:30:00.000", "2026-11-17"));
    await runAiAlertMaintenance(env());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await stored(key)).toMatchObject({ status: "unknown", attempts: 2 });
  });
});

describe("maintenance failures are visible (B5)", () => {
  it("rejects without sending when expiry cannot be written", async () => {
    await recordAiFailure(db, "timeout", at("10:00:00.000", "2026-11-13"));
    const failing = interceptingDb((sql) => { if (sql.startsWith("UPDATE app_settings SET value = json_set")) throw new Error("D1 unavailable"); });
    await expect(runAiAlertMaintenance(env({ PORTFOLIO_DB: failing }))).rejects.toThrow();
    await expect(runAiAlertMaintenance(env({ PORTFOLIO_DB: failing, RESEND_API_KEY: undefined }))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(await stored(`ai_failure_alert:timeout:2026-11-13`)).toMatchObject({ status: "pending" });
  });

  it("rejects when due work cannot be delivered, but not when there is no work", async () => {
    await expect(runAiAlertMaintenance(env({ RESEND_API_KEY: undefined }))).resolves.toBeUndefined();
    await recordAiFailure(db, "timeout");
    await expect(runAiAlertMaintenance(env({ RESEND_API_KEY: undefined }))).rejects.toThrow("1 due record");
    await expect(runAiAlertMaintenance(env({ CONTACT_TO_EMAIL: undefined }))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never dispatches an unattempted incident older than its expiry", async () => {
    const { key } = await recordAiFailure(db, "timeout", at("10:00:00.000", "2026-11-13"));
    expect(await dispatchAiFailureAlert(env(), key)).toBe("not_eligible");
    await runAiAlertMaintenance(env());
    expect(await stored(key)).toMatchObject({ status: "expired" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("persisted state cannot authorize egress (B6)", () => {
  const tamper = async (key: string, patch: Record<string, unknown>) => {
    const record = { ...(await stored(key)), ...patch };
    await db.prepare("UPDATE app_settings SET value = ? WHERE key = ?").bind(JSON.stringify(record), key).run();
  };
  const frozen = (overrides: Record<string, unknown> = {}) => ({
    from: "Portfolio <alerts@example.com>", to: ["sandbox@example.com"], subject: "Ask Branden AI failure: timeout (preview.example.com)",
    text: "x", idempotencyKey: `ai-failure-alert/preview.example.com/timeout/${DAY}`, ...overrides });

  it.each([
    ["an unapproved recipient", { attempts: 1, firstAttemptAt: at("10:00:00.000").toISOString(), payload: frozen({ to: ["attacker@example.com"] }) }],
    ["an altered message", { attempts: 1, firstAttemptAt: at("10:00:00.000").toISOString(), payload: frozen({ text: "custom" }) }],
    ["an arbitrary idempotency key", { attempts: 1, firstAttemptAt: at("10:00:00.000").toISOString(), payload: frozen({ idempotencyKey: "anything" }) }],
    ["a payload on an unattempted record", { payload: frozen() }],
    ["a mismatched category", { category: "provider_error" }],
    ["a mismatched day", { day: "2026-11-15", firstAt: at("10:00:00.000", "2026-11-15").toISOString() }],
    ["a negative attempt count", { attempts: -1 }],
    ["an unexpected field", { recipient: "attacker@example.com" }],
  ])("refuses to send a record with %s and reports it", async (_case, patch) => {
    const { key } = await recordAiFailure(db, "timeout");
    await tamper(key, patch);
    await expect(runAiAlertMaintenance(env())).rejects.toThrow();
    expect(await dispatchAiFailureAlert(env(), key)).not.toBe("accepted");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes an exhausted pending record without sending it", async () => {
    const { key } = await recordAiFailure(db, "timeout");
    await tamper(key, { attempts: 3, firstAttemptAt: at("10:00:00.000").toISOString(), payload: frozen() });
    await runAiAlertMaintenance(env());
    expect(await dispatchAiFailureAlert(env(), key)).toBe("not_eligible");
    expect(await stored(key)).toMatchObject({ status: "failed" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed instead of sending or rewriting when routing changes after the first attempt", async () => {
    vi.mocked(fetch).mockResolvedValue(status(429));
    const { key } = await recordAiFailure(db, "timeout");
    await dispatchAiFailureAlert(env(), key);
    const captured = (await stored(key)).payload;
    await expect(runAiAlertMaintenance(env({ CONTACT_TO_EMAIL: "changed@example.com" }))).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await stored(key)).toMatchObject({ status: "failed", payload: captured });
  });

  it("rejects unreadable records during maintenance without breaking expiry or retention", async () => {
    await db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, 'not json', ?)")
      .bind(`ai_failure_alert:provider_error:${DAY}`, at("10:00:00.000").toISOString()).run();
    const { key } = await recordAiFailure(db, "timeout");
    await expect(runAiAlertMaintenance(env())).rejects.toThrow("1 due record");
    expect(await stored(key)).toMatchObject({ status: "sent" });
  });

  it("cannot route an incident record to the owner address", async () => {
    const { key } = await recordAiFailure(db, "timeout");
    await db.prepare("UPDATE app_settings SET key = ? WHERE key = ?").bind(`ai_failure_alert:verification:${DAY}`, key).run();
    await expect(runAiAlertMaintenance(env())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("one-shot verification (B2)", () => {
  it("sends the documented seed once to the owner and never re-arms it across days, repeats or concurrent runs", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network")); // ambiguous outcome
    await arm();
    await Promise.all([runAiAlertMaintenance(env()), runAiAlertMaintenance(env())]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentRequest(0).body).toMatchObject({ to: ["owner@example.com"], subject: "[Verification] Ask Branden AI failure alert test (preview.example.com)" });
    expect(sentRequest(0).headers["Idempotency-Key"]).toBe("ai-failure-alert/preview.example.com/verification");
    expect(await stored(VERIFICATION_KEY)).toMatchObject({ status: "unknown" });

    await arm();
    vi.setSystemTime(at("07:00:00.000", "2026-11-17"));
    await arm();
    await runAiAlertMaintenance(env());
    vi.setSystemTime(at("07:00:00.000", "2027-03-01"));
    await runAiAlertMaintenance(env());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await stored(VERIFICATION_KEY)).toMatchObject({ status: "unknown" });
  });

  it("stays spent when its outcome cannot be recorded", async () => {
    await arm();
    await expect(runAiAlertMaintenance(env({ PORTFOLIO_DB: lostAckAfterSend() }))).rejects.toThrow();
    expect(await stored(VERIFICATION_KEY)).toMatchObject({ status: "consumed" });
    await arm();
    await runAiAlertMaintenance(env());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stays armed and reports the gap while delivery is not configured", async () => {
    await arm();
    await expect(runAiAlertMaintenance(env({ OWNER_EMAIL: undefined }))).rejects.toThrow();
    expect(await stored(VERIFICATION_KEY)).toEqual({ status: "armed" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("retention", () => {
  it("deletes old terminal records, slots and counts but never the verification marker", async () => {
    const old = "2026-07-01T00:00:00.000Z";
    const record = (category: string) => JSON.stringify({ category, day: "2026-07-01", firstAt: old, status: "failed", attempts: 1,
      claimId: null, leaseUntil: null, firstAttemptAt: old, possiblyAccepted: false,
      payload: { from: "a", to: ["b"], subject: "s", text: "t", idempotencyKey: "k" }, providerId: null });
    const insert = (key: string, stored: string) => db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(key, stored, old);
    await db.batch([
      insert("ai_failure_alert:timeout:2026-07-01", record("timeout")),
      insert("ai_failure_count:timeout:2026-07-01", "3"),
      insert("ai_failure_alert_slot:timeout:2026-07-01", "ai_failure_alert:timeout:2026-07-01"),
      insert(VERIFICATION_KEY, JSON.stringify({ status: "failed", consumedAt: old })),
      insert("ai_enabled", "true"),
    ]);
    await runAiAlertMaintenance(env());
    const keys = (await db.prepare("SELECT key FROM app_settings ORDER BY key").all<{ key: string }>()).results.map((row) => row.key);
    expect(keys).toEqual(["ai_enabled", VERIFICATION_KEY]);
  });
});

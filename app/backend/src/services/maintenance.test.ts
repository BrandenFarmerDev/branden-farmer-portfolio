import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "../test/sqlite-d1";
import { MAINTENANCE_RECORD_LIMIT, recordAiFailure, VERIFICATION_KEY } from "./ai-alerts";
import { runMaintenance, runScheduledTasks } from "./maintenance";

let db: D1Database;
let close: () => void;

async function count(table: string): Promise<number> {
  return (await db.prepare(`SELECT count(*) AS total FROM ${table}`).first<{ total: number }>())!.total;
}

beforeEach(async () => {
  ({ db, close } = createTestD1());
  const old = "2020-01-01T00:00:00.000Z";
  const recent = new Date().toISOString();
  await db.exec(`
    INSERT INTO contact_submissions (submission_id, name, email, company, position, message, submitted_at, last_interaction_at)
      VALUES ('old', 'Old', 'old@example.com', 'Acme', 'Dev', 'Old message for retention testing.', '${old}', '${old}'),
             ('due', 'Due', 'due@example.com', 'Acme', 'Dev', 'Pending message for retry testing.', '${recent}', '${recent}');
    UPDATE contact_submissions SET next_retry_at = '${old}' WHERE submission_id = 'due';
    INSERT INTO booking_history (booking_uid, name, email, start_at, end_at, status, source, created_at, updated_at)
      VALUES ('b-old', 'Old', 'old@example.com', '${old}', '${old}', 'booked', 'cal', '${old}', '${old}');
    INSERT INTO booking_events (provider_event_key, booking_uid, event_type, occurred_at, received_at)
      VALUES ('e-old', 'b-old', 'created', '${old}', '${old}');
    INSERT INTO ai_daily_usage (usage_day, scope, key_hash, count, daily_limit, updated_at)
      VALUES ('2020-01-01', 'global', 'all', 1, 100, '${old}');
    INSERT INTO ai_usage_summary (usage_day, model, calls) VALUES ('2020-01-01', 'm', 1);
  `);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ id: "email" })));
});

afterEach(() => {
  close();
  vi.unstubAllGlobals();
});

describe("runMaintenance", () => {
  it("retries due deliveries and removes expired personal data and counters", async () => {
    await runMaintenance({ PORTFOLIO_DB: db, RESEND_API_KEY: "key", CONTACT_FROM_EMAIL: "from@example.com", CONTACT_TO_EMAIL: "to@example.com" });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await db.prepare("SELECT submission_id, owner_notification_state, confirmation_state FROM contact_submissions").bind().all())
      .toMatchObject({ results: [{ submission_id: "due", owner_notification_state: "sent", confirmation_state: "sent" }] });
    for (const table of ["booking_history", "booking_events", "ai_daily_usage", "ai_usage_summary"]) expect(await count(table)).toBe(0);
  });

  it("does nothing without storage and skips email retries without Resend", async () => {
    await runMaintenance({});
    await runMaintenance({ PORTFOLIO_DB: db });
    expect(fetch).not.toHaveBeenCalled();
    expect(await count("contact_submissions")).toBe(1);
  });
});

describe("runScheduledTasks", () => {
  const failingWhen = (fragment: string) => new Proxy(db, { get: (target, property) => property === "prepare"
    ? (sql: string) => { if (sql.includes(fragment)) throw new Error("D1 unavailable"); return target.prepare(sql); }
    : Reflect.get(target, property) });

  it("completes contact maintenance even when alert recovery fails, then reports the run as failed", async () => {
    await expect(runScheduledTasks({ PORTFOLIO_DB: failingWhen("substr(key") })).rejects.toThrow("Scheduled maintenance did not complete.");
    expect(await count("ai_usage_summary")).toBe(0);
  });

  it("still runs alert recovery when contact maintenance fails", async () => {
    await recordAiFailure(db, "timeout", new Date("2020-01-01T00:00:00.000Z"));
    await expect(runScheduledTasks({ PORTFOLIO_DB: failingWhen("DELETE FROM contact_submissions") })).rejects.toThrow();
    const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind("ai_failure_alert:timeout:2020-01-01").first<{ value: string }>();
    expect(JSON.parse(row!.value)).toMatchObject({ status: "expired" });
  });

  it("lets alert recovery finish while slow contact retries are still in progress", async () => {
    await recordAiFailure(db, "timeout");
    let releaseContact!: () => void;
    const contactHeld = new Promise<void>((resolve) => { releaseContact = resolve; });
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (JSON.parse(String(init?.body)).subject.startsWith("Ask Branden AI failure")) return Response.json({ id: "0f5d5c1e-1111-4222-8333-444455556666" });
      await contactHeld;
      return Response.json({ id: "email" });
    });

    const run = runScheduledTasks({ PORTFOLIO_DB: db, RESEND_API_KEY: "key", CONTACT_FROM_EMAIL: "from@example.com", CONTACT_TO_EMAIL: "to@example.com" });
    await vi.waitFor(async () => {
      const row = await db.prepare("SELECT value FROM app_settings WHERE key LIKE ?").bind("ai_failure_alert:timeout:%").first<{ value: string }>();
      expect(JSON.parse(row!.value)).toMatchObject({ status: "sent" });
    });
    releaseContact();
    await expect(run).resolves.toBeUndefined();
    expect(await db.prepare("SELECT owner_notification_state FROM contact_submissions WHERE submission_id = ?").bind("due").first())
      .toEqual({ owner_notification_state: "sent" });
  });

  it("fits a maximum-load invocation inside the Workers Free D1 and subrequest limits without starving any task", async () => {
    const DAY_MS = 86_400_000;
    const now = Date.now();
    const iso = (offsetDays: number) => new Date(now - offsetDays * DAY_MS).toISOString();
    const due = iso(30);
    const contacts = Array.from({ length: 9 }, (_, index) => db.prepare(`INSERT INTO contact_submissions (submission_id, name, email,
      company, position, message, submitted_at, last_interaction_at, next_retry_at) VALUES (?, 'Due', 'due@example.com', 'Acme', 'Dev',
      'Pending message for retry testing.', ?, ?, ?)`).bind(`due-${index}`, iso(0), iso(0), due));
    // 90 days of retained terminal history for every category, plus rows already past retention.
    const history = [];
    for (let day = 1; day <= 95; day += 1) {
      for (const category of ["provider_error", "invalid_output", "timeout", "quota_exhaustion"]) {
        if (day === 3 && category === "timeout") continue; // reserved for the stale incident below
        const incidentDay = iso(day).slice(0, 10);
        const key = `ai_failure_alert:${category}:${incidentDay}`;
        const record = { category, day: incidentDay, firstAt: `${incidentDay}T10:00:00.000Z`, status: "sent", attempts: 1, claimId: null,
          leaseUntil: null, firstAttemptAt: `${incidentDay}T10:00:00.000Z`, possiblyAccepted: false,
          payload: { from: "f", to: ["t"], subject: "s", text: "t", idempotencyKey: "k" }, providerId: "0f5d5c1e-1111-4222-8333-444455556666" };
        const insert = "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)";
        history.push(db.prepare(insert).bind(key, JSON.stringify(record), iso(day)),
          db.prepare(insert).bind(`ai_failure_count:${category}:${incidentDay}`, "4", iso(day)),
          db.prepare(insert).bind(`ai_failure_alert_slot:${category}:${incidentDay}`, key, iso(day)));
      }
    }
    await db.batch([...contacts, ...history]);
    for (const category of ["provider_error", "invalid_output", "timeout", "quota_exhaustion"] as const) await recordAiFailure(db, category);
    await recordAiFailure(db, "timeout", new Date(now - 3 * DAY_MS)); // stale, must expire unsent
    await db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, '{\"status\":\"armed\"}', ?)").bind(VERIFICATION_KEY, iso(0)).run();

    vi.mocked(fetch).mockImplementation(async () => Response.json({ id: "0f5d5c1e-1111-4222-8333-444455556666" }));
    let d1Calls = 0;
    const counted = (statement: ReturnType<D1Database["prepare"]>): ReturnType<D1Database["prepare"]> => {
      const tick = () => { d1Calls += 1; if (d1Calls > 50) throw new Error("D1 query limit exceeded"); };
      return { ...statement, bind: (...values: unknown[]) => counted(statement.bind(...values)),
        run: async () => { tick(); return statement.run(); }, first: async () => { tick(); return statement.first(); },
        all: async () => { tick(); return statement.all(); } } as unknown as ReturnType<D1Database["prepare"]>;
    };
    const budgeted = { prepare: (sql: string) => counted(db.prepare(sql)),
      batch: async (statements: D1PreparedStatement[]) => { d1Calls += 1; return db.batch(statements); } } as unknown as D1Database;

    await expect(runScheduledTasks({ PORTFOLIO_DB: budgeted, RESEND_API_KEY: "key", CONTACT_FROM_EMAIL: "from@example.com",
      CONTACT_TO_EMAIL: "to@example.com", OWNER_EMAIL: "owner@example.com", ALLOWED_ORIGIN: "https://preview.example.com" })).resolves.toBeUndefined();

    expect(d1Calls).toBeLessThanOrEqual(50);
    expect(vi.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(25);
    expect(await db.prepare("SELECT count(*) AS total FROM contact_submissions WHERE owner_notification_state = 'sent'").first())
      .toEqual({ total: 10 });
    expect(await count("booking_history")).toBe(0);
    const statuses = (await db.prepare("SELECT key, json_extract(value, '$.status') AS status FROM app_settings WHERE updated_at >= ? AND json_valid(value) AND substr(value, 1, 1) = '{'")
      .bind(iso(0)).all<{ key: string; status: string }>()).results;
    expect(statuses.filter((row) => row.status === "sent" || row.key === VERIFICATION_KEY).length).toBeGreaterThanOrEqual(MAINTENANCE_RECORD_LIMIT - 1);
    expect(await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(VERIFICATION_KEY).first()).toEqual({ value: expect.stringContaining('"sent"') });
    expect(await db.prepare("SELECT count(*) AS total FROM app_settings WHERE updated_at < ?").bind(iso(90)).first()).toEqual({ total: 0 });
    expect(await db.prepare("SELECT json_extract(value, '$.status') AS status FROM app_settings WHERE key = ?")
      .bind(`ai_failure_alert:timeout:${iso(3).slice(0, 10)}`).first()).toEqual({ status: "expired" });
  });

  it("resolves when both tasks succeed", async () => {
    await expect(runScheduledTasks({ PORTFOLIO_DB: db })).resolves.toBeUndefined();
  });
});

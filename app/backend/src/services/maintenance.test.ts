import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "../test/sqlite-d1";
import { runMaintenance } from "./maintenance";

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

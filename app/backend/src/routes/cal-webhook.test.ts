import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hmacHex } from "../services/http";
import { createTestD1 } from "../test/sqlite-d1";
import type { Env } from "../types";
import { calWebhookRoute } from "./cal-webhook";

const secret = "cal-secret";
let db: D1Database;
let close: () => void;

function payload(triggerEvent: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    triggerEvent,
    createdAt,
    payload: {
      uid: "booking-1",
      eventTypeId: 42,
      startTime: "2026-10-01T15:00:00Z",
      endTime: "2026-10-01T15:30:00Z",
      iCalSequence: 0,
      attendees: [{ name: "Recruiter", email: "Recruiter@Example.com" }],
      videoCallData: { url: "https://video.example/secret" },
      ...extra,
    },
  };
}

async function deliver(body: unknown, env: Env = { PORTFOLIO_DB: db, CAL_WEBHOOK_SECRET: secret, CAL_EVENT_TYPE_ID: "42" }, signature?: string) {
  const text = JSON.stringify(body);
  return calWebhookRoute(new Request("https://api.brandenfarmer.com/api/webhooks/cal", {
    method: "POST",
    headers: { "x-cal-signature-256": signature ?? await hmacHex(secret, text) },
    body: text,
  }), env);
}

async function bookings() {
  return (await db.prepare("SELECT booking_uid, previous_booking_uid, email, start_at, status FROM booking_history ORDER BY booking_uid")
    .bind().all()).results;
}

beforeEach(() => ({ db, close } = createTestD1()));
afterEach(() => close());

describe("calWebhookRoute", () => {
  it("stores a minimal booking once and ignores duplicate deliveries", async () => {
    const created = payload("BOOKING_CREATED", "2026-09-29T10:00:00Z");
    expect((await deliver(created)).status).toBe(200);
    expect((await deliver(created)).status).toBe(200);
    expect(await bookings()).toEqual([{ booking_uid: "booking-1", previous_booking_uid: null, email: "recruiter@example.com",
      start_at: "2026-10-01T15:00:00.000Z", status: "booked" }]);
    const events = await db.prepare("SELECT count(*) AS total FROM booking_events").first<{ total: number }>();
    expect(events?.total).toBe(1);
    const columns = JSON.stringify(await db.prepare("SELECT * FROM booking_history").bind().all());
    expect(columns).not.toContain("video.example");
  });

  it("links reschedules and resists out-of-order cancellation and creation", async () => {
    await deliver(payload("BOOKING_CREATED", "2026-09-29T10:00:00Z"));
    await deliver(payload("BOOKING_RESCHEDULED", "2026-09-29T11:00:00Z", {
      uid: "booking-2", rescheduleUid: "booking-1", startTime: "2026-10-02T15:00:00Z", endTime: "2026-10-02T15:30:00Z",
      rescheduleStartTime: "2026-10-01T15:00:00Z", rescheduleEndTime: "2026-10-01T15:30:00Z", iCalSequence: 1,
    }));
    await deliver(payload("BOOKING_CANCELLED", "2026-09-29T12:00:00Z", { uid: "booking-3" }));
    await deliver(payload("BOOKING_CREATED", "2026-09-29T09:00:00Z", { uid: "booking-3" }));

    expect(await bookings()).toEqual([
      expect.objectContaining({ booking_uid: "booking-1", status: "rescheduled" }),
      expect.objectContaining({ booking_uid: "booking-2", previous_booking_uid: "booking-1", status: "booked" }),
      expect.objectContaining({ booking_uid: "booking-3", status: "cancelled" }),
    ]);
  });

  it("rejects bad signatures and incomplete payloads and ignores unrelated events", async () => {
    expect((await deliver(payload("BOOKING_CREATED", "2026-09-29T10:00:00Z"), undefined, "bad")).status).toBe(401);
    expect((await deliver({ triggerEvent: "BOOKING_CREATED", createdAt: "2026-09-29T10:00:00Z", payload: { eventTypeId: 42 } })).status).toBe(400);
    expect((await deliver(payload("MEETING_ENDED", "2026-09-29T10:00:00Z"))).status).toBe(202);
    expect((await deliver(payload("BOOKING_CREATED", "2026-09-29T10:00:00Z", { eventTypeId: 7 }))).status).toBe(202);
    expect((await deliver(payload("BOOKING_CREATED", "2026-09-29T10:00:00Z"), { PORTFOLIO_DB: db })).status).toBe(503);
    expect(await bookings()).toEqual([]);

    const text = "{not json";
    const invalid = await calWebhookRoute(new Request("https://api.brandenfarmer.com/api/webhooks/cal", {
      method: "POST", headers: { "x-cal-signature-256": await hmacHex(secret, text) }, body: text,
    }), { PORTFOLIO_DB: db, CAL_WEBHOOK_SECRET: secret });
    expect(invalid.status).toBe(400);
  });

  it("returns a retryable error when storage fails", async () => {
    const broken = Object.assign(Object.create(db), { batch: () => Promise.reject(new Error("down")) }) as D1Database;
    expect((await deliver(payload("BOOKING_CREATED", "2026-09-29T10:00:00Z"), { PORTFOLIO_DB: broken, CAL_WEBHOOK_SECRET: secret })).status).toBe(503);
  });
});

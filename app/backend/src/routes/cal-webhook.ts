import { errorResponse, hmacHex, readBody, timingSafeEqual } from "../services/http";
import type { Env } from "../types";

const WEBHOOK_BODY_LIMIT = 65_536;
const EVENTS = {
  BOOKING_CREATED: "created",
  BOOKING_RESCHEDULED: "rescheduled",
  BOOKING_CANCELLED: "cancelled",
} as const;

interface CalPayload {
  uid?: unknown;
  rescheduleUid?: unknown;
  eventTypeId?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  rescheduleStartTime?: unknown;
  rescheduleEndTime?: unknown;
  iCalSequence?: unknown;
  attendees?: Array<{ name?: unknown; email?: unknown }>;
}

function text(value: unknown, max = 254): string | null {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
}

function isoTime(value: unknown): string | null {
  const raw = text(value, 64);
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const UPSERT = `INSERT INTO booking_history
  (booking_uid, previous_booking_uid, event_type_id, name, email, start_at, end_at, status, source,
   provider_sequence, provider_updated_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cal', ?, ?, ?, ?)
  ON CONFLICT (booking_uid) DO UPDATE SET
    previous_booking_uid = COALESCE(excluded.previous_booking_uid, booking_history.previous_booking_uid),
    name = excluded.name, email = excluded.email, start_at = excluded.start_at, end_at = excluded.end_at,
    status = excluded.status, provider_sequence = excluded.provider_sequence,
    provider_updated_at = excluded.provider_updated_at, updated_at = excluded.updated_at
  WHERE booking_history.provider_updated_at IS NULL
    OR excluded.provider_updated_at > booking_history.provider_updated_at
    OR (excluded.provider_updated_at = booking_history.provider_updated_at
      AND excluded.provider_sequence >= booking_history.provider_sequence)`;

export async function calWebhookRoute(request: Request, env: Env): Promise<Response> {
  const db = env.PORTFOLIO_DB;
  if (!db || !env.CAL_WEBHOOK_SECRET) return errorResponse(503, "service_unavailable", "Booking history is not configured.");

  const body = await readBody(request, WEBHOOK_BODY_LIMIT, false);
  if (!body.ok) return body.response;
  const signature = request.headers.get("x-cal-signature-256")?.trim().toLowerCase() ?? "";
  if (!timingSafeEqual(signature, await hmacHex(env.CAL_WEBHOOK_SECRET, body.text))) {
    return errorResponse(401, "invalid_signature", "The webhook signature is invalid.");
  }

  let event: { triggerEvent?: unknown; createdAt?: unknown; payload?: CalPayload };
  try {
    event = JSON.parse(body.text);
  } catch {
    return errorResponse(400, "invalid_json", "The webhook payload is invalid.");
  }

  const type = EVENTS[event.triggerEvent as keyof typeof EVENTS];
  const payload = event.payload ?? {};
  if (!type || (env.CAL_EVENT_TYPE_ID && String(payload.eventTypeId) !== env.CAL_EVENT_TYPE_ID)) {
    return Response.json({ ok: true, ignored: true }, { status: 202 });
  }

  const uid = text(payload.uid, 128);
  const occurredAt = isoTime(event.createdAt);
  const startAt = isoTime(payload.startTime);
  const endAt = isoTime(payload.endTime);
  const attendee = payload.attendees?.[0];
  const name = text(attendee?.name, 100) ?? "Cal.com attendee";
  const email = text(attendee?.email)?.toLowerCase() ?? "";
  if (!uid || !occurredAt || !startAt || !endAt) return errorResponse(400, "invalid_payload", "The booking payload is incomplete.");

  const sequence = Number.isInteger(payload.iCalSequence) ? payload.iCalSequence as number : 0;
  const eventTypeId = Number.isInteger(payload.eventTypeId) ? payload.eventTypeId as number : null;
  const now = new Date().toISOString();
  const previousUid = type === "rescheduled" ? text(payload.rescheduleUid, 128) : null;
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO booking_events (provider_event_key, booking_uid, event_type, occurred_at, received_at)
      VALUES (?, ?, ?, ?, ?)`).bind(`${event.triggerEvent}:${uid}:${occurredAt}`, uid, type, occurredAt, now),
    db.prepare(UPSERT).bind(uid, previousUid, eventTypeId, name, email, startAt, endAt,
      type === "cancelled" ? "cancelled" : "booked", sequence, occurredAt, now, now),
  ];

  const previousStart = isoTime(payload.rescheduleStartTime);
  const previousEnd = isoTime(payload.rescheduleEndTime);
  if (previousUid && previousUid !== uid) {
    statements.push(db.prepare(UPSERT).bind(previousUid, null, eventTypeId, name, email, previousStart ?? startAt,
      previousEnd ?? endAt, "rescheduled", sequence, occurredAt, now, now));
  }

  try {
    await db.batch(statements);
  } catch {
    return errorResponse(503, "storage_unavailable", "The booking event could not be stored.");
  }
  return Response.json({ ok: true });
}

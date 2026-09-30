import type { ContactRequest, ContactStatus, ManualBookingRequest, OwnerBooking, OwnerContact } from "@portfolio/shared";
import { verifyOwner } from "../services/access";
import { claimContact, finishContact } from "../services/contact-store";
import { errorResponse, readJson } from "../services/http";
import { deliverContact } from "../services/resend";
import type { Env } from "../types";

const OWNER_BODY_LIMIT = 4_096;
const CONTACT_COLUMNS = `submission_id AS submissionId, name, email, company, position, message, status,
  owner_notification_state AS ownerNotification, confirmation_state AS confirmation, submitted_at AS submittedAt`;
const BOOKING_COLUMNS = `booking_uid AS bookingUid, previous_booking_uid AS previousBookingUid, name, email,
  start_at AS startAt, end_at AS endAt, status, source, updated_at AS updatedAt`;

function searchPattern(url: URL): string {
  return `%${(url.searchParams.get("q") ?? "").slice(0, 100).replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

async function listContacts(db: D1Database, url: URL): Promise<OwnerContact[]> {
  const pattern = searchPattern(url);
  return (await db.prepare(`SELECT ${CONTACT_COLUMNS} FROM contact_submissions
    WHERE name LIKE ?1 ESCAPE '\\' OR email LIKE ?1 ESCAPE '\\' OR company LIKE ?1 ESCAPE '\\' OR position LIKE ?1 ESCAPE '\\'
    ORDER BY submitted_at DESC LIMIT 200`).bind(pattern).all<OwnerContact>()).results;
}

async function listBookings(db: D1Database, url: URL): Promise<OwnerBooking[]> {
  const pattern = searchPattern(url);
  return (await db.prepare(`SELECT ${BOOKING_COLUMNS} FROM booking_history
    WHERE name LIKE ?1 ESCAPE '\\' OR email LIKE ?1 ESCAPE '\\' ORDER BY start_at DESC LIMIT 200`)
    .bind(pattern).all<OwnerBooking>()).results;
}

async function exportContacts(db: D1Database): Promise<OwnerContact[]> {
  return (await db.prepare(`SELECT ${CONTACT_COLUMNS} FROM contact_submissions
    ORDER BY submitted_at DESC, submission_id DESC`).all<OwnerContact>()).results;
}

async function exportBookings(db: D1Database): Promise<OwnerBooking[]> {
  return (await db.prepare(`SELECT ${BOOKING_COLUMNS} FROM booking_history
    ORDER BY start_at DESC, booking_uid DESC`).all<OwnerBooking>()).results;
}

function validManualBooking(value: unknown): ManualBookingRequest | null {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const start = typeof input.startAt === "string" ? Date.parse(input.startAt) : Number.NaN;
  const end = typeof input.endAt === "string" ? Date.parse(input.endAt) : Number.NaN;
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return { name, email, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}

async function retryContact(db: D1Database, env: Env, id: string): Promise<Response> {
  const row = await db.prepare(`SELECT ${CONTACT_COLUMNS} FROM contact_submissions WHERE submission_id = ?`).bind(id).first<OwnerContact>();
  if (!row) return errorResponse(404, "not_found", "The message does not exist.");
  if (row.ownerNotification === "sent" && row.confirmation === "sent") return Response.json({ ok: true, message: "Already delivered." });
  await db.prepare("UPDATE contact_submissions SET next_retry_at = NULL WHERE submission_id = ?").bind(id).run();
  if (!await claimContact(db, id)) return errorResponse(409, "retry_in_progress", "A delivery attempt is already in progress.");
  const contact: ContactRequest = { ...row, turnstileToken: "" };
  const delivery = await deliverContact(contact, env, row.ownerNotification === "sent");
  await finishContact(db, id, delivery.success, delivery.success && delivery.confirmationSent);
  return Response.json({ ok: delivery.success, message: delivery.success ? "Delivery retried." : "Delivery failed and will be retried." });
}

export async function ownerRoute(request: Request, env: Env, pathname: string): Promise<Response> {
  const db = env.PORTFOLIO_DB;
  if (!db) return errorResponse(503, "service_unavailable", "Owner tools are unavailable.");
  if (!await verifyOwner(request, env)) return errorResponse(403, "forbidden", "Owner access is required.");
  if (request.method !== "GET" && request.headers.get("Origin") !== env.ALLOWED_ORIGIN) {
    return errorResponse(403, "origin_forbidden", "This origin is not allowed.");
  }

  const url = new URL(request.url);
  const [resource, id, action] = pathname.replace(/^\/api\/owner\/?/, "").split("/").map(decodeURIComponent);
  const route = `${request.method} ${resource}${id ? "/:id" : ""}${action ? `/${action}` : ""}`;

  switch (route) {
    case "GET contacts":
      return Response.json({ contacts: await listContacts(db, url) });
    case "PATCH contacts/:id": {
      const body = await readJson(request, OWNER_BODY_LIMIT);
      if (!body.ok) return body.response;
      const status = (body.value as { status?: unknown }).status;
      if (!["new", "replied", "archived"].includes(status as string)) return errorResponse(400, "validation_error", "Choose a valid status.");
      const result = await db.prepare(`UPDATE contact_submissions SET status = ?, last_interaction_at = ? WHERE submission_id = ?`)
        .bind(status as ContactStatus, new Date().toISOString(), id).run();
      return result.meta.changes ? Response.json({ ok: true }) : errorResponse(404, "not_found", "The message does not exist.");
    }
    case "DELETE contacts/:id":
      await db.prepare("DELETE FROM contact_submissions WHERE submission_id = ?").bind(id).run();
      return Response.json({ ok: true });
    case "POST contacts/:id/retry":
      return retryContact(db, env, id);
    case "GET bookings":
      return Response.json({ bookings: await listBookings(db, url) });
    case "POST bookings": {
      const body = await readJson(request, OWNER_BODY_LIMIT);
      if (!body.ok) return body.response;
      const booking = validManualBooking(body.value);
      if (!booking) return errorResponse(400, "validation_error", "Enter a name, email, and a valid start and end time.");
      const now = new Date().toISOString();
      const uid = `manual-${crypto.randomUUID()}`;
      await db.prepare(`INSERT INTO booking_history (booking_uid, name, email, start_at, end_at, status, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'booked', 'manual', ?, ?)`).bind(uid, booking.name, booking.email, booking.startAt, booking.endAt, now, now).run();
      return Response.json({ ok: true, bookingUid: uid }, { status: 201 });
    }
    case "DELETE bookings/:id":
      await db.batch([
        db.prepare("DELETE FROM booking_events WHERE booking_uid = ?").bind(id),
        db.prepare("DELETE FROM booking_history WHERE booking_uid = ?").bind(id),
      ]);
      return Response.json({ ok: true });
    case "GET export":
      return Response.json({ exportedAt: new Date().toISOString(), contacts: await exportContacts(db), bookings: await exportBookings(db) },
        { headers: { "Content-Disposition": "attachment; filename=\"portfolio-history.json\"" } });
    case "GET settings": {
      const setting = await db.prepare("SELECT value FROM app_settings WHERE key = 'ai_enabled'").first<{ value: string }>();
      return Response.json({ aiEnabled: setting?.value !== "false", deploymentAiEnabled: env.AI_ENABLED === "true" });
    }
    case "PUT settings": {
      const body = await readJson(request, OWNER_BODY_LIMIT);
      if (!body.ok) return body.response;
      const aiEnabled = (body.value as { aiEnabled?: unknown }).aiEnabled;
      if (typeof aiEnabled !== "boolean") return errorResponse(400, "validation_error", "aiEnabled must be true or false.");
      await db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('ai_enabled', ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(String(aiEnabled), new Date().toISOString()).run();
      return Response.json({ ok: true, aiEnabled });
    }
    default:
      return errorResponse(404, "not_found", "The requested owner route does not exist.");
  }
}

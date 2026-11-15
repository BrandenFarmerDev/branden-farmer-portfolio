import type { Env } from "../types";

/**
 * Owner alerts for Ask Branden generation failures that visitors only see as an evidence-only fallback.
 *
 * State lives in `app_settings` (no schema change):
 *   ai_failure_alert:<category>:<incident day>       one fixed-shape incident record (JSON) per category and UTC day
 *   ai_failure_count:<category>:<incident day>       aggregate occurrence count, incremented atomically
 *   ai_failure_alert_slot:<category>:<dispatch day>  which incident may email that category on a UTC day
 *   ai_failure_alert_verification                    environment-wide one-shot delivery verification marker
 * Records hold fixed operational text only: no prompts, answers, visitor data or raw errors. Every persisted value is
 * validated against its key before it can influence an outbound request.
 *
 * Resend accepting a request is not inbox delivery; the provider email id is recorded as acceptance evidence.
 */

export type AiFailureCategory = "provider_error" | "invalid_output" | "timeout" | "quota_exhaustion";
type IncidentStatus = "pending" | "claimed" | "sent" | "failed" | "unknown" | "expired";
type SendOutcome =
  | { kind: "accepted"; providerId: string }
  | { kind: "not_accepted" } // definitely not processed (429): safe to retry
  | { kind: "uncertain" } // the provider may have accepted it
  | { kind: "rejected" }; // permanent rejection or payload conflict
export type DispatchResult = "accepted" | "retry_later" | "terminal" | "not_eligible" | "deferred" | "unavailable";

interface EmailPayload {
  from: string;
  to: [string];
  subject: string;
  text: string;
  idempotencyKey: string;
}

interface IncidentRecord {
  category: AiFailureCategory;
  day: string;
  firstAt: string;
  status: IncidentStatus;
  attempts: number;
  claimId: string | null;
  leaseUntil: string | null;
  firstAttemptAt: string | null;
  /** Sticky: once a submission may have been accepted, only a positive acknowledgement resolves it. */
  possiblyAccepted: boolean;
  payload: EmailPayload | null;
  providerId: string | null;
}

type VerificationMarker =
  | { status: "armed" }
  | { status: "consumed"; consumedAt: string; claimId: string }
  | { status: "sent"; consumedAt: string; providerId: string }
  | { status: "failed" | "unknown" | "not_sent"; consumedAt: string };

class AlertStateError extends Error {}

const RECORD_PREFIX = "ai_failure_alert:";
const COUNT_PREFIX = "ai_failure_count:";
const SLOT_PREFIX = "ai_failure_alert_slot:";
export const VERIFICATION_KEY = "ai_failure_alert_verification";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const CATEGORIES: readonly AiFailureCategory[] = ["provider_error", "invalid_output", "timeout", "quota_exhaustion"];
const STATUSES: readonly IncidentStatus[] = ["pending", "claimed", "sent", "failed", "unknown", "expired"];
const INCIDENT_FIELDS = ["category", "day", "firstAt", "status", "attempts", "claimId", "leaseUntil", "firstAttemptAt",
  "possiblyAccepted", "payload", "providerId"];
const PAYLOAD_FIELDS = ["from", "to", "subject", "text", "idempotencyKey"];
const MAX_ATTEMPTS = 3; // two immediate attempts plus one daily-maintenance retry
const SEND_TIMEOUT_MS = 12_000;
const MIN_SEND_MS = 1_000;
const BACKGROUND_BUDGET_MS = 30_000; // Workers waitUntil allowance after the response
const ACK_RESERVE_MS = 4_000; // time kept back to record the outcome in D1
const LEASE_MS = 60_000;
const IDEMPOTENCY_WINDOW_MS = 23 * 3_600_000; // Resend keeps keys 24 hours; one hour of margin
const UNATTEMPTED_EXPIRY_MS = 48 * 3_600_000;
const RETENTION_DAYS = 90; // matches the existing AI usage summary retention
// Daily maintenance D1 budget: 2 fixed calls plus at most 4 per record (claim, slot, re-slot after midnight, outcome)
// = 22 calls, inside the 28 left after contact maintenance (22) under the Workers Free limit of 50.
export const MAINTENANCE_RECORD_LIMIT = 5;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_TEXT: Record<AiFailureCategory, string> = {
  provider_error: "Workers AI returned an error",
  invalid_output: "the model output could not be used (invalid format or citations)",
  timeout: "the model did not answer within 20 seconds",
  quota_exhaustion: "the Workers AI daily allocation is used up",
};

const isoNow = () => new Date().toISOString();
const utcDay = (iso: string) => iso.slice(0, 10);
const recordKey = (category: AiFailureCategory, day: string) => `${RECORD_PREFIX}${category}:${day}`;
const countKey = (category: AiFailureCategory, day: string) => `${COUNT_PREFIX}${category}:${day}`;
const slotKey = (category: AiFailureCategory, day: string) => `${SLOT_PREFIX}${category}:${day}`;

function environmentLabel(env: Env): string {
  try {
    return new URL(env.ALLOWED_ORIGIN ?? "").host || "unknown-environment";
  } catch {
    return "unknown-environment";
  }
}

// ---------- strict persisted-state validation ----------

function parseObject(value: string | undefined): Record<string, unknown> | null {
  if (value === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const hasExactKeys = (object: Record<string, unknown>, keys: string[]) =>
  Object.keys(object).length === keys.length && keys.every((key) => Object.hasOwn(object, key));

const isIsoTime = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

function isPayload(value: unknown): value is EmailPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return hasExactKeys(payload, PAYLOAD_FIELDS) && ["from", "subject", "text", "idempotencyKey"].every((key) => typeof payload[key] === "string")
    && Array.isArray(payload.to) && payload.to.length === 1 && typeof payload.to[0] === "string";
}

/** Returns the record only if every field is well-formed and consistent with the key it is stored under. */
function parseIncident(key: string, value: string | undefined): IncidentRecord | null {
  const record = parseObject(value);
  if (!record || !hasExactKeys(record, INCIDENT_FIELDS)) return null;
  const { category, day, firstAt, status, attempts, claimId, leaseUntil, firstAttemptAt, possiblyAccepted, payload, providerId } = record;
  if (!CATEGORIES.includes(category as AiFailureCategory) || typeof day !== "string" || !DAY_PATTERN.test(day)) return null;
  if (key !== recordKey(category as AiFailureCategory, day) || !isIsoTime(firstAt) || utcDay(firstAt) !== day) return null;
  if (!STATUSES.includes(status as IncidentStatus) || !Number.isInteger(attempts) || typeof possiblyAccepted !== "boolean") return null;
  const count = attempts as number;
  if (count < 0 || count > MAX_ATTEMPTS) return null;
  const claimed = status === "claimed";
  if (claimed ? typeof claimId !== "string" || !isIsoTime(leaseUntil) : claimId !== null || leaseUntil !== null) return null;
  if (count === 0 ? firstAttemptAt !== null || payload !== null || possiblyAccepted || claimed : !isIsoTime(firstAttemptAt) || !isPayload(payload)) return null;
  if (status === "sent" ? typeof providerId !== "string" || !PROVIDER_ID_PATTERN.test(providerId) : providerId !== null) return null;
  if ((status === "pending" && count >= MAX_ATTEMPTS) || (status === "expired" && count !== 0)) return null;
  return record as unknown as IncidentRecord;
}

function parseMarker(value: string | undefined): VerificationMarker | null {
  const marker = parseObject(value);
  if (!marker) return null;
  switch (marker.status) {
    case "armed": return hasExactKeys(marker, ["status"]) ? marker as VerificationMarker : null;
    case "consumed": return hasExactKeys(marker, ["status", "consumedAt", "claimId"]) && isIsoTime(marker.consumedAt)
      && typeof marker.claimId === "string" ? marker as VerificationMarker : null;
    case "sent": return hasExactKeys(marker, ["status", "consumedAt", "providerId"]) && isIsoTime(marker.consumedAt)
      && typeof marker.providerId === "string" && PROVIDER_ID_PATTERN.test(marker.providerId) ? marker as VerificationMarker : null;
    case "failed": case "unknown": case "not_sent":
      return hasExactKeys(marker, ["status", "consumedAt"]) && isIsoTime(marker.consumedAt) ? marker as VerificationMarker : null;
    default: return null;
  }
}

// ---------- payloads and routing ----------

function emailText(lead: string, environment: string, category: string, day: string, firstAt: string): string {
  return [
    lead,
    "",
    `Environment: ${environment}`,
    `Category: ${category}`,
    `Incident day (UTC): ${day}`,
    `First occurrence (UTC): ${firstAt}`,
    "",
    "Visitors received the evidence-only fallback with links to the portfolio evidence.",
    "At most one alert is sent per category per day; later occurrences are only counted.",
    "",
    "Next steps:",
    "1. Check Cloudflare Workers AI status and the model catalog for the configured model.",
    "2. Pause generated answers from the owner page if failures continue.",
    "3. Follow docs/ask-model-migration.md for recovery.",
  ].join("\n");
}

/** The only payload an incident may send under the current configuration; null when delivery is not configured. */
function incidentPayload(env: Env, record: IncidentRecord): EmailPayload | null {
  // Ordinary incidents always use the environment recipient (the Resend sandbox in preview), never the owner address.
  if (!env.CONTACT_FROM_EMAIL || !env.CONTACT_TO_EMAIL) return null;
  const environment = environmentLabel(env);
  return {
    from: env.CONTACT_FROM_EMAIL,
    to: [env.CONTACT_TO_EMAIL],
    subject: `Ask Branden AI failure: ${record.category} (${environment})`,
    text: emailText("Ask Branden could not generate an answer.", environment,
      `${record.category} (${CATEGORY_TEXT[record.category]})`, record.day, record.firstAt),
    idempotencyKey: `ai-failure-alert/${environment}/${record.category}/${record.day}`,
  };
}

function verificationPayload(env: Env, consumedAt: string): EmailPayload | null {
  if (!env.CONTACT_FROM_EMAIL || !env.OWNER_EMAIL) return null;
  const environment = environmentLabel(env);
  return {
    from: env.CONTACT_FROM_EMAIL,
    to: [env.OWNER_EMAIL],
    subject: `[Verification] Ask Branden AI failure alert test (${environment})`,
    text: emailText("Labelled one-time verification of the Ask Branden AI failure alert path. No visitor was affected.",
      environment, "verification (not a real incident)", utcDay(consumedAt), consumedAt),
    idempotencyKey: `ai-failure-alert/${environment}/verification`,
  };
}

const samePayload = (left: EmailPayload, right: EmailPayload) => PAYLOAD_FIELDS.every((field) =>
  JSON.stringify(left[field as keyof EmailPayload]) === JSON.stringify(right[field as keyof EmailPayload]));

// ---------- D1 primitives (each is one D1 call) ----------

async function readValue(db: D1Database, key: string): Promise<string | undefined> {
  return (await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>())?.value;
}

/** Replaces the stored value only if it is still exactly `expected`. */
async function compareAndSet(db: D1Database, key: string, expected: string, next: string): Promise<boolean> {
  const result = await db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ? AND value = ?")
    .bind(next, isoNow(), key, expected).run();
  return result.meta.changes === 1;
}

/**
 * Reserves (or confirms) the category's dispatch slot for `day` in one atomic D1 batch. `owned` is true only if this
 * incident owns it; `created` is true only if this call made the reservation, so a known no-send can undo exactly that.
 */
async function reserveDispatchSlot(db: D1Database, category: AiFailureCategory, day: string, key: string): Promise<{ slot: string; owned: boolean; created: boolean }> {
  const slot = slotKey(category, day);
  const [inserted, current] = await db.batch([
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING RETURNING value")
      .bind(slot, key, isoNow()),
    db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(slot),
  ]);
  return { slot, owned: (current.results[0] as { value?: string } | undefined)?.value === key, created: inserted.results.length === 1 };
}

// ---------- provider call ----------

async function sendAlert(apiKey: string, payload: EmailPayload, timeoutMs: number): Promise<SendOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": payload.idempotencyKey },
      body: JSON.stringify({ from: payload.from, to: payload.to, subject: payload.subject, text: payload.text }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
    if (response.ok) {
      return typeof body?.id === "string" && PROVIDER_ID_PATTERN.test(body.id) ? { kind: "accepted", providerId: body.id } : { kind: "uncertain" };
    }
    if (response.status === 409) return body?.name === "concurrent_idempotent_requests" ? { kind: "uncertain" } : { kind: "rejected" };
    if (response.status === 429) return { kind: "not_accepted" };
    return response.status >= 500 ? { kind: "uncertain" } : { kind: "rejected" };
  } catch {
    return { kind: "uncertain" }; // network failure or timeout: the provider may have accepted it
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- incident state transitions ----------

function claimable(record: IncidentRecord, nowMs: number): boolean {
  const open = record.status === "pending" || (record.status === "claimed" && Date.parse(record.leaseUntil!) <= nowMs);
  const fresh = record.firstAttemptAt === null
    ? nowMs < Date.parse(record.firstAt) + UNATTEMPTED_EXPIRY_MS
    : nowMs < Date.parse(record.firstAttemptAt) + IDEMPOTENCY_WINDOW_MS;
  return open && record.attempts < MAX_ATTEMPTS && fresh;
}

const terminal = (record: IncidentRecord): IncidentRecord =>
  ({ ...record, status: record.possiblyAccepted ? "unknown" : "failed", claimId: null, leaseUntil: null });

function afterAttempt(claimed: IncidentRecord, outcome: SendOutcome): IncidentRecord {
  const released = { ...claimed, claimId: null, leaseUntil: null, possiblyAccepted: claimed.possiblyAccepted || outcome.kind === "uncertain" };
  if (outcome.kind === "accepted") return { ...released, status: "sent", providerId: outcome.providerId };
  if (outcome.kind === "rejected" || released.attempts >= MAX_ATTEMPTS) return terminal(released);
  return { ...released, status: "pending" };
}

/**
 * Makes at most one delivery attempt for an incident whose stored JSON is `stored`, finishing before `deadlineMs`.
 * Throws AlertStateError for invalid or no-longer-authorized state so callers can surface it.
 */
export async function attemptAlertDelivery(env: Env, key: string, stored: string, deadlineMs: number): Promise<DispatchResult> {
  const db = env.PORTFOLIO_DB;
  if (!db) return "unavailable";
  const record = parseIncident(key, stored);
  if (!record) throw new AlertStateError("AI failure alert state is invalid.");
  if (!claimable(record, Date.now())) return "not_eligible";
  // An expired in-flight claim means an earlier submission may have been accepted; every outcome below keeps that.
  const inherited: IncidentRecord = { ...record, possiblyAccepted: record.possiblyAccepted || record.status === "claimed" };
  const authorized = incidentPayload(env, record);
  if (!authorized || !env.RESEND_API_KEY) return "unavailable";
  if (record.payload && !samePayload(record.payload, authorized)) {
    // Routing or content changed since the first attempt: never send the old envelope or rewrite it.
    await compareAndSet(db, key, stored, JSON.stringify(terminal(inherited)));
    throw new AlertStateError("AI failure alert payload is no longer authorized.");
  }

  const startedMs = Date.now();
  const claimed: IncidentRecord = {
    ...inherited,
    status: "claimed",
    claimId: crypto.randomUUID(),
    leaseUntil: new Date(startedMs + LEASE_MS).toISOString(),
    attempts: record.attempts + 1,
    firstAttemptAt: record.firstAttemptAt ?? new Date(startedMs).toISOString(),
    payload: record.payload ?? authorized,
  };
  const claimedValue = JSON.stringify(claimed);
  if (!await compareAndSet(db, key, stored, claimedValue)) return "not_eligible";
  const createdSlots: string[] = [];
  const release = async (result: DispatchResult) => {
    // Nothing was submitted: restore the record exactly and, in the same atomic batch, free only the slots this
    // attempt created, and only if the restore succeeded (a newer claimant may already be relying on them).
    await db.batch([
      db.prepare("UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ? AND value = ?").bind(stored, isoNow(), key, claimedValue),
      ...createdSlots.map((slot) => db.prepare(`DELETE FROM app_settings WHERE key = ? AND value = ?
        AND EXISTS (SELECT 1 FROM app_settings WHERE key = ? AND value = ?)`).bind(slot, key, key, stored)),
    ]);
    return result;
  };
  const holdSlot = async (day: string) => {
    const reservation = await reserveDispatchSlot(db, record.category, day, key);
    if (reservation.created) createdSlots.push(reservation.slot);
    return reservation.owned;
  };

  // The dispatch day and remaining time are sampled after the claim, immediately before submission.
  let day = utcDay(isoNow());
  if (!await holdSlot(day)) return release("deferred");
  if (utcDay(isoNow()) !== day) {
    day = utcDay(isoNow());
    if (!await holdSlot(day)) return release("deferred");
  }
  const timeoutMs = Math.min(SEND_TIMEOUT_MS, deadlineMs - Date.now() - ACK_RESERVE_MS);
  if (timeoutMs < MIN_SEND_MS || utcDay(isoNow()) !== day) return release("retry_later");

  const outcome = await sendAlert(env.RESEND_API_KEY, claimed.payload!, timeoutMs);
  const finished = afterAttempt(claimed, outcome);
  if (!await compareAndSet(db, key, claimedValue, JSON.stringify(finished))) return "not_eligible"; // a newer owner wins
  if (finished.status === "sent") return "accepted";
  return finished.status === "pending" ? "retry_later" : "terminal";
}

// ---------- verification (one shot per environment) ----------

async function attemptVerification(env: Env, stored: string, deadlineMs: number): Promise<DispatchResult> {
  const db = env.PORTFOLIO_DB!;
  const marker = parseMarker(stored);
  if (!marker) throw new AlertStateError("AI alert verification marker is invalid.");
  if (marker.status !== "armed") return "not_eligible";
  const consumedAt = isoNow();
  const payload = verificationPayload(env, consumedAt);
  if (!payload || !env.RESEND_API_KEY) return "unavailable"; // stays armed until delivery is configured

  // The permission is consumed before the single outbound attempt; it is never re-armed by code.
  const consumed = JSON.stringify({ status: "consumed", consumedAt, claimId: crypto.randomUUID() });
  const won = await db.prepare(`UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?
    AND json_valid(value) AND json_extract(value, '$.status') = 'armed'`).bind(consumed, consumedAt, VERIFICATION_KEY).run();
  if (won.meta.changes !== 1) return "not_eligible";
  const timeoutMs = Math.min(SEND_TIMEOUT_MS, deadlineMs - Date.now() - ACK_RESERVE_MS);
  const outcome: SendOutcome | null = timeoutMs < MIN_SEND_MS ? null : await sendAlert(env.RESEND_API_KEY, payload, timeoutMs);
  const finished = outcome === null ? { status: "not_sent", consumedAt }
    : outcome.kind === "accepted" ? { status: "sent", consumedAt, providerId: outcome.providerId }
    : { status: outcome.kind === "rejected" ? "failed" : "unknown", consumedAt };
  await compareAndSet(db, VERIFICATION_KEY, consumed, JSON.stringify(finished));
  return finished.status === "sent" ? "accepted" : "terminal";
}

// ---------- entry points ----------

/** Atomically records one generation failure. `created` is true only for the first failure of the category that day. */
export async function recordAiFailure(db: D1Database, category: AiFailureCategory, now = new Date()): Promise<{ key: string; created: boolean }> {
  const timestamp = now.toISOString();
  const day = utcDay(timestamp);
  const key = recordKey(category, day);
  const fresh: IncidentRecord = {
    category, day, firstAt: timestamp, status: "pending", attempts: 0, claimId: null, leaseUntil: null,
    firstAttemptAt: null, possiblyAccepted: false, payload: null, providerId: null,
  };
  const [inserted] = await db.batch([
    db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING RETURNING key")
      .bind(key, JSON.stringify(fresh), timestamp),
    db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, '1', ?) ON CONFLICT (key) DO UPDATE
      SET value = CAST(CAST(app_settings.value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at`)
      .bind(countKey(category, day), timestamp),
  ]);
  return { key, created: inserted.results.length === 1 };
}

/** Immediate background dispatch after the first failure of a category: up to two attempts within one waitUntil. */
export async function dispatchAiFailureAlert(env: Env, key: string, startedAt = Date.now()): Promise<DispatchResult> {
  const db = env.PORTFOLIO_DB;
  if (!db) return "unavailable";
  const deadlineMs = startedAt + BACKGROUND_BUDGET_MS;
  let result: DispatchResult = "not_eligible";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const stored = await readValue(db, key);
      if (stored === undefined) return "not_eligible";
      result = await attemptAlertDelivery(env, key, stored, deadlineMs);
    } catch {
      return "retry_later"; // durable state remains; daily maintenance surfaces invalid state
    }
    if (result !== "retry_later" || deadlineMs - Date.now() < SEND_TIMEOUT_MS + ACK_RESERVE_MS) break;
  }
  return result;
}

/**
 * Daily maintenance: set-based expiry and retention, then at most MAINTENANCE_RECORD_LIMIT due records (verification
 * first). Rejects when expiry fails (nothing stale is sent) or any due record is invalid, unauthorized or cannot be
 * delivered because configuration is missing.
 */
export async function runAiAlertMaintenance(env: Env): Promise<void> {
  const db = env.PORTFOLIO_DB;
  if (!db) return;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const unattemptedCutoff = new Date(nowMs - UNATTEMPTED_EXPIRY_MS).toISOString();
  const windowCutoff = new Date(nowMs - IDEMPOTENCY_WINDOW_MS).toISOString();
  const retentionCutoff = new Date(nowMs - RETENTION_DAYS * 86_400_000).toISOString();
  const isRecord = "substr(key, 1, ?) = ? AND json_valid(value)";

  await db.batch([
    db.prepare(`UPDATE app_settings SET value = json_set(value, '$.status', 'expired'), updated_at = ?
      WHERE ${isRecord} AND json_extract(value, '$.status') = 'pending' AND json_extract(value, '$.attempts') = 0
      AND json_extract(value, '$.firstAt') <= ?`).bind(now, RECORD_PREFIX.length, RECORD_PREFIX, unattemptedCutoff),
    // Attempted incidents past their idempotency window or attempt limit: an in-flight or possibly accepted
    // submission becomes unknown, never failed, and is never resent under a new key.
    db.prepare(`UPDATE app_settings SET value = json_set(value,
        '$.status', CASE WHEN json_extract(value, '$.possiblyAccepted') OR json_extract(value, '$.status') = 'claimed'
          THEN 'unknown' ELSE 'failed' END, '$.claimId', NULL, '$.leaseUntil', NULL), updated_at = ?
      WHERE ${isRecord} AND json_extract(value, '$.attempts') > 0
      AND (json_extract(value, '$.status') = 'pending'
        OR (json_extract(value, '$.status') = 'claimed' AND json_extract(value, '$.leaseUntil') <= ?))
      AND (json_extract(value, '$.firstAttemptAt') <= ? OR json_extract(value, '$.attempts') >= ?)`)
      .bind(now, RECORD_PREFIX.length, RECORD_PREFIX, now, windowCutoff, MAX_ATTEMPTS),
    db.prepare(`DELETE FROM app_settings WHERE ${isRecord} AND updated_at < ?
      AND json_extract(value, '$.status') IN ('sent', 'failed', 'unknown', 'expired')`)
      .bind(RECORD_PREFIX.length, RECORD_PREFIX, retentionCutoff),
    db.prepare("DELETE FROM app_settings WHERE (substr(key, 1, ?) = ? OR substr(key, 1, ?) = ?) AND updated_at < ?")
      .bind(SLOT_PREFIX.length, SLOT_PREFIX, COUNT_PREFIX.length, COUNT_PREFIX, retentionCutoff),
  ]);

  const due = await db.prepare(`SELECT key, value FROM app_settings
    WHERE (key = ? AND json_valid(value) AND json_extract(value, '$.status') = 'armed')
      OR (substr(key, 1, ?) = ? AND (NOT json_valid(value) OR json_extract(value, '$.status') = 'pending'
        OR (json_extract(value, '$.status') = 'claimed' AND json_extract(value, '$.leaseUntil') <= ?)))
    ORDER BY key = ? DESC, key LIMIT ?`)
    .bind(VERIFICATION_KEY, RECORD_PREFIX.length, RECORD_PREFIX, now, VERIFICATION_KEY, MAINTENANCE_RECORD_LIMIT)
    .all<{ key: string; value: string }>();

  let issues = 0;
  for (const { key, value } of due.results) {
    const deadlineMs = Date.now() + SEND_TIMEOUT_MS + ACK_RESERVE_MS;
    try {
      const result = key === VERIFICATION_KEY
        ? await attemptVerification(env, value, deadlineMs)
        : await attemptAlertDelivery(env, key, value, deadlineMs);
      if (result === "unavailable") issues += 1; // due work that cannot be delivered with the current configuration
    } catch {
      issues += 1;
    }
  }
  if (issues > 0) throw new Error(`AI alert maintenance left ${issues} due record(s) unresolved.`);
}

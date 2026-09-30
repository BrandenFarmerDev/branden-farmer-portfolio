import type { ContactRequest } from "@portfolio/shared";

interface StoredContact {
  submission_id: string;
  name: string;
  email: string;
  company: string;
  position: string;
  message: string;
  owner_notification_state: "pending" | "sent";
  confirmation_state: "pending" | "sent";
}

export async function saveContact(db: D1Database, contact: ContactRequest): Promise<StoredContact | null> {
  const timestamp = new Date().toISOString();
  await db.prepare(`INSERT INTO contact_submissions
    (submission_id, name, email, company, position, message, submitted_at, last_interaction_at, next_retry_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (submission_id) DO NOTHING`)
    .bind(contact.submissionId, contact.name, contact.email, contact.company, contact.position,
      contact.message, timestamp, timestamp, timestamp).run();

  const stored = await db.prepare(`SELECT submission_id, name, email, company, position, message,
    owner_notification_state, confirmation_state FROM contact_submissions WHERE submission_id = ?`)
    .bind(contact.submissionId).first<StoredContact>();
  if (!stored || ["name", "email", "company", "position", "message"].some(
    (field) => stored[field as keyof StoredContact] !== contact[field as keyof ContactRequest],
  )) return null;
  return stored;
}

export async function claimContact(db: D1Database, submissionId: string): Promise<boolean> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 2 * 60_000).toISOString();
  const result = await db.prepare(`UPDATE contact_submissions SET next_retry_at = ?,
    notification_attempts = notification_attempts + 1 WHERE submission_id = ?
    AND (owner_notification_state = 'pending' OR confirmation_state = 'pending')
    AND (next_retry_at IS NULL OR next_retry_at <= ?)`)
    .bind(leaseUntil, submissionId, now.toISOString()).run();
  return result.meta.changes === 1;
}

export async function finishContact(
  db: D1Database,
  submissionId: string,
  ownerSent: boolean,
  confirmationSent: boolean,
): Promise<void> {
  const now = new Date();
  const timestamp = now.toISOString();
  const retryAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  await db.prepare(`UPDATE contact_submissions SET
    owner_notification_state = CASE WHEN ? THEN 'sent' ELSE owner_notification_state END,
    confirmation_state = CASE WHEN ? THEN 'sent' ELSE confirmation_state END,
    owner_notified_at = CASE WHEN ? THEN COALESCE(owner_notified_at, ?) ELSE owner_notified_at END,
    confirmation_sent_at = CASE WHEN ? THEN COALESCE(confirmation_sent_at, ?) ELSE confirmation_sent_at END,
    next_retry_at = CASE WHEN (? OR owner_notification_state = 'sent')
      AND (? OR confirmation_state = 'sent') THEN NULL ELSE ? END
    WHERE submission_id = ?`)
    .bind(ownerSent, confirmationSent, ownerSent, timestamp, confirmationSent, timestamp,
      ownerSent, confirmationSent, retryAt, submissionId).run();
}

export async function retryContacts(db: D1Database, send: (contact: ContactRequest, ownerSent: boolean) => Promise<{
  success: boolean;
  confirmationSent?: boolean;
}>): Promise<void> {
  const pending = await db.prepare(`SELECT submission_id, name, email, company, position, message,
    owner_notification_state, confirmation_state FROM contact_submissions
    WHERE (owner_notification_state = 'pending' OR confirmation_state = 'pending')
      AND next_retry_at <= ? AND notification_attempts < 10
    ORDER BY next_retry_at LIMIT 10`).bind(new Date().toISOString()).all<StoredContact>();

  for (const stored of pending.results) {
    if (!await claimContact(db, stored.submission_id)) continue;
    const contact: ContactRequest = {
      submissionId: stored.submission_id,
      name: stored.name,
      email: stored.email,
      company: stored.company,
      position: stored.position,
      message: stored.message,
      turnstileToken: "",
    };
    const result = await send(contact, stored.owner_notification_state === "sent");
    await finishContact(db, stored.submission_id, result.success, result.confirmationSent ?? false);
  }
}

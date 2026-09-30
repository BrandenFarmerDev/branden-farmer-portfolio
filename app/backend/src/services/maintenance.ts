import { retryContacts } from "./contact-store";
import { deliverContact } from "./resend";
import type { Env } from "../types";

export async function runMaintenance(env: Env): Promise<void> {
  const db = env.PORTFOLIO_DB;
  if (!db) return;

  if (env.RESEND_API_KEY && env.CONTACT_FROM_EMAIL && env.CONTACT_TO_EMAIL) {
    await retryContacts(db, (contact, ownerSent) => deliverContact(contact, env, ownerSent));
  }

  const now = new Date();
  const personalCutoff = new Date(now);
  personalCutoff.setUTCMonth(personalCutoff.getUTCMonth() - 12);
  const usageCutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const summaryCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  await db.batch([
    db.prepare("DELETE FROM contact_submissions WHERE last_interaction_at < ?").bind(personalCutoff.toISOString()),
    db.prepare("DELETE FROM booking_history WHERE updated_at < ?").bind(personalCutoff.toISOString()),
    db.prepare("DELETE FROM booking_events WHERE booking_uid NOT IN (SELECT booking_uid FROM booking_history)"),
    db.prepare("DELETE FROM ai_daily_usage WHERE usage_day < ?").bind(usageCutoff),
    db.prepare("DELETE FROM ai_usage_summary WHERE usage_day < ?").bind(summaryCutoff),
  ]);
}
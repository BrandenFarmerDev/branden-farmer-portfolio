import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "../test/sqlite-d1";
import { claimContact, finishContact, retryContacts, saveContact } from "./contact-store";

const contact = {
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Portfolio Visitor",
  email: "visitor@example.com",
  company: "Example Company",
  position: "Application Developer",
  message: "I would like to discuss an application development opportunity.",
  turnstileToken: "valid-test-token",
};

let db: D1Database;
let close: () => void;

beforeEach(() => {
  ({ db, close } = createTestD1());
});

afterEach(() => {
  close();
});

describe("contact storage", () => {
  it("persists once, rejects a reused ID with different fields, and claims one sender", async () => {
    expect(await saveContact(db, contact)).toMatchObject({ email: contact.email, owner_notification_state: "pending" });
    expect(await saveContact(db, contact)).toMatchObject({ email: contact.email });
    expect(await saveContact(db, { ...contact, email: "other@example.com" })).toBeNull();
    expect(await claimContact(db, contact.submissionId)).toBe(true);
    expect(await claimContact(db, contact.submissionId)).toBe(false);
    const count = await db.prepare("SELECT count(*) AS total FROM contact_submissions").first<{ total: number }>();
    expect(count?.total).toBe(1);
  });

  it("retries only pending confirmation after owner delivery, then stops", async () => {
    await saveContact(db, contact);
    await claimContact(db, contact.submissionId);
    await finishContact(db, contact.submissionId, true, false);
    await db.prepare("UPDATE contact_submissions SET next_retry_at = ? WHERE submission_id = ?")
      .bind("2000-01-01T00:00:00Z", contact.submissionId).run();
    const send = vi.fn().mockResolvedValue({ success: true, confirmationSent: true });

    await retryContacts(db, send);
    await retryContacts(db, send);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ email: contact.email }), true);
    expect(await db.prepare(`SELECT owner_notification_state, confirmation_state, next_retry_at
      FROM contact_submissions WHERE submission_id = ?`).bind(contact.submissionId).first())
      .toMatchObject({ owner_notification_state: "sent", confirmation_state: "sent", next_retry_at: null });
  });

  it("retries a saved contact even when the initial claim never ran", async () => {
    await saveContact(db, contact);
    const send = vi.fn().mockResolvedValue({ success: true, confirmationSent: true });

    await retryContacts(db, send);

    expect(send).toHaveBeenCalledOnce();
    expect(await db.prepare(`SELECT owner_notification_state, confirmation_state, next_retry_at
      FROM contact_submissions WHERE submission_id = ?`).bind(contact.submissionId).first())
      .toMatchObject({ owner_notification_state: "sent", confirmation_state: "sent", next_retry_at: null });
  });
});

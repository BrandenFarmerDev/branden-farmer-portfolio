import type { ContactStatus, OwnerBooking, OwnerContact } from "@portfolio/shared";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { PageIntro } from "../components/PageIntro";
import { apiBaseUrl, ownerApi } from "../lib/api";

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const emptyBooking = { name: "", email: "", startAt: "", endAt: "" };

export function OwnerPage() {
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<OwnerContact[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [settings, setSettings] = useState<{ aiEnabled: boolean; deploymentAiEnabled: boolean } | null>(null);
  const [booking, setBooking] = useState(emptyBooking);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const latestLoad = useRef(0);

  const load = useCallback(async (search: string, requestedLoadId?: number) => {
    const loadId = requestedLoadId ?? ++latestLoad.current;
    try {
      const [contactResult, bookingResult, settingsResult] = await Promise.all([
        ownerApi.contacts(search), ownerApi.bookings(search), ownerApi.settings(),
      ]);
      if (loadId !== latestLoad.current) return;
      setContacts(contactResult.contacts);
      setBookings(bookingResult.bookings);
      setSettings(settingsResult);
      setSignInRequired(false);
      setLoadError("");
    } catch (error) {
      if (loadId !== latestLoad.current) return;
      // Cross-origin Access redirects surface as network errors rather than HTTP statuses.
      setSignInRequired(error instanceof TypeError || (error instanceof Error && "status" in error && error.status === 403));
      setLoadError(error instanceof Error ? error.message : "Owner tools are unavailable.");
    }
  }, []);

  useEffect(() => {
    const loadId = ++latestLoad.current;
    const timer = window.setTimeout(() => void load(query, loadId), 250);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      setStatus(done);
      await load(query);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The action failed.");
    }
  };

  const retryContact = async (submissionId: string) => {
    const result = await ownerApi.retryContact(submissionId);
    if (!result.ok) throw new Error(result.message);
  };

  const exportHistory = () => run(async () => {
    const data = await ownerApi.exportHistory();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "portfolio-history.json";
    link.click();
    URL.revokeObjectURL(url);
  }, "Export downloaded.");

  const addBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      await ownerApi.addBooking({ ...booking, startAt: new Date(booking.startAt).toISOString(), endAt: new Date(booking.endAt).toISOString() });
      setBooking(emptyBooking);
    }, "Booking added.");
  };

  return (
    <>
      <PageIntro eyebrow="Private" title="Owner tools" description="Contact and booking history, delivery retries, export, and the AI switch." />
      <section className="section content-width owner-layout">
        <p className="form-status" role="status">{status}</p>
        {loadError ? <p className="form-status is-error" role="alert">{loadError}</p> : null}
        {signInRequired ? (
          <p className="owner-signin">
            Your session may have expired. <a href={`${apiBaseUrl}/api/owner/settings`}>Sign in to the owner API</a>, then reload this page.
          </p>
        ) : null}

        <div className="owner-toolbar">
          <div className="form-field">
            <label htmlFor="owner-search">Search name, email, or company</label>
            <input id="owner-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button className="button button-secondary" type="button" onClick={() => void exportHistory()}>
            <Download aria-hidden="true" size={17} /> Export JSON
          </button>
          {settings ? (
            <label className="owner-toggle">
              <input
                type="checkbox"
                checked={settings.aiEnabled}
                onChange={(event) => void run(() => ownerApi.setAiEnabled(event.target.checked), "AI setting saved.")}
              />
              Generated answers {settings.deploymentAiEnabled ? "" : "(also disabled by deployment setting)"}
            </label>
          ) : null}
        </div>

        <h2>Messages ({contacts.length})</h2>
        <ul className="owner-list">
          {contacts.map((contact) => (
            <li key={contact.submissionId}>
              <div className="owner-row-heading">
                <strong>{contact.name}</strong>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
                <span>{contact.position} at {contact.company}</span>
                <span>{dateTime.format(new Date(contact.submittedAt))}</span>
              </div>
              <p>{contact.message}</p>
              <div className="owner-row-actions">
                <label>
                  Status{" "}
                  <select
                    value={contact.status}
                    onChange={(event) => void run(() => ownerApi.setContactStatus(contact.submissionId, event.target.value as ContactStatus), "Status saved.")}
                  >
                    <option value="new">New</option>
                    <option value="replied">Replied</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <span>Notification: {contact.ownerNotification}. Confirmation: {contact.confirmation}.</span>
                {contact.ownerNotification === "pending" || contact.confirmation === "pending" ? (
                  <button type="button" className="text-button" onClick={() => void run(() => retryContact(contact.submissionId), "Delivery retried.")}>
                    <RefreshCw aria-hidden="true" size={15} /> Retry email
                  </button>
                ) : null}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => window.confirm(`Delete the message from ${contact.name}?`)
                    && void run(() => ownerApi.deleteContact(contact.submissionId), "Message deleted.")}
                >
                  <Trash2 aria-hidden="true" size={15} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h2>Bookings ({bookings.length})</h2>
        <ul className="owner-list">
          {bookings.map((item) => (
            <li key={item.bookingUid}>
              <div className="owner-row-heading">
                <strong>{item.name}</strong>
                <a href={`mailto:${item.email}`}>{item.email}</a>
                <span>{dateTime.format(new Date(item.startAt))} – {dateTime.format(new Date(item.endAt))}</span>
                <span>{item.status}{item.source === "manual" ? " (manual entry)" : ""}{item.previousBookingUid ? " · rescheduled from an earlier booking" : ""}</span>
              </div>
              <div className="owner-row-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => window.confirm(`Delete the booking for ${item.name}?`)
                    && void run(() => ownerApi.deleteBooking(item.bookingUid), "Booking deleted.")}
                >
                  <Trash2 aria-hidden="true" size={15} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form className="owner-booking-form" onSubmit={addBooking}>
          <h3>Add a booking manually</h3>
          {(["name", "email", "startAt", "endAt"] as const).map((field) => (
            <div className="form-field" key={field}>
              <label htmlFor={`booking-${field}`}>{{ name: "Name", email: "Email", startAt: "Start", endAt: "End" }[field]}</label>
              <input
                id={`booking-${field}`}
                required
                type={field === "email" ? "email" : field === "name" ? "text" : "datetime-local"}
                value={booking[field]}
                onChange={(event) => setBooking((current) => ({ ...current, [field]: event.target.value }))}
              />
            </div>
          ))}
          <button className="button button-primary" type="submit">Add booking</button>
        </form>
      </section>
    </>
  );
}

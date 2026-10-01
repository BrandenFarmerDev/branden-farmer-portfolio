import { PageIntro } from "../components/PageIntro";
import { siteContent } from "../content/site";

const sections = [
  {
    title: "Contact form",
    items: [
      "The form collects your name, email address, company, position, and message.",
      "Messages are stored privately in Cloudflare D1 so they are not lost if email delivery fails, then delivered through Resend.",
      "Messages are kept for up to 12 months after the last interaction and then deleted automatically.",
    ],
  },
  {
    title: "Interview booking",
    items: [
      "Cal.com handles scheduling, calendar availability, time zones, confirmations, and changes.",
      "When a booking is created, rescheduled, or cancelled, the attendee name, email address, meeting times, and status are recorded privately. Meeting links and notes are not stored.",
      "Booking history is kept for up to 12 months after the last change.",
    ],
  },
  {
    title: "Ask Branden",
    items: [
      "Questions and pasted job descriptions are used only to answer the request and are not stored.",
      "Your most recent answer is kept in this browser tab's session storage so the Back button can restore it. It is cleared when the tab closes and is never sent to the server.",
      "Answers are generated only from published portfolio content, never from contact messages, bookings, or other private data.",
      "A signed, anonymous cookie and a daily keyed hash of your network address enforce the daily answer allowance. These counters are deleted after 7 days.",
      "Aggregate usage totals without questions or network addresses are kept for 90 days.",
    ],
  },
  {
    title: "Your choices",
    items: [
      `To request a copy or deletion of your contact or booking record, email ${siteContent.links.email.href.replace("mailto:", "")}.`,
      "Service providers: Cloudflare (hosting, security checks, database, AI inference), Resend (email delivery), and Cal.com (scheduling).",
    ],
  },
];

export function PrivacyPage() {
  return (
    <>
      <PageIntro
        eyebrow="Privacy"
        title="What this site keeps, and for how long"
        description="The portfolio collects only what it needs to reply to recruiters, keep interview history, and prevent abuse."
      />
      <section className="section content-width privacy-list">
        {sections.map((section) => (
          <article key={section.title}>
            <h2>{section.title}</h2>
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </section>
    </>
  );
}

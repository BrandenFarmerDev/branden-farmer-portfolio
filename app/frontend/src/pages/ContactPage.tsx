import { BriefcaseBusiness, Clock3, CodeXml, Mail, ShieldCheck } from "lucide-react";
import { BookingLink } from "../components/BookingLink";
import { ContactForm } from "../components/ContactForm";
import { LinkOrPlaceholder } from "../components/LinkOrPlaceholder";
import { PageIntro } from "../components/PageIntro";
import { bookingContent, siteContent } from "../content/site";

const contactLinks = [
  { icon: Mail, link: siteContent.links.email, description: "Start a direct conversation." },
  { icon: BriefcaseBusiness, link: siteContent.links.linkedin, description: "Connect and view professional updates." },
  { icon: CodeXml, link: siteContent.links.github, description: "Review public code and repositories." },
];

export function ContactPage() {
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Start with the channel that works for you"
        description="Email, LinkedIn, GitHub, and interview scheduling are available below."
      />
      <section className="section content-width contact-layout">
        <ContactForm />
        <div className="contact-side-stack">
          <section className="direct-contact" aria-labelledby="direct-contact-heading">
            <p className="eyebrow">Direct contact</p>
            <h2 id="direct-contact-heading">Prefer another channel?</h2>
            <div className="contact-options">
              {contactLinks.map(({ icon: Icon, link, description }) => (
                <article className="contact-option" key={link.label}>
                  <Icon aria-hidden="true" />
                  <div>
                    <LinkOrPlaceholder link={link} />
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="booking-panel" aria-labelledby="booking-heading">
            <p className="eyebrow">Scheduling</p>
            <h2 id="booking-heading">{bookingContent.title}</h2>
            <p>{bookingContent.description}</p>
            <ul className="booking-points" aria-label="Booking details">
              <li>
                <Clock3 aria-hidden="true" />
                Times are shown in the time zone selected in the booking dialog.
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                You can review the meeting details before confirming.
              </li>
            </ul>
            <BookingLink />
            <p className="booking-privacy">
              Scheduling is handled by Cal.com. If the dialog is unavailable, the link opens Cal.com directly.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}

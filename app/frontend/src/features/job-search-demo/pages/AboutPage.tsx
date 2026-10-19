import { PageHeader } from "../components/PageHeader";
import { Panel } from "../ui";

const capabilities = [
  { title: "Collect relevant events", description: "The real application imports confirmations and recruiter messages from a mailbox and a read-only tracker. In this demo those sources are simulated with fixed fictional messages." },
  { title: "Review the timeline", description: "Connect each event to source evidence and let the owner correct associations before relying on them." },
  { title: "Understand follow-ups", description: "Review outcomes without presenting inferred events as confirmed application status." },
];

export function AboutPage() {
  return <>
    <PageHeader title="A reviewable job-search timeline" documentTitle="About" description="Review application progress alongside the source evidence and your own decisions." />
    <Panel title="How this workspace works" description="Uncertain matches wait for your review before they affect results.">
      <div className="qe-grid" data-cols="3" data-gap="6">{capabilities.map((item) => <article key={item.title} className="qe-stack" data-gap="1">
        <h3>{item.title}</h3><p className="qe-text-secondary">{item.description}</p>
      </article>)}</div>
    </Panel>
    <Panel title="About this demo">
      <p className="qe-reading">This is an interactive, login-free demonstration of Branden Farmer&apos;s private Job Search Intelligence application. It uses the same screens and workflows with an invented dataset that runs entirely in your browser. Nothing you do is sent anywhere or stored, and refreshing the page restores the original sample. The private application and its real data are separate and stay behind owner access.</p>
    </Panel>
  </>;
}

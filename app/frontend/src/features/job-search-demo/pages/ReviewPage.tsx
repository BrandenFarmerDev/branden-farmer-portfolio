import { useId, useRef, useState } from "react";
import { ApplicationPicker } from "../components/ApplicationPicker";
import { PageHeader } from "../components/PageHeader";
import { StatusOptions } from "../components/StatusOptions";
import { excludeReview, resolveReview } from "../model/actions";
import { limits, type SourceMatch } from "../model/types";
import { useDemo } from "../state/DemoProvider";
import { Alert, Button, EmptyState, Field, Panel, StatusBadge, humanize } from "../ui";

export function ReviewPage() {
  const { reviews, perform } = useDemo();
  const [openId, setOpenId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  function decide(action: Parameters<typeof perform>[0]) {
    const error = perform(action);
    setFailure(error);
    // The resolved item leaves the queue, so focus returns to the page heading rather than a removed button.
    if (!error) { setOpenId(null); heading.current?.focus(); }
  }
  return <>
    <PageHeader title="Review" headingRef={heading} description="Uncertain source records wait here until you link them to an application or exclude them." />
    {reviews.length >= limits.reviewQueue && <Alert tone="info">Showing the first {limits.reviewQueue} records. Resolve some to see the rest.</Alert>}
    {failure && <Alert tone="danger" title="Not saved">{failure}</Alert>}
    <Panel title="Source records to review" description="Each record was found in the simulated mailbox or tracker but could not be matched with confidence.">
      {!reviews.length ? <EmptyState title="No outstanding source records." description="New uncertain matches appear here after the next sync." />
        : <ul className="qe-review-list">{reviews.map((item) => <li key={item.id} className="qe-review-item">
          <ReviewRow item={item} open={openId === item.id} onToggle={() => { setFailure(null); setOpenId(openId === item.id ? null : item.id); }} onDecide={decide} />
        </li>)}</ul>}
    </Panel>
  </>;
}

interface ReviewRowProps { item: SourceMatch; open: boolean; onToggle: () => void; onDecide: (action: ReturnType<typeof resolveReview>) => void }
function ReviewRow({ item, open, onToggle, onDecide }: ReviewRowProps) {
  const formId = useId();
  const [application, setApplication] = useState("");
  const [type, setType] = useState("");
  return <>
    <div className="qe-review-summary">
      <div className="qe-stack" data-gap="1">
        <h3>{item.title}</h3>
        <p className="qe-cluster" data-gap="2"><span className="qe-text-secondary">{humanize(item.source)}</span><StatusBadge value={item.state} /></p>
        <p className="qe-text-secondary">{item.reason}</p>
        {!item.available && <p className="qe-text-muted">Source no longer available in the tracked folder or sheet range.</p>}
      </div>
      <Button size="compact" aria-expanded={open} aria-controls={formId} aria-label={`Resolve ${item.title}`} onClick={onToggle}>Resolve</Button>
    </div>
    {open && <form id={formId} className="qe-review-form qe-stack" data-gap="4" aria-label={`Decision for ${item.title}`} onSubmit={(event) => {
      event.preventDefault();
      if (application && type) onDecide(resolveReview(item.source, item.source_id, application, type));
    }}>
      <ApplicationPicker label="Canonical application" value={application} onChange={setApplication} required />
      <Field label="Verified event">{(control) => <select {...control} className="qe-input" required value={type} onChange={(event) => setType(event.target.value)}><option value="">Choose event</option><StatusOptions /></select>}</Field>
      <div className="qe-cluster">
        <Button type="submit" variant="primary">Save decision</Button>
        <Button variant="quiet" onClick={() => onDecide(excludeReview(item.source, item.source_id))}>Exclude source</Button>
      </div>
    </form>}
  </>;
}

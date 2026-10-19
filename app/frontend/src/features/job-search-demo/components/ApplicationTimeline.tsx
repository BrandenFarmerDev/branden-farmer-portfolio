import { formatDate, plural } from "../model/format";
import type { ApplicationEvent, OwnerDecision } from "../model/types";
import { humanize } from "../ui";

export function ApplicationTimeline({ events, decisions }: { events: ApplicationEvent[]; decisions: OwnerDecision[] }) {
  return <div className="qe-stack" data-gap="4">
    {!events.length ? <p className="qe-text-secondary">No evidence has been recorded for this application.</p>
      : <ol className="qe-timeline" aria-label="Evidence timeline">{events.map((event) => <li key={event.id}>
        <p><time dateTime={event.occurred_at}>{formatDate(event.occurred_at)}</time>{!event.date_known && <span className="qe-text-muted"> (observed; event date unknown)</span>}</p>
        <p className="qe-timeline-title">{humanize(event.type)} <span className="qe-text-muted">· {humanize(event.source)}</span></p>
        {event.subject && <p className="qe-text-secondary">{event.subject}</p>}
        {event.method === "review_required" && !event.superseded && <p className="qe-text-muted">Waiting for your decision in the review queue; not counted in outcomes</p>}
        {event.superseded && <p className="qe-text-muted">Superseded by a later source classification or owner decision</p>}
      </li>)}</ol>}
    <div>
      <p className="qe-label">{plural(decisions.length, "recorded owner decision")}</p>
      {decisions.length > 0 && <ul className="qe-text-secondary">{decisions.map((decision) => <li key={decision.id}>{humanize(decision.field)} · {formatDate(decision.created_at)}</li>)}</ul>}
    </div>
  </div>;
}

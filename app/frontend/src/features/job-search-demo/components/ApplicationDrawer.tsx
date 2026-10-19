import { useId, useRef, useState, type RefObject } from "react";
import { excludeApplication, mergeApplication, updateApplication, type ApplicationFields } from "../model/actions";
import { formatDate } from "../model/format";
import type { ApplicationRecord, DemoState } from "../model/types";
import { useDemo } from "../state/DemoProvider";
import { Alert, Button, Drawer, Field, StatusBadge, Tabs, humanize } from "../ui";
import { ApplicationForm } from "./ApplicationForm";
import { ApplicationPicker } from "./ApplicationPicker";
import { ApplicationTimeline } from "./ApplicationTimeline";
import { StatusOptions } from "./StatusOptions";

const tabs = [{ id: "timeline", label: "Timeline" }, { id: "details", label: "Details" }, { id: "merge", label: "Merge" }];
export interface ApplicationDrawerProps { appId: string; onClose: () => void; fallbackFocusRef: RefObject<HTMLElement | null> }

const timelineOf = (state: DemoState, id: string) => state.events.filter((event) => event.application_id === id).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));

// Opens from the `app` URL parameter and reads its own record, so a deep link works when the row is not on the current page.
export function ApplicationDrawer({ appId, onClose, fallbackFocusRef }: ApplicationDrawerProps) {
  const { state } = useDemo();
  const application = appId ? state.applications.find((candidate) => candidate.id === appId && !candidate.excluded) : undefined;
  return <Drawer open={Boolean(appId)} title={application ? `${application.company} — ${application.role}` : "Application details"} onClose={onClose} fallbackFocusRef={fallbackFocusRef}>
    {application ? <DetailBody key={application.id} application={application} events={timelineOf(state, application.id)} decisions={state.decisions.filter((decision) => decision.application_id === application.id)} onDone={onClose} />
      : <Alert tone="warning" title="Application not found">It may have been excluded or merged, or the link may be wrong. Close this panel to return to the list.</Alert>}
  </Drawer>;
}

interface DetailBodyProps { application: ApplicationRecord; events: ReturnType<typeof timelineOf>; decisions: DemoState["decisions"]; onDone: () => void }
function DetailBody({ application, events, decisions, onDone }: DetailBodyProps) {
  const { perform } = useDemo();
  const [tab, setTab] = useState("timeline");
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const excludeButton = useRef<HTMLButtonElement>(null);
  function save(action: Parameters<typeof perform>[0]) {
    const error = perform(action);
    setFailure(error);
    if (!error) onDone();
  }
  return <div className="qe-stack" data-gap="5">
    <Summary application={application} />
    {failure && <Alert tone="danger" title="Not saved">{failure}</Alert>}
    <Tabs label="Application detail" tabs={tabs} value={tab} onChange={setTab}>
      {tab === "timeline" ? <ApplicationTimeline events={events} decisions={decisions} />
        : tab === "details" ? <div className="qe-stack" data-gap="3"><h3>Correct application</h3><ApplicationForm key={application.id} application={application} submitLabel="Save application" onSubmit={(fields: ApplicationFields) => save(updateApplication(application.id, fields))} /></div>
        : <MergeForm application={application} onMerge={(targetId, status) => save(mergeApplication(application.id, targetId, status))} />}
    </Tabs>
    <hr className="qe-divider" />
    <div className="qe-stack" data-gap="3">
      <Button ref={excludeButton} variant="destructive" aria-expanded={confirming} onClick={() => setConfirming(true)}>Exclude application</Button>
      {confirming && <Alert tone="warning" title="Exclude this application?">
        <p>It will no longer appear in the application list, analytics or CSV export. Source evidence is kept and the decision is recorded in the audit history. This demo has no way to restore it except Reset demo.</p>
        <div className="qe-cluster qe-alert-actions">
          <Button variant="destructive" onClick={() => save(excludeApplication(application.id))}>Confirm exclusion</Button>
          <Button onClick={() => { setConfirming(false); excludeButton.current?.focus(); }}>Cancel</Button>
        </div>
      </Alert>}
    </div>
  </div>;
}

function Summary({ application }: { application: ApplicationRecord }) {
  return <dl className="qe-dl">
    <dt>Status</dt><dd><StatusBadge value={application.status} /></dd>
    <dt>Reconciliation</dt><dd><StatusBadge value={application.reconciliation} /></dd>
    <dt>Applied</dt><dd>{formatDate(application.applied_at)}</dd>
    <dt>Requisition</dt><dd>{application.requisition_id ?? "Not recorded"}</dd>
    <dt>Source</dt><dd>{humanize(application.source)}</dd>
  </dl>;
}

function MergeForm({ application, onMerge }: { application: ApplicationRecord; onMerge: (targetId: string, status: string) => void }) {
  const heading = useId();
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<string>(application.status);
  return <form className="qe-stack" data-gap="4" aria-labelledby={heading} onSubmit={(event) => { event.preventDefault(); onMerge(target, status); }}>
    <div className="qe-stack" data-gap="1">
      <h3 id={heading}>Merge into another application</h3>
      <p className="qe-text-secondary">Moves this application&apos;s evidence to the application you choose, then removes this one from the list.</p>
    </div>
    <ApplicationPicker label="Merge into" excludeId={application.id} value={target} onChange={setTarget} required />
    <Field label="Verified status after merge">{(control) => <select {...control} className="qe-input" value={status} onChange={(event) => setStatus(event.target.value)}><StatusOptions /></select>}</Field>
    <div className="qe-cluster"><Button type="submit">Merge evidence</Button></div>
  </form>;
}

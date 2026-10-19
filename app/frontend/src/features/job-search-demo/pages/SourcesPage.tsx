import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DELETE_PHRASE, connectGmail, deleteAllData, queueReprocess, resumeGmail, runGmailSync, setTracker } from "../model/actions";
import { formatDateTime, formatDuration } from "../model/format";
import type { SyncRun } from "../model/types";
import { useDemo } from "../state/DemoProvider";
import { Alert, Button, DataTable, Drawer, Field, Panel, StatusBadge, humanize, type Column } from "../ui";

const requiredLabels = ["Job search", "Application receipts", "Recruiter follow ups", "Interviews", "Offers", "Rejections", "Job alerts", "Review"];
const runColumns: Column<SyncRun>[] = [
  { key: "started", header: "Started", render: (run) => formatDateTime(run.started_at) },
  { key: "trigger", header: "Trigger", render: (run) => humanize(run.trigger) },
  { key: "status", header: "Status", render: (run) => <StatusBadge value={run.status} /> },
  { key: "finished", header: "Finished", render: (run) => run.finished_at ? formatDateTime(run.finished_at) : "Not finished" },
  { key: "duration", header: "Duration", align: "end", render: (run) => run.finished_at ? formatDuration(run.started_at, run.finished_at) : "—" },
  { key: "error", header: "Error", render: (run) => run.error_code ? humanize(run.error_code) : "—" },
];

export function SourcesPage() {
  const { state, perform, error } = useDemo();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const { gmail, tracker, runs } = state;
  const finishTimes = runs.map((run) => run.finished_at).filter((time): time is string => time !== null).sort();
  const emailReviews = state.matches.filter((match) => match.source === "email" && ["needs_review", "conflict", "email_only"].includes(match.state)).length;
  const stateLabel = !gmail.connected ? "Not connected" : gmail.paused ? "Paused" : "Connected";
  function deleteAll() {
    const failure = perform(deleteAllData(phrase));
    setDeleteError(failure);
    if (!failure) setConfirming(false);
  }
  return <>
    <PageHeader title="Sources & privacy" description="Connect a simulated Gmail mailbox and tracker, review sync coverage and control the data this demo keeps." />
    <Panel title="Connections" description="This demo simulates a read-only Gmail mailbox and a read-only tracker. No Google sign-in happens, no real mailbox is read, and each sync imports fixed fictional sample messages."
      actions={<>
        <Button variant="primary" disabled={!gmail.connected || gmail.paused} onClick={() => perform(runGmailSync())}>Run Gmail sync</Button>
        <Button disabled={!gmail.connected} onClick={() => perform(resumeGmail())}>Resume Gmail imports</Button>
      </>}>
      <div className="qe-stack" data-gap="5">
        <div className="qe-connection">
          <span className="qe-label">Gmail mailbox</span><StatusBadge value={stateLabel.toLowerCase().replaceAll(" ", "_")} />
          {gmail.connected && <p className="qe-help">Connected account: demo.user@example.com</p>}
          <div className="qe-connection-action">
            {gmail.connected ? <Button disabled={gmail.paused} onClick={() => perform(runGmailSync())}>Sync now</Button> : <Button onClick={() => perform(connectGmail())}>Connect Gmail (simulated)</Button>}
          </div>
        </div>
        {gmail.connected && gmail.paused && <Alert tone="warning" title="Gmail imports are paused">Resume imports to bring in the next batch of sample messages.</Alert>}
        <div className="qe-panel-body" aria-label="Gmail coverage">
          <h3>Mail coverage</h3>
          <p>Recent poll: {finishTimes.length ? formatDateTime(finishTimes[finishTimes.length - 1]) : "Not yet completed"}. Historical sweep: {finishTimes.length ? formatDateTime(finishTimes[0]) : "Not yet completed"}.</p>
          <p>0 pending messages · {emailReviews} messages for review.</p>
          <p className="qe-help">Gmail labels required: {requiredLabels.join(", ")}.</p>
          <p className="qe-help">A real deployment reads only messages under the exact Job search label with read-only access. This demo never contacts Google.</p>
        </div>
        <div className="qe-connection">
          <span className="qe-label">Google tracker</span><StatusBadge value={tracker ? "connected" : "not_connected"} />
          <div className="qe-connection-action"><Button onClick={() => perform(setTracker(!tracker))}>{tracker ? "Pause tracker" : "Connect tracker"}</Button></div>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Panel>
    <Panel title="Sync history" description="The latest runs, newest first." flush>
      <DataTable caption="Sync history" columns={runColumns} rows={runs.slice(0, 10)} rowKey={(run) => run.id} stickyHeader={false} density="compact" empty="No sync runs yet." />
    </Panel>
    <Panel title="Privacy" description="Everything in this demo is fictional and lives only in this browser tab's memory. A refresh or leaving the page discards your changes. The one exception is the CSV file you choose to export.">
      <Button onClick={() => perform(queueReprocess())}>Reprocess retained evidence</Button>
    </Panel>
    <section className="qe-danger-zone" aria-labelledby="danger-heading">
      <div className="qe-stack" data-gap="1"><h2 id="danger-heading">Danger zone</h2><p className="qe-text-secondary">Deleting clears every demo application, record and connection. Use Reset demo in the banner to restore the sample data.</p></div>
      <Button variant="destructive" onClick={() => { setDeleteError(null); setPhrase(""); setConfirming(true); }}>Delete all job data</Button>
    </section>
    <Drawer open={confirming} title="Delete all job data" onClose={() => setConfirming(false)}>
      <form className="qe-stack" data-gap="4" onSubmit={(event) => { event.preventDefault(); deleteAll(); }}>
        <Alert tone="danger" title="This clears the whole demo">This removes connections and all sample records. Imports stay paused until you reconnect.</Alert>
        {deleteError && <Alert tone="danger" title="Nothing was deleted">{deleteError}</Alert>}
        <Field label={`Type ${DELETE_PHRASE}`}>{(control) => <input {...control} className="qe-input" name="confirmation" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" />}</Field>
        <div className="qe-cluster"><Button onClick={() => setConfirming(false)}>Cancel</Button><Button type="submit" variant="destructive" disabled={phrase !== DELETE_PHRASE}>Delete permanently</Button></div>
      </form>
    </Drawer>
  </>;
}

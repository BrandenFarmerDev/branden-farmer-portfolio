import { demoToday, stampAt } from "./clock";
import { importBatches } from "./imports";
import { isEventType, limits, queueStates, type ActionResult, type ApplicationEvent, type ApplicationRecord, type DemoAction, type DemoState, type SourceMatch } from "./types";

export const DELETE_PHRASE = "DELETE ALL JOB DATA";

// Actions are pure: they either return a complete next state or an explicit error, so a rejected action never leaves partial changes.
const fail = (error: string): ActionResult => ({ ok: false, error });
const succeed = (state: DemoState, notice: string): ActionResult => ({ ok: true, state: { ...state, tick: state.tick + 1 }, notice });
const stamp = (state: DemoState): string => stampAt(state.tick + 1);

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= limits.text ? text : null;
}
function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value) && value >= "2000-01-01" && value <= demoToday ? new Date(time).toISOString() : null;
}
const findActive = (state: DemoState, id: string): ApplicationRecord | undefined => state.applications.find((application) => application.id === id && !application.excluded);
const hasRoom = (state: DemoState, events: number, decisions: number): boolean => state.events.length + events <= limits.events && state.decisions.length + decisions <= limits.decisions;
const HISTORY_FULL = "The demo's session history is full. Reset the demo to continue.";

export interface ApplicationFields { company: string; role: string; applied_at: string; status: string }

export function addApplication(fields: ApplicationFields): DemoAction {
  return (state) => {
    const company = cleanText(fields.company); const role = cleanText(fields.role); const appliedAt = parseDate(fields.applied_at);
    if (!company || !role) return fail(`Company and role are required and must be ${limits.text} characters or fewer.`);
    if (!appliedAt) return fail(`Enter a valid applied date between 2000-01-01 and ${demoToday}.`);
    if (!isEventType(fields.status)) return fail("Choose a valid status.");
    if (state.applications.length >= limits.applications) return fail(`The demo holds at most ${limits.applications} applications. Reset the demo to continue.`);
    if (!hasRoom(state, 1, 2)) return fail(HISTORY_FULL);
    const now = stamp(state); const id = `demo-app-${state.tick + 1}`;
    const application: ApplicationRecord = { id, company, role, requisition_id: null, applied_at: appliedAt, status: fields.status, source: "manual", reconciliation: "matched", excluded: false, updated_at: now };
    const event: ApplicationEvent = { id: `evt-${id}`, application_id: id, type: fields.status, occurred_at: appliedAt, source: "manual", source_id: id, date_known: true, superseded: false, method: "manual", subject: null };
    return succeed({ ...state, applications: [...state.applications, application], events: [...state.events, event],
      decisions: [...state.decisions, { id: `dec-${id}`, application_id: id, field: "status", created_at: now }] }, `Added ${company}, ${role}.`);
  };
}

export function updateApplication(id: string, fields: ApplicationFields): DemoAction {
  return (state) => {
    const current = findActive(state, id);
    if (!current) return fail("That application no longer exists.");
    const company = cleanText(fields.company); const role = cleanText(fields.role); const appliedAt = parseDate(fields.applied_at);
    if (!company || !role) return fail(`Company and role are required and must be ${limits.text} characters or fewer.`);
    if (!appliedAt) return fail(`Enter a valid applied date between 2000-01-01 and ${demoToday}.`);
    if (!isEventType(fields.status)) return fail("Choose a valid status.");
    const next: ApplicationRecord = { ...current, company, role, applied_at: appliedAt, status: fields.status };
    const changed = (["company", "role", "applied_at", "status"] as const).filter((field) => next[field] !== current[field]);
    if (!changed.length) return { ok: true, state, notice: "No changes to save." };
    if (!hasRoom(state, 0, changed.length)) return fail(HISTORY_FULL);
    const now = stamp(state);
    return succeed({ ...state, applications: state.applications.map((application) => application.id === id ? { ...next, updated_at: now } : application),
      decisions: [...state.decisions, ...changed.map((field) => ({ id: `dec-${state.tick + 1}-${field}`, application_id: id, field, created_at: now }))] }, "Saved. The dashboard has been refreshed.");
  };
}

export function excludeApplication(id: string): DemoAction {
  return (state) => {
    if (!findActive(state, id)) return fail("That application no longer exists.");
    if (!hasRoom(state, 0, 1)) return fail(HISTORY_FULL);
    const now = stamp(state);
    return succeed({ ...state,
      applications: state.applications.map((application) => application.id === id ? { ...application, excluded: true, reconciliation: "excluded", updated_at: now } : application),
      matches: state.matches.map((match) => match.application_id === id ? { ...match, state: "excluded", reason: "Owner application exclusion" } : match),
      decisions: [...state.decisions, { id: `dec-${state.tick + 1}`, application_id: id, field: "excluded", created_at: now }] }, "Application excluded.");
  };
}

export function mergeApplication(id: string, targetId: string, status: string): DemoAction {
  return (state) => {
    const source = findActive(state, id); const target = findActive(state, targetId);
    if (!source) return fail("That application no longer exists.");
    if (!target || target.id === source.id) return fail("Choose a different, active application to merge into.");
    if (!isEventType(status)) return fail("Choose a valid status after merge.");
    if (!hasRoom(state, 1, 2)) return fail(HISTORY_FULL);
    const now = stamp(state); const key = state.tick + 1;
    const mergeEvent: ApplicationEvent = { id: `evt-merge-${key}`, application_id: target.id, type: status, occurred_at: now, source: "manual", source_id: `merge-${key}`, date_known: true, superseded: false, method: "manual", subject: null };
    return succeed({ ...state,
      applications: state.applications.map((application) => application.id === source.id ? { ...application, excluded: true, reconciliation: "excluded", updated_at: now }
        : application.id === target.id ? { ...application, status, reconciliation: "matched", updated_at: now } : application),
      events: [...state.events.map((event) => event.application_id === source.id ? { ...event, application_id: target.id } : event), mergeEvent],
      matches: state.matches.map((match) => match.application_id === source.id ? { ...match, application_id: target.id, state: "matched", reason: "Owner merge" } : match),
      decisions: [...state.decisions.map((decision) => decision.application_id === source.id ? { ...decision, application_id: target.id } : decision),
        { id: `dec-${key}-merge`, application_id: target.id, field: "merge", created_at: now }, { id: `dec-${key}-status`, application_id: target.id, field: "status", created_at: now }] },
    `Merged ${source.company} into ${target.company}.`);
  };
}

const findQueued = (state: DemoState, source: string, sourceId: string): SourceMatch | undefined =>
  state.matches.find((match) => match.source === source && match.source_id === sourceId && queueStates.includes(match.state));
const STALE_RECORD = "That source record is no longer waiting for review.";

export function resolveReview(source: string, sourceId: string, applicationId: string, type: string): DemoAction {
  return (state) => {
    const match = findQueued(state, source, sourceId);
    if (!match) return fail(STALE_RECORD);
    const application = findActive(state, applicationId);
    if (!application) return fail("Choose an existing, active application.");
    if (!isEventType(type)) return fail("Choose a verified event.");
    if (!hasRoom(state, 1, 2)) return fail(HISTORY_FULL);
    const now = stamp(state); const key = state.tick + 1;
    const existing = state.events.find((event) => event.source === match.source && event.source_id === match.source_id && event.type === type);
    const verified: ApplicationEvent = { id: existing?.id ?? `evt-review-${key}`, application_id: application.id, type, occurred_at: match.occurred_at ?? now, source: match.source, source_id: match.source_id,
      date_known: match.occurred_at !== null, superseded: false, method: "manual", subject: match.source === "email" ? match.title : null };
    const events = state.events.map((event): ApplicationEvent => event.source === match.source && event.source_id === match.source_id && event.type !== type ? { ...event, superseded: true } : event);
    return succeed({ ...state,
      events: existing ? events.map((event) => event.id === existing.id ? verified : event) : [...events, verified],
      matches: state.matches.map((candidate) => candidate.id === match.id ? { ...candidate, application_id: application.id, state: "matched", reason: "Owner association" } : candidate),
      applications: state.applications.map((candidate) => candidate.id === application.id ? { ...candidate, status: type, reconciliation: "matched", updated_at: now } : candidate),
      decisions: [...state.decisions, { id: `dec-${key}-association`, application_id: application.id, field: "association", created_at: now }, { id: `dec-${key}-status`, application_id: application.id, field: "status", created_at: now }] },
    `Linked to ${application.company}.`);
  };
}

export function excludeReview(source: string, sourceId: string): DemoAction {
  return (state) => {
    const match = findQueued(state, source, sourceId);
    if (!match) return fail(STALE_RECORD);
    if (!hasRoom(state, 0, 1)) return fail(HISTORY_FULL);
    return succeed({ ...state, matches: state.matches.map((candidate) => candidate.id === match.id ? { ...candidate, state: "excluded", reason: "Owner exclusion" } : candidate),
      decisions: [...state.decisions, { id: `dec-${state.tick + 1}`, application_id: match.application_id, field: "source_exclusion", created_at: stamp(state) }] }, "Source record excluded.");
  };
}

// ---- Simulated sources. Nothing here contacts a mailbox, tracker or provider.

export function connectGmail(): DemoAction {
  return (state) => state.gmail.connected ? fail("The simulated Gmail mailbox is already connected.")
    : succeed({ ...state, gmail: { connected: true, paused: true } }, "Simulated Gmail connected. Resume imports to bring in sample messages.");
}

function syncGmail(state: DemoState, prefix: string): ActionResult {
  const batch = importBatches.find((candidate) => !state.importedBatches.includes(candidate.id));
  const started = stamp(state);
  const run = { id: `run-${state.tick + 1}`, trigger: "manual" as const, status: "completed" as const, started_at: started, finished_at: new Date(Date.parse(started) + 4000).toISOString(), error_code: null };
  const runs = [run, ...state.runs].slice(0, limits.runs);
  const reprocessed = state.reprocessPending ? " Retained evidence was reprocessed." : "";
  if (!batch) return succeed({ ...state, runs, reprocessPending: false }, `${prefix} No new sample messages.${reprocessed}`);
  // Imports are keyed by batch and record IDs, so repeating a sync can never duplicate records.
  const known = new Set(state.applications.map((application) => application.id));
  const newApplications = batch.applications.filter((application) => !known.has(application.id));
  const room = limits.applications - state.applications.length;
  const accepted = newApplications.slice(0, Math.max(0, room));
  const acceptedIds = new Set(accepted.map((application) => application.id));
  const events = batch.events.filter((event) => acceptedIds.has(event.application_id) && !state.events.some((existing) => existing.id === event.id));
  const matches = batch.matches.filter((match) => !state.matches.some((existing) => existing.id === match.id));
  if (state.events.length + events.length > limits.events) return fail(HISTORY_FULL);
  return succeed({ ...state, applications: [...state.applications, ...accepted], events: [...state.events, ...events], matches: [...state.matches, ...matches], runs,
    importedBatches: [...state.importedBatches, batch.id], reprocessPending: false },
  `${prefix} Imported ${accepted.length} sample applications and ${matches.length} record for review.${reprocessed}`);
}

export function runGmailSync(): DemoAction {
  return (state) => {
    if (!state.gmail.connected) return fail("Connect Gmail before syncing.");
    if (state.gmail.paused) return fail("Gmail imports are paused. Resume imports first.");
    return syncGmail(state, "Gmail sync completed.");
  };
}

export function resumeGmail(): DemoAction {
  return (state) => state.gmail.connected ? syncGmail({ ...state, gmail: { ...state.gmail, paused: false } }, "Gmail imports resumed and sync completed.")
    : fail("Connect Gmail before resuming imports.");
}

export function setTracker(connected: boolean): DemoAction {
  return (state) => state.tracker === connected ? fail(`The simulated tracker is already ${connected ? "connected" : "paused"}.`)
    : succeed({ ...state, tracker: connected }, connected ? "Simulated tracker connected." : "Simulated tracker paused.");
}

export function queueReprocess(): DemoAction {
  return (state) => succeed({ ...state, reprocessPending: true }, "Retained evidence will be reprocessed on the next sync.");
}

export function deleteAllData(confirmation: string): DemoAction {
  return (state) => confirmation !== DELETE_PHRASE ? fail(`Type ${DELETE_PHRASE} exactly to confirm.`)
    : succeed({ ...state, applications: [], events: [], matches: [], decisions: [], runs: [], importedBatches: [], reprocessPending: false, gmail: { connected: false, paused: true }, tracker: false },
      "All demo data was deleted. Imports stay paused until you reconnect a source. Use Reset demo to restore the sample data.");
}

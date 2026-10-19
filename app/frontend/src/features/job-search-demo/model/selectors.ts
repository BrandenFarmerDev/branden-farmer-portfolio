import { DAY, DEMO_NOW } from "./clock";
import {
  limits, queueStates, type ApplicationEvent, type ApplicationRecord, type ApplicationSort, type DemoState, type Dashboard, type OutcomeCounts, type OutcomeDimension, type SourceMatch,
} from "./types";

const WEEKS = 26; const OUTCOME_LIMIT = 50; const FOLLOW_UP_DAYS = 7;
const CLOSED_STATUSES = ["rejection", "withdrawal", "position_closed", "offer"];
const NON_RESPONSES = ["application_submitted", "application_confirmation", "follow_up_sent", "other_job_related"];
const isResponse = (type: string): boolean => !NON_RESPONSES.includes(type);

export const activeApplications = (state: DemoState): ApplicationRecord[] => state.applications.filter((application) => !application.excluded);
export const reviewQueue = (state: DemoState): SourceMatch[] =>
  state.matches.filter((match) => queueStates.includes(match.state)).slice(0, limits.reviewQueue);

/** Events that may count toward outcomes: review-only, superseded and owner-excluded evidence never does. */
export function countableEvents(state: DemoState): ApplicationEvent[] {
  const excluded = new Set(state.matches.filter((match) => match.state === "excluded").map((match) => `${match.source}:${match.source_id}`));
  return state.events.filter((event) => !event.superseded && event.method !== "review_required" && !excluded.has(`${event.source}:${event.source_id}`));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const mondayOf = (time: number): number => {
  const day = Math.floor(time / DAY) * DAY;
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
};
export function weeklyCounts(applications: ApplicationRecord[], now: number): Dashboard["weekly"] {
  const current = mondayOf(now); const counts = new Array<number>(WEEKS).fill(0);
  for (const application of applications) {
    const weeksBack = (current - mondayOf(Date.parse(application.applied_at))) / (7 * DAY);
    if (weeksBack >= 0 && weeksBack < WEEKS) counts[WEEKS - 1 - weeksBack]++;
  }
  return counts.map((count, position) => ({ weekStart: new Date(current - (WEEKS - 1 - position) * 7 * DAY).toISOString().slice(0, 10), count }));
}

interface Tally { applied: number; responses: number; screenings: number; interviews: number; offers: number; rejections: number; days: number[] }
const emptyTally = (): Tally => ({ applied: 0, responses: 0, screenings: 0, interviews: 0, offers: 0, rejections: 0, days: [] });
// Maps plus fromEntries keep keys such as "__proto__" as ordinary data properties.
function rankedOutcomes(tallies: Map<string, Tally>, limit = Infinity): Record<string, OutcomeCounts> {
  const ranked = [...tallies].sort(([first, a], [second, b]) => b.applied - a.applied || (first < second ? -1 : first > second ? 1 : 0)).slice(0, limit);
  return Object.fromEntries(ranked.map(([name, { days, ...counts }]) => [name, { ...counts, medianResponseDays: median(days) }]));
}

export function buildDashboard(state: DemoState, now = DEMO_NOW): Dashboard {
  const applications = activeApplications(state);
  const byApplication = new Map<string, ApplicationEvent[]>();
  for (const event of countableEvents(state)) byApplication.set(event.application_id, [...(byApplication.get(event.application_id) ?? []), event]);
  for (const list of byApplication.values()) list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const metrics: Record<string, number> = { total: applications.length, thisWeek: 0, thisMonth: 0, active: 0, responses: 0, rejections: 0, screenings: 0, interviews: 0, offers: 0, review: 0 };
  const groupNames = ["status", "source", "company", "role", "reconciliation", "month"] as const;
  const groups = new Map(groupNames.map((name) => [name, new Map<string, number>()]));
  const tallies = { source: new Map<string, Tally>(), company: new Map<string, Tally>(), role: new Map<string, Tally>() };
  const knownResponseDays: number[] = [];
  const followUps: Dashboard["followUps"] = [];
  const thisMonth = new Date(now).toISOString().slice(0, 7);

  for (const application of applications) {
    const events = byApplication.get(application.id) ?? [];
    const applied = Date.parse(application.applied_at);
    const age = Math.max(0, (now - applied) / DAY);
    const response = events.find((event) => isResponse(event.type));
    const has = (type: string) => events.some((event) => event.type === type);
    const interviewed = events.some((event) => event.type.startsWith("interview_"));
    const closed = CLOSED_STATUSES.includes(application.status);
    const responseDays = response?.date_known ? Math.max(0, (Date.parse(response.occurred_at) - applied) / DAY) : null;
    if (age <= 7) metrics.thisWeek++;
    if (application.applied_at.slice(0, 7) === thisMonth) metrics.thisMonth++;
    if (!closed) metrics.active++;
    if (response) metrics.responses++;
    if (interviewed) metrics.interviews++;
    if (has("screening")) metrics.screenings++;
    if (has("offer")) metrics.offers++;
    if (has("rejection")) metrics.rejections++;
    if (application.reconciliation === "needs_review" || application.reconciliation === "conflict") metrics.review++;
    if (responseDays !== null) knownResponseDays.push(responseDays);
    if (!response && !closed && age >= FOLLOW_UP_DAYS) {
      followUps.push({ application_id: application.id, company: application.company, role: application.role, due_at: new Date(applied + FOLLOW_UP_DAYS * DAY).toISOString() });
    }
    const labels = { status: application.status, source: application.source, company: application.company, role: application.role, reconciliation: application.reconciliation, month: application.applied_at.slice(0, 7) };
    for (const name of groupNames) { const counts = groups.get(name)!; counts.set(labels[name], (counts.get(labels[name]) ?? 0) + 1); }
    for (const dimension of ["source", "company", "role"] as const) {
      const map = tallies[dimension]; const tally = map.get(labels[dimension]) ?? emptyTally();
      tally.applied++;
      if (response) tally.responses++;
      if (has("screening")) tally.screenings++;
      if (interviewed) tally.interviews++;
      if (has("offer")) tally.offers++;
      if (has("rejection")) tally.rejections++;
      if (responseDays !== null) tally.days.push(responseDays);
      map.set(labels[dimension], tally);
    }
  }
  for (const field of ["responses", "rejections", "screenings", "interviews", "offers"]) metrics[`${field}Rate`] = metrics.total ? metrics[field] / metrics.total : 0;
  const lastRun = state.runs.filter((run) => run.status === "completed" && run.finished_at).map((run) => run.finished_at!).sort().at(-1) ?? null;
  const outcomes: Record<OutcomeDimension, Record<string, OutcomeCounts>> = {
    source: rankedOutcomes(tallies.source), company: rankedOutcomes(tallies.company, OUTCOME_LIMIT), role: rankedOutcomes(tallies.role, OUTCOME_LIMIT),
  };
  return {
    total: applications.length, metrics, outcomes, weekly: weeklyCounts(applications, now), medianFirstResponseDays: median(knownResponseDays), lastSuccessfulSyncAt: lastRun, followUps,
    groups: Object.fromEntries([...groups].map(([name, counts]) => [name, Object.fromEntries(counts)])),
  };
}

export interface ListFilters { q: string; status: string; source: string; reconciliation: string; from: string; to: string; company: string; role: string }
export interface ListQuery { filters: ListFilters; sort: ApplicationSort; page: number; pageSize: 25 | 50 }
export interface ListPage { applications: ApplicationRecord[]; page: number; total: number }
const sorters: Record<ApplicationSort, (a: ApplicationRecord, b: ApplicationRecord) => number> = {
  applied_desc: (a, b) => b.applied_at.localeCompare(a.applied_at),
  applied_asc: (a, b) => a.applied_at.localeCompare(b.applied_at),
  company: (a, b) => a.company.toLowerCase().localeCompare(b.company.toLowerCase()),
  status: (a, b) => a.status.localeCompare(b.status),
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
};

/** Filters, sorts and pages active applications. A page past the end is clamped so a stale link still shows records. */
export function queryApplications(applications: ApplicationRecord[], { filters, sort, page, pageSize }: ListQuery): ListPage {
  const needle = filters.q.toLowerCase();
  const matching = applications.filter((application) =>
    !application.excluded
    && (!needle || application.company.toLowerCase().includes(needle) || application.role.toLowerCase().includes(needle))
    && (!filters.status || application.status === filters.status) && (!filters.source || application.source === filters.source)
    && (!filters.reconciliation || application.reconciliation === filters.reconciliation)
    && (!filters.from || application.applied_at >= filters.from) && (!filters.to || application.applied_at <= `${filters.to}T23:59:59.999Z`)
    && (!filters.company || application.company === filters.company) && (!filters.role || application.role === filters.role),
  ).sort((a, b) => sorters[sort](a, b) || a.id.localeCompare(b.id));
  const lastPage = Math.max(0, Math.ceil(matching.length / pageSize) - 1);
  const current = Math.min(Math.max(0, page), lastPage);
  return { applications: matching.slice(current * pageSize, (current + 1) * pageSize), page: current, total: matching.length };
}

/** Quote, comma and newline escaping plus formula neutralisation, including after leading whitespace or control characters. */
const FORMULA_START = /^[\s\p{Cc}]*[=+\-@]|^[\t\r]/u;
function csvCell(value: string | null): string {
  const text = value ?? "";
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function applicationsCsv(applications: ApplicationRecord[]): string {
  const rows = [...applications].filter((application) => !application.excluded).sort((a, b) => a.applied_at.localeCompare(b.applied_at) || a.id.localeCompare(b.id));
  return [["ID", "Company", "Role", "Requisition", "Applied", "Status", "Reconciliation"],
    ...rows.map((application) => [application.id, application.company, application.role, application.requisition_id, application.applied_at, application.status, application.reconciliation])]
    .map((row) => row.map(csvCell).join(",")).join("\r\n");
}

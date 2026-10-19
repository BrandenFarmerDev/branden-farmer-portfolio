import { daysBefore, DAY } from "./clock";
import type { ApplicationEvent, ApplicationRecord, ApplicationSource, DemoState, EventType, SourceMatch, SyncRun } from "./types";

// Every employer, person and message below is invented for this demo.
type Step = readonly [type: EventType, afterDays: number];
type Seed = readonly [company: string, role: string, daysAgo: number, source: ApplicationSource, steps: readonly Step[]];

const seeds: readonly Seed[] = [
  ["Alderbrook Analytics", "Data Analyst", 151, "email", [["application_confirmation", 0], ["rejection", 19]]],
  ["Bluefen Logistics", "Operations Analyst", 146, "sheet", [["recruiter_outreach", 3], ["screening", 8], ["interview_completed", 17], ["rejection", 30]]],
  ["Cinderpoint Software", "Application Developer", 140, "email", [["application_confirmation", 0]]],
  ["Dunmere Health Systems", "Reporting Analyst", 133, "manual", [["screening", 6], ["assessment_completed", 12], ["interview_completed", 22], ["offer", 35]]],
  ["Eastlake Grid Partners", "Business Intelligence Developer", 129, "email", [["application_confirmation", 0], ["screening", 9], ["rejection", 21]]],
  ["Fernhollow Labs", "Analytics Engineer", 124, "sheet", []],
  ["Granite Quay Capital", "Data Analyst", 118, "email", [["application_confirmation", 0], ["follow_up_sent", 14]]],
  ["Harbor Lantern Media", "Product Analyst", 113, "email", [["application_confirmation", 0], ["rejection", 12]]],
  ["Ironwillow Manufacturing", "Supply Chain Analyst", 109, "manual", [["interview_scheduled", 7], ["interview_completed", 11], ["withdrawal", 20]]],
  ["Juniper Ridge Energy", "Operations Analyst", 104, "email", [["application_confirmation", 0], ["recruiter_outreach", 5], ["screening", 10], ["assessment_requested", 13]]],
  ["Kestrel Mill Foods", "Planning Manager", 99, "sheet", [["position_closed", 25]]],
  ["Lumenford Robotics", "Software Engineer", 95, "email", [["application_confirmation", 0], ["rejection", 8]]],
  ["Marrow Creek Insurance", "Reporting Analyst", 91, "email", [["application_confirmation", 0]]],
  ["Nettlebay Cloud", "Analytics Engineer", 88, "email", [["application_confirmation", 0], ["screening", 6], ["interview_scheduled", 12], ["interview_completed", 15], ["rejection", 24]]],
  ["Oakmoor Education", "Data Analyst", 84, "manual", []],
  ["Pinecast Retail", "Business Intelligence Developer", 80, "email", [["application_confirmation", 0], ["recruiter_outreach", 4], ["screening", 9]]],
  ["Quillstone Legal Technology", "Application Developer", 77, "sheet", [["rejection", 16]]],
  ["Redfinch Transit", "Operations Analyst", 73, "email", [["application_confirmation", 0], ["interview_requested", 8], ["interview_completed", 14], ["offer", 27]]],
  ["Saltmarsh Biotech", "Data Analyst", 69, "email", [["application_confirmation", 0]]],
  ["Tallow Hill Aerospace", "Supply Chain Analyst", 66, "sheet", [["screening", 7]]],
  ["Alderbrook Analytics", "Analytics Engineer", 62, "email", [["application_confirmation", 0], ["recruiter_outreach", 3]]],
  ["Umberlight Utilities", "Reporting Analyst", 58, "email", [["application_confirmation", 0], ["rejection", 10]]],
  ["Vantage Orchard Foods", "Planning Manager", 55, "manual", [["follow_up_sent", 7]]],
  ["Willowmere Bank", "Business Intelligence Developer", 52, "email", [["application_confirmation", 0], ["assessment_requested", 6], ["assessment_completed", 9], ["screening", 14]]],
  ["Yarrowfield Health", "Data Analyst", 48, "email", [["application_confirmation", 0]]],
  ["Zephyr Quay Shipping", "Operations Analyst", 44, "sheet", []],
  ["Bluefen Logistics", "Product Analyst", 41, "email", [["application_confirmation", 0], ["rejection", 15]]],
  ["Cinderpoint Software", "Software Engineer", 37, "email", [["application_confirmation", 0], ["screening", 5], ["interview_scheduled", 11]]],
  ["Dunmere Health Systems", "Data Analyst", 33, "email", [["application_confirmation", 0]]],
  ["Eastlake Grid Partners", "Operations Analyst", 29, "manual", [["recruiter_outreach", 2]]],
  ["Fernhollow Labs", "Application Developer", 24, "email", [["application_confirmation", 0], ["rejection", 9]]],
  ["Granite Quay Capital", "Reporting Analyst", 19, "email", [["application_confirmation", 0]]],
  ["Harbor Lantern Media", "Analytics Engineer", 14, "email", [["application_confirmation", 0], ["screening", 4]]],
  ["Ironwillow Manufacturing", "Business Intelligence Developer", 9, "sheet", []],
  ["Juniper Ridge Energy", "Data Analyst", 5, "email", [["application_confirmation", 0]]],
  ["Kestrel Mill Foods", "Supply Chain Analyst", 2, "manual", []],
];

/** Seeds that are not "matched", by position; each has a waiting review record. */
const flagged: Readonly<Record<number, SourceMatch["state"]>> = { 2: "needs_review", 6: "conflict", 12: "email_only", 14: "sheet_only", 18: "needs_review", 26: "conflict" };
const reasons: Readonly<Record<string, string>> = {
  needs_review: "The sender and subject suggest a match, but confidence is below the automatic threshold.",
  conflict: "Two applications could match this record, and the dates disagree.",
  email_only: "Found in mail but not in the tracker.",
  sheet_only: "Found in the tracker but no matching mail was found.",
};
const unlinkedReviews: readonly [SourceMatch["source"], SourceMatch["state"], string][] = [
  ["email", "email_only", "Interview availability for next week"], ["sheet", "sheet_only", "Tracker row: Larkspur Mutual · Data Analyst"], ["email", "needs_review", "Thank you for applying"],
];

const midnight = (daysAgo: number): string => `${daysBefore(daysAgo)}T00:00:00.000Z`;
const addDays = (iso: string, days: number): string => new Date(Date.parse(iso) + days * DAY).toISOString();
const pad = (index: number): string => String(index + 1).padStart(3, "0");

export function seedApplications(): Pick<DemoState, "applications" | "events" | "matches"> {
  const applications: ApplicationRecord[] = []; const events: ApplicationEvent[] = []; const matches: SourceMatch[] = [];
  seeds.forEach(([company, role, daysAgo, source, steps], index) => {
    const id = `app-${pad(index)}`; const applied = midnight(daysAgo);
    const opensWithSubmission = source === "manual" || steps[0]?.[0] === "application_confirmation";
    const timeline: Step[] = opensWithSubmission ? [...steps] : [["application_submitted", 0], ...steps];
    if (!timeline.length) timeline.push(["application_submitted", 0]);
    const [last, lastDay] = timeline[timeline.length - 1];
    applications.push({ id, company, role, requisition_id: index % 3 === 0 ? `REQ-${4100 + index}` : null, applied_at: applied, status: last, source, reconciliation: flagged[index] ?? "matched", excluded: false, updated_at: addDays(applied, lastDay) });
    timeline.forEach(([type, afterDays], step) => events.push({
      id: `evt-${pad(index)}-${step + 1}`, application_id: id, type, occurred_at: addDays(applied, afterDays), source, source_id: `${source}-${pad(index)}-${step + 1}`,
      date_known: type !== "position_closed" && !(source === "sheet" && step > 0), superseded: false, method: source === "manual" ? "manual" : "classified",
      subject: source === "email" ? `${company}: ${type.replaceAll("_", " ")}` : null,
    }));
    const state = flagged[index];
    if (!state) return;
    const sourceKind = state === "sheet_only" ? "sheet" : "email"; const sourceId = `review-${pad(index)}`;
    matches.push({ id: `match-${pad(index)}`, source: sourceKind, source_id: sourceId, application_id: id, state, reason: reasons[state],
      title: sourceKind === "email" ? `Re: ${role} at ${company}` : `Tracker row: ${company} · ${role}`, available: index !== 12, occurred_at: sourceKind === "email" ? addDays(applied, 6) : null });
    events.push({ id: `evt-${pad(index)}-review`, application_id: id, type: "screening", occurred_at: addDays(applied, 6), source: sourceKind, source_id: sourceId, date_known: sourceKind === "email", superseded: false, method: "review_required", subject: null });
  });
  unlinkedReviews.forEach(([source, state, title], index) => matches.push({ id: `match-u${index + 1}`, source, source_id: `review-u${index + 1}`, application_id: null, state, reason: reasons[state], title, available: true, occurred_at: source === "email" ? `${daysBefore(3 + index)}T09:30:00.000Z` : null }));
  return { applications, events, matches };
}

export function seedRuns(): SyncRun[] {
  return [1, 2, 3, 4].map((blocksBack) => {
    const started = Date.parse(`${daysBefore(0)}T17:00:00.000Z`) - blocksBack * 6 * 3_600_000;
    return { id: `run-seed-${blocksBack}`, trigger: "scheduled" as const, status: "completed" as const, started_at: new Date(started).toISOString(), finished_at: new Date(started + 38_000).toISOString(), error_code: null };
  });
}

export function createInitialState(): DemoState {
  return { ...seedApplications(), decisions: [], runs: seedRuns(), gmail: { connected: true, paused: false }, tracker: true, importedBatches: [], reprocessPending: false, tick: 0 };
}

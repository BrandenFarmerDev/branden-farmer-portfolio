import { daysBefore } from "./clock";
import type { ApplicationEvent, ApplicationRecord, SourceMatch } from "./types";

// Fixed sample "mailbox" batches. A simulated Gmail sync imports the next batch it has not seen, so syncing is repeatable and never duplicates records.
interface ImportBatch { id: string; applications: ApplicationRecord[]; events: ApplicationEvent[]; matches: SourceMatch[] }
type BatchSeed = readonly [company: string, role: string, daysAgo: number];
const batchSeeds: readonly { applications: readonly [BatchSeed, BatchSeed]; review: Pick<SourceMatch, "source" | "state" | "title" | "reason"> }[] = [
  { applications: [["Ashgrove Mutual", "Data Analyst", 1], ["Brightwater Freight", "Operations Analyst", 2]],
    review: { source: "email", state: "needs_review", title: "Update on your application", reason: "The message does not name the role, so the match needs your decision." } },
  { applications: [["Copperfield Systems", "Analytics Engineer", 1], ["Dovetail Foods", "Reporting Analyst", 3]],
    review: { source: "sheet", state: "sheet_only", title: "Tracker row: Eveline Works · Planner", reason: "Found in the tracker but no matching mail was found." } },
  { applications: [["Foxglove Software", "Software Engineer", 2], ["Glenmoor Health", "Data Analyst", 4]],
    review: { source: "email", state: "conflict", title: "Next steps for your application", reason: "Two applications could match this record, and the dates disagree." } },
];

export const importBatches: ImportBatch[] = batchSeeds.map(({ applications, review }, index): ImportBatch => {
  const id = `batch-${index + 1}`;
  const records = applications.map(([company, role, daysAgo], position) => {
    const appId = `imp-${index + 1}-${position + 1}`; const applied = `${daysBefore(daysAgo)}T00:00:00.000Z`;
    const application: ApplicationRecord = { id: appId, company, role, requisition_id: null, applied_at: applied, status: "application_confirmation", source: "email", reconciliation: "matched", excluded: false, updated_at: applied };
    const event: ApplicationEvent = { id: `evt-${appId}`, application_id: appId, type: "application_confirmation", occurred_at: applied, source: "email", source_id: `msg-${appId}`, date_known: true, superseded: false, method: "classified", subject: `${company}: application confirmation` };
    return { application, event };
  });
  const match: SourceMatch = { id: `match-${id}`, ...review, source_id: `review-${id}`, application_id: null, available: true, occurred_at: review.source === "email" ? `${daysBefore(1)}T08:00:00.000Z` : null };
  return { id, applications: records.map((record) => record.application), events: records.map((record) => record.event), matches: [match] };
});

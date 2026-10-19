export const eventTypes = ["application_submitted", "application_confirmation", "recruiter_outreach", "screening",
  "assessment_requested", "assessment_completed", "interview_requested", "interview_scheduled", "interview_completed",
  "follow_up_sent", "follow_up_received", "rejection", "offer", "withdrawal", "position_closed", "other_job_related"] as const;
export type EventType = typeof eventTypes[number];
export const isEventType = (value: unknown): value is EventType => typeof value === "string" && eventTypes.some((type) => type === value);

export type ApplicationSource = "email" | "sheet" | "manual";
export const sourceOptions: readonly ApplicationSource[] = ["email", "sheet", "manual"];
export type ReconciliationState = "matched" | "email_only" | "sheet_only" | "conflict" | "needs_review" | "excluded";
export const queueStates: readonly ReconciliationState[] = ["needs_review", "conflict", "email_only", "sheet_only"];
export const reconciliationOptions = ["matched", "email_only", "sheet_only", "conflict", "needs_review"] as const;

export interface ApplicationRecord {
  id: string; company: string; role: string; requisition_id: string | null; applied_at: string;
  status: EventType; source: ApplicationSource; reconciliation: ReconciliationState; excluded: boolean; updated_at: string;
}
export type EventMethod = "classified" | "manual" | "review_required";
export interface ApplicationEvent {
  id: string; application_id: string; type: EventType; occurred_at: string; source: ApplicationSource; source_id: string;
  date_known: boolean; superseded: boolean; method: EventMethod; subject: string | null;
}
/** A mail message or tracker row waiting for (or finished with) an owner decision. */
export interface SourceMatch {
  id: string; source: "email" | "sheet"; source_id: string; application_id: string | null;
  state: ReconciliationState; reason: string; title: string; available: boolean; occurred_at: string | null;
}
export interface OwnerDecision { id: string; application_id: string | null; field: string; created_at: string }
export interface SyncRun { id: string; trigger: "scheduled" | "manual"; status: "completed" | "failed"; started_at: string; finished_at: string | null; error_code: string | null }

export interface DemoState {
  applications: ApplicationRecord[]; events: ApplicationEvent[]; matches: SourceMatch[]; decisions: OwnerDecision[]; runs: SyncRun[];
  gmail: { connected: boolean; paused: boolean }; tracker: boolean;
  importedBatches: string[]; reprocessPending: boolean;
  /** Counts accepted actions; the synthetic clock and generated IDs derive from it. */
  tick: number;
}

export type ActionResult = { ok: true; state: DemoState; notice: string } | { ok: false; error: string };
export type DemoAction = (state: DemoState) => ActionResult;

export type OutcomeDimension = "source" | "company" | "role";
export interface OutcomeCounts {
  applied: number; responses: number; screenings: number; interviews: number; offers: number; rejections: number; medianResponseDays: number | null;
}
export interface FollowUp { application_id: string; company: string; role: string; due_at: string }
export interface Dashboard {
  total: number; metrics: Record<string, number>; groups: Record<string, Record<string, number>>;
  outcomes: Record<OutcomeDimension, Record<string, OutcomeCounts>>;
  weekly: { weekStart: string; count: number }[]; medianFirstResponseDays: number | null;
  lastSuccessfulSyncAt: string | null; followUps: FollowUp[];
}

export const applicationSorts = ["applied_desc", "applied_asc", "company", "status", "updated"] as const;
export type ApplicationSort = typeof applicationSorts[number];

/** Session limits that keep the in-memory demo bounded. */
export const limits = { applications: 200, events: 1000, decisions: 1000, runs: 20, text: 200, reviewQueue: 100 } as const;

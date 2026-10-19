import { describe, expect, it } from "vitest";
import {
  addApplication, connectGmail, DELETE_PHRASE, deleteAllData, excludeApplication, excludeReview, mergeApplication, queueReprocess, resolveReview, resumeGmail, runGmailSync, setTracker, updateApplication,
} from "./actions";
import { createInitialState } from "./fixtures";
import { activeApplications, buildDashboard, countableEvents, reviewQueue } from "./selectors";
import { limits, type ActionResult, type DemoAction, type DemoState } from "./types";

function run(state: DemoState, action: DemoAction): DemoState {
  const result = action(state);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const failure = (result: ActionResult): string => { if (result.ok) throw new Error("expected failure"); return result.error; };
const valid = { company: "Test Co", role: "Tester", applied_at: "2026-10-10", status: "application_submitted" };
const initial = createInitialState();

describe("addApplication", () => {
  it("adds a manual application with a status event and decision, visible to analytics", () => {
    const state = run(initial, addApplication(valid));
    const added = state.applications.at(-1)!;
    expect(added).toMatchObject({ company: "Test Co", source: "manual", reconciliation: "matched", status: "application_submitted" });
    expect(state.events.at(-1)).toMatchObject({ application_id: added.id, method: "manual", date_known: true });
    expect(state.decisions.at(-1)?.field).toBe("status");
    expect(buildDashboard(state).total).toBe(37);
    expect(state.tick).toBe(initial.tick + 1);
    expect(initial.applications).toHaveLength(36);
  });
  it.each([
    [{ ...valid, company: "   " }, /required/], [{ ...valid, role: "" }, /required/], [{ ...valid, company: "x".repeat(201) }, /200/],
    [{ ...valid, applied_at: "2026-02-30" }, /valid applied date/], [{ ...valid, applied_at: "yesterday" }, /valid applied date/], [{ ...valid, applied_at: "1999-12-31" }, /valid applied date/],
    [{ ...valid, applied_at: "2026-10-16" }, /valid applied date/], [{ ...valid, status: "hired" }, /status/],
  ])("rejects invalid input %#", (fields, message) => {
    expect(failure(addApplication(fields)(initial))).toMatch(message);
  });
  it("keeps rendered text inert by storing it verbatim", () => {
    const state = run(initial, addApplication({ ...valid, company: "<img src=x onerror=alert(1)>" }));
    expect(state.applications.at(-1)?.company).toBe("<img src=x onerror=alert(1)>");
  });
  it("refuses to exceed the session application cap", () => {
    let state = initial;
    for (let count = initial.applications.length; count < limits.applications; count++) state = run(state, addApplication(valid));
    expect(state.applications).toHaveLength(limits.applications);
    expect(failure(addApplication(valid)(state))).toMatch(/at most 200/);
  });
  it("refuses to exceed the bounded history", () => {
    const full = { ...initial, decisions: Array.from({ length: limits.decisions }, (_, index) => ({ id: `d${index}`, application_id: null, field: "status", created_at: "" })) };
    expect(failure(addApplication(valid)(full))).toMatch(/history is full/);
  });
});

describe("updateApplication and excludeApplication", () => {
  it("changes fields, records one decision per changed field and updates the dashboard", () => {
    const target = initial.applications[0];
    const state = run(initial, updateApplication(target.id, { company: "Renamed Co", role: target.role, applied_at: target.applied_at.slice(0, 10), status: "offer" }));
    const saved = state.applications[0];
    expect(saved).toMatchObject({ company: "Renamed Co", status: "offer" });
    expect(saved.updated_at > target.updated_at).toBe(true);
    expect(state.decisions.map((decision) => decision.field)).toEqual(["company", "status"]);
  });
  it("reports no changes without touching state", () => {
    const target = initial.applications[0];
    const result = updateApplication(target.id, { company: target.company, role: target.role, applied_at: target.applied_at.slice(0, 10), status: target.status })(initial);
    expect(result).toEqual({ ok: true, state: initial, notice: "No changes to save." });
  });
  it("rejects unknown, excluded and invalid updates atomically", () => {
    const target = initial.applications[0];
    const fields = { company: "A", role: "B", applied_at: "2026-10-01", status: "offer" };
    expect(failure(updateApplication("missing", fields)(initial))).toMatch(/no longer exists/);
    expect(failure(updateApplication(target.id, { ...fields, applied_at: "bad" })(initial))).toMatch(/valid applied date/);
    expect(failure(updateApplication(target.id, { ...fields, status: "nope" })(initial))).toMatch(/status/);
    expect(failure(updateApplication(target.id, { ...fields, company: "" })(initial))).toMatch(/required/);
    const excluded = run(initial, excludeApplication(target.id));
    expect(failure(updateApplication(target.id, fields)(excluded))).toMatch(/no longer exists/);
    const nearlyFull = { ...initial, decisions: Array.from({ length: limits.decisions }, (_, index) => ({ id: `d${index}`, application_id: null, field: "x", created_at: "" })) };
    expect(failure(updateApplication(target.id, fields)(nearlyFull))).toMatch(/history is full/);
  });
  it("excludes an application from list, analytics, export and its source matches, and cannot be repeated", () => {
    const flaggedApp = initial.matches.find((match) => match.application_id)!.application_id!;
    const state = run(initial, excludeApplication(flaggedApp));
    expect(activeApplications(state)).toHaveLength(35);
    expect(buildDashboard(state).total).toBe(35);
    expect(state.matches.filter((match) => match.application_id === flaggedApp).every((match) => match.state === "excluded")).toBe(true);
    expect(reviewQueue(state).length).toBe(reviewQueue(initial).length - 1);
    expect(failure(excludeApplication(flaggedApp)(state))).toMatch(/no longer exists/);
    expect(failure(excludeApplication("missing")(initial))).toMatch(/no longer exists/);
  });
});

describe("mergeApplication", () => {
  const [source, target] = initial.applications.filter((app) => app.id === "app-003" || app.id === "app-004");
  it("moves evidence, history and review records to the target and excludes the source", () => {
    const state = run(initial, mergeApplication(source.id, target.id, "interview_completed"));
    expect(state.applications.find((app) => app.id === source.id)).toMatchObject({ excluded: true, reconciliation: "excluded" });
    expect(state.applications.find((app) => app.id === target.id)).toMatchObject({ status: "interview_completed", reconciliation: "matched" });
    expect(state.events.filter((event) => event.application_id === source.id)).toEqual([]);
    expect(state.events.filter((event) => event.application_id === target.id).length).toBeGreaterThan(initial.events.filter((event) => event.application_id === target.id).length);
    expect(state.matches.filter((match) => match.application_id === source.id)).toEqual([]);
    expect(state.decisions.filter((decision) => decision.application_id === target.id).map((decision) => decision.field)).toEqual(["merge", "status"]);
    expect(buildDashboard(state).total).toBe(35);
  });
  it("rejects self, missing, excluded targets and bad statuses without partial changes", () => {
    expect(failure(mergeApplication(source.id, source.id, "offer")(initial))).toMatch(/different/);
    expect(failure(mergeApplication(source.id, "missing", "offer")(initial))).toMatch(/different/);
    expect(failure(mergeApplication("missing", target.id, "offer")(initial))).toMatch(/no longer exists/);
    expect(failure(mergeApplication(source.id, target.id, "bogus")(initial))).toMatch(/status/);
    const gone = run(initial, excludeApplication(target.id));
    expect(failure(mergeApplication(source.id, target.id, "offer")(gone))).toMatch(/different/);
    const crowded = { ...initial, decisions: Array.from({ length: limits.decisions }, (_, index) => ({ id: `d${index}`, application_id: null, field: "x", created_at: "" })) };
    expect(failure(mergeApplication(source.id, target.id, "offer")(crowded))).toMatch(/history is full/);
  });
});

describe("review decisions", () => {
  const email = initial.matches.find((match) => match.source === "email" && match.application_id === null)!;
  const sheet = initial.matches.find((match) => match.source === "sheet" && match.application_id === null)!;
  const linkedEmail = initial.matches.find((match) => match.source === "email" && match.application_id !== null)!;
  it("links an email record to an application with a dated verified event", () => {
    const state = run(initial, resolveReview("email", email.source_id, "app-001", "interview_scheduled"));
    expect(state.matches.find((match) => match.id === email.id)).toMatchObject({ state: "matched", application_id: "app-001" });
    expect(state.events.at(-1)).toMatchObject({ type: "interview_scheduled", date_known: true, method: "manual", application_id: "app-001" });
    expect(state.applications[0]).toMatchObject({ status: "interview_scheduled", reconciliation: "matched" });
    expect(reviewQueue(state)).toHaveLength(reviewQueue(initial).length - 1);
    expect(buildDashboard(state).metrics.interviews).toBe(buildDashboard(initial).metrics.interviews + 1);
  });
  it("records tracker rows as observed events with unknown dates", () => {
    const state = run(initial, resolveReview("sheet", sheet.source_id, "app-002", "screening"));
    expect(state.events.at(-1)).toMatchObject({ date_known: false, source: "sheet" });
  });
  it("supersedes the review-required event for a linked record and counts the verified event once", () => {
    const state = run(initial, resolveReview("email", linkedEmail.source_id, linkedEmail.application_id!, "rejection"));
    const forSource = state.events.filter((event) => event.source_id === linkedEmail.source_id);
    expect(forSource.filter((event) => event.superseded)).toHaveLength(1);
    expect(countableEvents(state).filter((event) => event.source_id === linkedEmail.source_id)).toHaveLength(1);
  });
  it("reuses the existing event when the same type is chosen again", () => {
    const state = run(initial, resolveReview("email", linkedEmail.source_id, linkedEmail.application_id!, "screening"));
    expect(state.events.filter((event) => event.source_id === linkedEmail.source_id)).toHaveLength(1);
    expect(state.events.find((event) => event.source_id === linkedEmail.source_id)).toMatchObject({ method: "manual", superseded: false });
  });
  it("excludes a source so its evidence no longer counts", () => {
    const state = run(initial, excludeReview("email", linkedEmail.source_id));
    expect(state.matches.find((match) => match.id === linkedEmail.id)?.state).toBe("excluded");
    expect(reviewQueue(state)).toHaveLength(reviewQueue(initial).length - 1);
    expect(state.decisions.at(-1)?.field).toBe("source_exclusion");
  });
  it("rejects stale, duplicate and invalid decisions without changing anything", () => {
    const resolved = run(initial, resolveReview("email", email.source_id, "app-001", "screening"));
    expect(failure(resolveReview("email", email.source_id, "app-001", "screening")(resolved))).toMatch(/no longer waiting/);
    expect(failure(excludeReview("email", email.source_id)(resolved))).toMatch(/no longer waiting/);
    expect(failure(resolveReview("email", "missing", "app-001", "screening")(initial))).toMatch(/no longer waiting/);
    expect(failure(resolveReview("sheet", email.source_id, "app-001", "screening")(initial))).toMatch(/no longer waiting/);
    expect(failure(resolveReview("email", email.source_id, "missing", "screening")(initial))).toMatch(/active application/);
    expect(failure(resolveReview("email", email.source_id, "app-001", "bogus")(initial))).toMatch(/verified event/);
    const gone = run(initial, excludeApplication("app-001"));
    expect(failure(resolveReview("email", email.source_id, "app-001", "screening")(gone))).toMatch(/active application/);
    const crowded = { ...initial, events: Array.from({ length: limits.events }, (_, index) => ({ ...initial.events[0], id: `e${index}` })) };
    expect(failure(resolveReview("email", email.source_id, "app-001", "screening")(crowded))).toMatch(/history is full/);
    expect(failure(excludeReview("email", email.source_id)({ ...initial, decisions: crowded.events.map((event) => ({ id: event.id, application_id: null, field: "x", created_at: "" })) }))).toMatch(/history is full/);
  });
});

describe("simulated sources", () => {
  it("imports one fixed batch per sync, never duplicates, and records sync history", () => {
    let state = initial;
    const counts: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) { state = run(state, runGmailSync()); counts.push(state.applications.length); }
    expect(counts).toEqual([38, 40, 42, 42, 42]);
    expect(new Set(state.applications.map((app) => app.id)).size).toBe(state.applications.length);
    expect(new Set(state.events.map((event) => event.id)).size).toBe(state.events.length);
    expect(state.runs).toHaveLength(9);
    expect(state.runs[0]).toMatchObject({ status: "completed", trigger: "manual" });
    expect(state.matches.length).toBe(initial.matches.length + 3);
  });
  it("keeps run history bounded", () => {
    let state = initial;
    for (let attempt = 0; attempt < 30; attempt++) state = run(state, runGmailSync());
    expect(state.runs).toHaveLength(limits.runs);
  });
  it("stays within the application cap while importing", () => {
    const base = { ...initial, applications: Array.from({ length: limits.applications - 1 }, (_, index) => ({ ...initial.applications[0], id: `fill-${index}` })) };
    const state = run(base, runGmailSync());
    expect(state.applications).toHaveLength(limits.applications);
  });
  it("refuses to import when the event history is full", () => {
    const full = { ...initial, events: Array.from({ length: limits.events }, (_, index) => ({ ...initial.events[0], id: `e${index}` })) };
    expect(failure(runGmailSync()(full))).toMatch(/history is full/);
  });
  it("requires a connected, unpaused mailbox", () => {
    const deleted = run(initial, deleteAllData(DELETE_PHRASE));
    expect(failure(runGmailSync()(deleted))).toMatch(/Connect Gmail/);
    expect(failure(resumeGmail()(deleted))).toMatch(/Connect Gmail/);
    const connected = run(deleted, connectGmail());
    expect(failure(runGmailSync()(connected))).toMatch(/paused/);
    expect(failure(connectGmail()(connected))).toMatch(/already connected/);
    const resumed = run(connected, resumeGmail());
    expect(resumed.gmail.paused).toBe(false);
    expect(resumed.applications.length).toBe(2);
    expect(resumed.importedBatches).toEqual(["batch-1"]);
  });
  it("toggles the tracker and rejects redundant changes", () => {
    const paused = run(initial, setTracker(false));
    expect(paused.tracker).toBe(false);
    expect(failure(setTracker(false)(paused))).toMatch(/already paused/);
    expect(failure(setTracker(true)(initial))).toMatch(/already connected/);
    expect(run(paused, setTracker(true)).tracker).toBe(true);
  });
  it("applies a reprocess request on the next sync only", () => {
    const queued = run(initial, queueReprocess());
    expect(queued.reprocessPending).toBe(true);
    const result = runGmailSync()(queued);
    expect(result.ok && result.notice).toMatch(/reprocessed/);
    expect(result.ok && result.state.reprocessPending).toBe(false);
    const drained = run(run(run(run(queued, runGmailSync()), runGmailSync()), runGmailSync()), queueReprocess());
    const empty = runGmailSync()(drained);
    expect(empty.ok && empty.notice).toMatch(/No new sample messages.*reprocessed/);
  });
});

describe("deleteAllData", () => {
  it("requires the exact phrase and changes nothing otherwise", () => {
    expect(failure(deleteAllData("delete all job data")(initial))).toMatch(/exactly/);
    expect(failure(deleteAllData("")(initial))).toMatch(/exactly/);
  });
  it("clears applications, evidence, reviews and connections and pauses imports", () => {
    const state = run(initial, deleteAllData(DELETE_PHRASE));
    expect(state).toMatchObject({ applications: [], events: [], matches: [], decisions: [], runs: [], importedBatches: [], gmail: { connected: false, paused: true }, tracker: false });
    const dashboard = buildDashboard(state);
    expect(dashboard.total).toBe(0);
    expect(dashboard.lastSuccessfulSyncAt).toBeNull();
  });
});

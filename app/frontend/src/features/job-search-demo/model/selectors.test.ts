import { describe, expect, it } from "vitest";
import { DEMO_NOW } from "./clock";
import { createInitialState } from "./fixtures";
import { readUrlView, toListQuery, emptyTextFilters } from "./filters";
import { applicationsCsv, buildDashboard, queryApplications, weeklyCounts } from "./selectors";
import { limits, type ApplicationEvent, type ApplicationRecord, type DemoState } from "./types";

const filters = { ...emptyTextFilters, status: "", source: "", reconciliation: "" };
const baseQuery = { filters, sort: "applied_desc", page: 0, pageSize: 25 } as const;
function application(overrides: Partial<ApplicationRecord>): ApplicationRecord {
  return { id: "a", company: "Acme", role: "Analyst", requisition_id: null, applied_at: "2026-10-01T00:00:00.000Z", status: "application_submitted", source: "manual", reconciliation: "matched", excluded: false, updated_at: "2026-10-01T00:00:00.000Z", ...overrides };
}
function event(overrides: Partial<ApplicationEvent>): ApplicationEvent {
  return { id: "e", application_id: "a", type: "screening", occurred_at: "2026-10-03T00:00:00.000Z", source: "email", source_id: "m1", date_known: true, superseded: false, method: "classified", subject: null, ...overrides };
}
const withData = (applications: ApplicationRecord[], events: ApplicationEvent[], matches: DemoState["matches"] = []): DemoState => ({ ...createInitialState(), applications, events, matches });

describe("seed data", () => {
  it("provides at least 30 fictional applications with a mix of outcomes and a review queue", () => {
    const state = createInitialState();
    expect(state.applications.length).toBeGreaterThanOrEqual(30);
    expect(new Set(state.applications.map((item) => item.id)).size).toBe(state.applications.length);
    expect(state.matches.filter((match) => match.state !== "matched").length).toBeGreaterThanOrEqual(8);
    expect(state.applications.every((item) => item.applied_at <= new Date(DEMO_NOW).toISOString())).toBe(true);
  });
  it("is deterministic", () => { expect(createInitialState()).toEqual(createInitialState()); });
});

describe("dashboard analytics", () => {
  it("derives outcome counts from the seeded data", () => {
    const dashboard = buildDashboard(createInitialState());
    expect(dashboard.total).toBe(36);
    expect(dashboard.metrics.responses).toBeGreaterThan(5);
    expect(dashboard.metrics.responsesRate).toBeCloseTo(dashboard.metrics.responses / 36);
    expect(dashboard.weekly).toHaveLength(26);
    expect(dashboard.medianFirstResponseDays).not.toBeNull();
    expect(Object.values(dashboard.groups.status).reduce((sum, count) => sum + count, 0)).toBe(36);
    expect(dashboard.lastSuccessfulSyncAt).not.toBeNull();
  });
  it("handles zero applications without dividing by zero", () => {
    const dashboard = buildDashboard(withData([], []));
    expect(dashboard.metrics.responsesRate).toBe(0);
    expect(dashboard.medianFirstResponseDays).toBeNull();
    expect(dashboard.followUps).toEqual([]);
  });
  it("does not let review-only, superseded or excluded-source evidence inflate outcomes", () => {
    const apps = [application({})];
    const counted = buildDashboard(withData(apps, [event({})]));
    expect(counted.metrics.responses).toBe(1);
    expect(buildDashboard(withData(apps, [event({ method: "review_required" })])).metrics.responses).toBe(0);
    expect(buildDashboard(withData(apps, [event({ superseded: true })])).metrics.responses).toBe(0);
    const excluded = [{ id: "m", source: "email" as const, source_id: "m1", application_id: "a", state: "excluded" as const, reason: "", title: "", available: true, occurred_at: null }];
    expect(buildDashboard(withData(apps, [event({})], excluded)).metrics.responses).toBe(0);
  });
  it("excludes excluded applications everywhere", () => {
    const dashboard = buildDashboard(withData([application({}), application({ id: "b", excluded: true })], [event({ application_id: "b" })]));
    expect(dashboard.total).toBe(1);
    expect(dashboard.metrics.responses).toBe(0);
  });
  it("keeps responses with unknown dates out of the response-time median", () => {
    const dashboard = buildDashboard(withData([application({})], [event({ date_known: false })]));
    expect(dashboard.metrics.responses).toBe(1);
    expect(dashboard.medianFirstResponseDays).toBeNull();
  });
  it("flags follow-ups only for open applications with no response after seven days", () => {
    const apps = [application({ id: "old" }), application({ id: "recent", applied_at: "2026-10-12T00:00:00.000Z" }), application({ id: "closed", status: "rejection" }), application({ id: "answered" })];
    const dashboard = buildDashboard(withData(apps, [event({ application_id: "answered" })]));
    expect(dashboard.followUps.map((item) => item.application_id)).toEqual(["old"]);
  });
  it("buckets weeks starting Monday and ignores applications older than 26 weeks", () => {
    const weeks = weeklyCounts([application({ applied_at: "2026-10-12T05:00:00.000Z" }), application({ applied_at: "2025-01-01T00:00:00.000Z" })], DEMO_NOW);
    expect(weeks.at(-1)).toEqual({ weekStart: "2026-10-12", count: 1 });
    expect(weeks.reduce((sum, week) => sum + week.count, 0)).toBe(1);
  });
  it("keeps prototype-like names as ordinary data", () => {
    const dashboard = buildDashboard(withData([application({ company: "__proto__" })], []));
    expect(Object.keys(dashboard.outcomes.company)).toEqual(["__proto__"]);
  });
});

describe("application list queries", () => {
  const state = createInitialState();
  it("searches company and role case-insensitively", () => {
    const result = queryApplications(state.applications, { ...baseQuery, filters: { ...filters, q: "ALDERBROOK" } });
    expect(result.total).toBe(2);
    expect(queryApplications(state.applications, { ...baseQuery, filters: { ...filters, q: "analytics engineer" } }).total).toBeGreaterThan(0);
  });
  it("combines status, source, reconciliation and date filters", () => {
    expect(queryApplications(state.applications, { ...baseQuery, filters: { ...filters, status: "rejection" } }).applications.every((item) => item.status === "rejection")).toBe(true);
    expect(queryApplications(state.applications, { ...baseQuery, filters: { ...filters, source: "manual" } }).applications.every((item) => item.source === "manual")).toBe(true);
    expect(queryApplications(state.applications, { ...baseQuery, filters: { ...filters, reconciliation: "conflict" } }).total).toBe(2);
    const recent = queryApplications(state.applications, { ...baseQuery, filters: { ...filters, from: "2026-10-01", to: "2026-10-15" } });
    expect(recent.applications.every((item) => item.applied_at >= "2026-10-01" && item.applied_at <= "2026-10-15T23:59:59.999Z")).toBe(true);
    expect(recent.total).toBeGreaterThan(0);
  });
  it("sorts by each supported key", () => {
    const dates = queryApplications(state.applications, { ...baseQuery, pageSize: 50 }).applications.map((item) => item.applied_at);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(queryApplications(state.applications, { ...baseQuery, sort: "applied_asc", pageSize: 50 }).applications[0].applied_at).toBe(dates.at(-1));
    const companies = queryApplications(state.applications, { ...baseQuery, sort: "company", pageSize: 50 }).applications.map((item) => item.company.toLowerCase());
    expect(companies).toEqual([...companies].sort());
    expect(queryApplications(state.applications, { ...baseQuery, sort: "status", pageSize: 50 }).total).toBe(36);
    expect(queryApplications(state.applications, { ...baseQuery, sort: "updated", pageSize: 50 }).applications[0].updated_at).toBe(
      [...state.applications].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0].updated_at);
  });
  it("paginates and clamps pages beyond the end", () => {
    const first = queryApplications(state.applications, baseQuery);
    const second = queryApplications(state.applications, { ...baseQuery, page: 1 });
    expect(first.applications).toHaveLength(25);
    expect(second.applications).toHaveLength(11);
    expect(first.applications.some((item) => second.applications.includes(item))).toBe(false);
    expect(queryApplications(state.applications, { ...baseQuery, page: 99 }).page).toBe(1);
    expect(queryApplications(state.applications, { ...baseQuery, page: -4 }).page).toBe(0);
    expect(queryApplications(state.applications, { ...baseQuery, pageSize: 50 }).applications).toHaveLength(36);
  });
  it("matches exact company and role selections and skips excluded applications", () => {
    const apps = [application({}), application({ id: "b", company: "Other" }), application({ id: "c", excluded: true })];
    expect(queryApplications(apps, { ...baseQuery, filters: { ...filters, company: "Acme" } }).total).toBe(1);
    expect(queryApplications(apps, { ...baseQuery, filters: { ...filters, role: "Nope" } }).total).toBe(0);
    expect(queryApplications(apps, baseQuery).total).toBe(2);
  });
});

describe("URL view parsing", () => {
  it("accepts only bounded enumerated values and safe IDs", () => {
    const view = readUrlView(new URLSearchParams("status=offer&source=sheet&reconciliation=conflict&range=30&sort=company&page=3&pageSize=50&app=app-001"));
    expect(view).toMatchObject({ status: "offer", source: "sheet", reconciliation: "conflict", range: "30", sort: "company", page: 3, pageSize: 50, appId: "app-001" });
    const hostile = readUrlView(new URLSearchParams("status=%3Cscript%3E&source=x&reconciliation=y&range=1&sort=drop&page=9999999&pageSize=7&app=../../etc/passwd"));
    expect(hostile).toMatchObject({ status: "", source: "", reconciliation: "", range: "", sort: "applied_desc", page: 1000, pageSize: 25, appId: "" });
    expect(readUrlView(new URLSearchParams("page=abc")).page).toBe(0);
    expect(readUrlView(new URLSearchParams(`app=${"a".repeat(101)}`)).appId).toBe("");
  });
  it("turns presets into dates relative to the demo clock and truncates search text", () => {
    const view = readUrlView(new URLSearchParams("range=7"));
    expect(toListQuery(view, emptyTextFilters, false).filters.from).toBe("2026-10-08");
    expect(toListQuery(view, { ...emptyTextFilters, from: "2026-01-01", to: "2026-02-01" }, true).filters).toMatchObject({ from: "2026-01-01", to: "2026-02-01" });
    expect(toListQuery(view, { ...emptyTextFilters, q: "x".repeat(500) }, false).filters.q).toHaveLength(200);
  });
});

describe("CSV export", () => {
  it("lists active applications with quoting for commas, quotes and newlines", () => {
    const csv = applicationsCsv([application({ company: 'Acme, "Inc"', role: "Line1\nLine2" }), application({ id: "x", excluded: true })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"ID","Company","Role","Requisition","Applied","Status","Reconciliation"');
    expect(csv).toContain('"Acme, ""Inc"""');
    expect(csv).toContain('"Line1\nLine2"');
    expect(csv).not.toContain('"x"');
  });
  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "  =1+1", "\t=1", "\r=1", "\u0000=1", " \u0007@x", "\n+x"])("neutralises formula-like value %j", (value) => {
    expect(applicationsCsv([application({ company: value })]).split("\r\n")[1]).toContain(`"'${value}"`);
  });
  it("leaves ordinary text and blank requisitions alone", () => {
    const row = applicationsCsv([application({ company: "Plain Co" })]).split("\r\n")[1];
    expect(row).toContain('"Plain Co"');
    expect(row).toContain('""');
  });
});

describe("performance at the session cap", () => {
  it("builds the dashboard and lists a full page well inside the 50 ms budget", () => {
    const base = createInitialState();
    const applications = Array.from({ length: limits.applications }, (_, index) => application({ id: `cap-${index}`, company: `Company ${index % 40}`, role: `Role ${index % 12}`, applied_at: new Date(DEMO_NOW - index * 86_400_000).toISOString() }));
    const events = Array.from({ length: limits.events }, (_, index) => event({ id: `evt-${index}`, application_id: `cap-${index % limits.applications}`, source_id: `src-${index}`, occurred_at: new Date(DEMO_NOW - index * 3_600_000).toISOString() }));
    const state = { ...base, applications, events };
    const samples = Array.from({ length: 7 }, () => { const start = performance.now(); buildDashboard(state); queryApplications(state.applications, { ...baseQuery, filters: { ...filters, q: "company 1" } }); return performance.now() - start; }).sort((a, b) => a - b);
    expect(samples[3]).toBeLessThan(50);
  });
});

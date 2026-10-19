import { daysBefore } from "./clock";
import { applicationSorts, isEventType, reconciliationOptions, sourceOptions, type ApplicationSort, type EventType } from "./types";
import type { ListFilters, ListQuery } from "./selectors";

// Only bounded, enumerated values and synthetic IDs may appear in the URL. Free text (search, company, role) lives in memory
// (see TextFilters) so nothing a visitor types is written to the address bar or browser history.
export const pageSizes = [25, 50] as const;
export const datePresets = [{ value: "any", label: "Any time" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "custom", label: "Custom range" }] as const;
export type DatePreset = typeof datePresets[number]["value"];
export const defaultSort: ApplicationSort = "applied_desc";
export const sortLabels: Record<ApplicationSort, { option: string; summary: string }> = {
  applied_desc: { option: "Applied (newest)", summary: "applied date (newest)" },
  applied_asc: { option: "Applied (oldest)", summary: "applied date (oldest)" },
  company: { option: "Company (A to Z)", summary: "company (A to Z)" },
  status: { option: "Status", summary: "status" },
  updated: { option: "Recently updated", summary: "most recently updated" },
};
const MAX_PAGE = 1000;
const ID_PATTERN = /^[a-zA-Z0-9-]{1,100}$/;

/** Free-text and custom-range filters, held in memory only. */
export interface TextFilters { q: string; company: string; role: string; from: string; to: string }
export const emptyTextFilters: TextFilters = { q: "", company: "", role: "", from: "", to: "" };

export interface UrlView { status: EventType | ""; source: string; reconciliation: string; range: Exclude<DatePreset, "custom" | "any"> | ""; sort: ApplicationSort; page: number; pageSize: 25 | 50; appId: string }
export function readUrlView(params: URLSearchParams): UrlView {
  const status = params.get("status") ?? ""; const source = params.get("source") ?? ""; const reconciliation = params.get("reconciliation") ?? ""; const range = params.get("range") ?? "";
  const rawPage = Math.floor(Number(params.get("page")));
  const appId = params.get("app") ?? "";
  return {
    status: isEventType(status) ? status : "", source: sourceOptions.find((option) => option === source) ?? "", reconciliation: reconciliationOptions.find((option) => option === reconciliation) ?? "",
    range: range === "7" || range === "30" || range === "90" ? range : "", sort: applicationSorts.find((sort) => sort === params.get("sort")) ?? defaultSort,
    page: Number.isFinite(rawPage) ? Math.max(0, Math.min(MAX_PAGE, rawPage)) : 0, pageSize: params.get("pageSize") === "50" ? 50 : 25,
    appId: ID_PATTERN.test(appId) ? appId : "",
  };
}

export function toListQuery(view: UrlView, text: TextFilters, customRange: boolean): ListQuery {
  const filters: ListFilters = {
    q: text.q.slice(0, 200), company: text.company, role: text.role, status: view.status, source: view.source, reconciliation: view.reconciliation,
    from: customRange ? text.from : view.range ? daysBefore(Number(view.range)) : "", to: customRange ? text.to : "",
  };
  return { filters, sort: view.sort, page: view.page, pageSize: view.pageSize };
}

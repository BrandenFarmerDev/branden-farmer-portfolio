import { daysBefore } from "./clock";

// All dates are shown in UTC so the synthetic timeline reads the same in every time zone.
const dateTime = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

export const formatDate = (iso: string): string => iso.slice(0, 10);
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : dateTime.format(time);
}
export const freshnessText = (iso: string | null | undefined): string => iso ? `Last successful sync: ${formatDateTime(iso)}` : "No successful sync yet";
export function formatMonth(month: string): string {
  const time = Date.parse(`${month}-01T00:00:00Z`);
  return Number.isNaN(time) ? month : new Date(time).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
export const percent = (value: number): string => `${Math.round(value * 100)}%`;
export const oneDecimal = (value: number): number => Math.round(value * 10) / 10;
export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;
export function formatDuration(startIso: string, endIso: string): string {
  const seconds = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  return seconds < 1 ? "under 1 s" : seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
export { daysBefore as daysAgo };

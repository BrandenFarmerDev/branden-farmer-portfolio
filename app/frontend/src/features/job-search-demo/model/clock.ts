const MINUTE = 60_000;
export const DAY = 86_400_000;
/** The demo's fixed "today". Fixture dates, presets and follow-ups all derive from it so the demo never ages. */
export const DEMO_NOW = Date.parse("2026-10-15T17:00:00.000Z");
export const demoToday = new Date(DEMO_NOW).toISOString().slice(0, 10);
/** Accepted actions advance the synthetic clock one minute each. */
export const stampAt = (tick: number): string => new Date(DEMO_NOW + tick * MINUTE).toISOString();
export const daysBefore = (days: number): string => new Date(DEMO_NOW - days * DAY).toISOString().slice(0, 10);

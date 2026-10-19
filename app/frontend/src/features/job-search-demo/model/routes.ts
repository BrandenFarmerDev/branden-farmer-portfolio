export const DEMO_BASE = "/projects/job-search-intelligence";
export const demoPath = (section = ""): string => section ? `${DEMO_BASE}/${section}` : DEMO_BASE;

// Shared with the Worker's knowledge corpus so evidence links land on the exact passage.
export const ROLE_HIGHLIGHT_CHUNK = 4;
export const ABOUT_OVERVIEW_ID = "about-overview";
export const WORKING_PRINCIPLES_ID = "working-principles";

export function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export const anchorId = {
  role: (title: string, chunkIndex: number) => `role-${slug(title)}-${chunkIndex + 1}`,
  skill: (title: string) => `skills-${slug(title)}`,
  resumeProject: (title: string) => `resume-project-${slug(title)}`,
  area: (title: string) => `area-${slug(title)}`,
  career: (title: string) => `career-${slug(title)}`,
};

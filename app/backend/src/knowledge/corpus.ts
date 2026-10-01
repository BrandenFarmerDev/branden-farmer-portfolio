import {
  ABOUT_OVERVIEW_ID, anchorId, chunk, ROLE_HIGHLIGHT_CHUNK, WORKING_PRINCIPLES_ID,
} from "../../../frontend/src/content/anchors.ts";
import { projects } from "../../../frontend/src/content/projects.ts";
import { resumeContent } from "../../../frontend/src/content/resume.ts";
import { careerMilestones, experienceAreas, siteContent, workingPrinciples } from "../../../frontend/src/content/site.ts";

export const KNOWLEDGE_REVIEWED_ON = "2026-09-29";

export interface KnowledgePassage {
  id: string;
  title: string;
  body: string;
  tags: string;
  url: string;
}

export function buildKnowledgePassages(): KnowledgePassage[] {
  const resume = "/resume";
  const passages: KnowledgePassage[] = [{
    id: "resume-summary",
    title: "Professional summary",
    body: `${resumeContent.headline}. ${resumeContent.summary} Based in ${resumeContent.location}.`,
    tags: "summary experience background",
    url: `${resume}#resume-summary-heading`,
  }];

  for (const employer of resumeContent.experience) {
    for (const role of employer.roles) {
      chunk(role.highlights, ROLE_HIGHLIGHT_CHUNK).forEach((highlights, index) => {
        const id = anchorId.role(role.title, index);
        passages.push({
          id,
          title: `${role.title}, ${employer.name} (${role.dates})`,
          body: `${role.title} at ${employer.name}, ${employer.location}, ${role.dates}. ${highlights.join(" ")}`,
          tags: "experience role employment",
          url: `${resume}#${id}`,
        });
      });
    }
  }

  for (const group of resumeContent.skillGroups) {
    const id = anchorId.skill(group.title);
    passages.push({
      id,
      title: `Technical skills: ${group.title}`,
      body: `${group.title}: ${group.skills}.`,
      tags: "skills tools technologies",
      url: `${resume}#${id}`,
    });
  }

  for (const project of resumeContent.selectedProjects) {
    const id = anchorId.resumeProject(project.title);
    passages.push({
      id,
      title: `Selected technical project: ${project.title}`,
      body: `${project.title}. ${project.description}`,
      tags: "project applied work",
      url: `${resume}#${id}`,
    });
  }

  const details = [
    ["education", "Education", resumeContent.education, "education degree school"],
    ["training", "Training and certifications", resumeContent.training, "training certification"],
  ] as const;
  for (const [id, title, items, tags] of details) {
    passages.push({
      id,
      title,
      body: items.map((item) => [item.title, item.organization, item.date, "note" in item ? item.note : undefined]
        .filter(Boolean).join(", ")).join(". ") + ".",
      tags,
      url: `${resume}#resume-${id}-heading`,
    });
  }

  passages.push({
    id: "recognition",
    title: "Awards and recognition",
    body: resumeContent.recognition.join(" "),
    tags: "awards recognition",
    url: `${resume}#resume-recognition-heading`,
  }, {
    id: ABOUT_OVERVIEW_ID,
    title: "Background and current direction",
    body: `${siteContent.statement} ${siteContent.introduction} ${siteContent.perspective} ${siteContent.availability}`,
    tags: "about overview roles availability",
    url: `/about#${ABOUT_OVERVIEW_ID}`,
  }, {
    id: WORKING_PRINCIPLES_ID,
    title: "Working principles",
    body: workingPrinciples.join(" "),
    tags: "principles approach values",
    url: `/about#${WORKING_PRINCIPLES_ID}`,
  });

  for (const area of experienceAreas) {
    const id = anchorId.area(area.title);
    passages.push({
      id,
      title: `Experience area: ${area.title}`,
      body: `${area.description} ${area.evidence.join(" ")}`,
      tags: "experience area",
      url: `/about#${id}`,
    });
  }

  for (const milestone of careerMilestones) {
    const id = anchorId.career(milestone.title);
    passages.push({
      id,
      title: `Career progression: ${milestone.title} (${milestone.period})`,
      body: `${milestone.period}: ${milestone.roles}. ${milestone.description}`,
      tags: "career progression history",
      url: `/about#${id}`,
    });
  }

  for (const project of projects) {
    passages.push({
      id: `project-${project.id}`,
      title: `Portfolio project: ${project.title}`,
      body: `${project.title} is a portfolio project with status "${project.status}"; it is not a finished product. `
        + `${project.description} Problem: ${project.problem} Role: ${project.role}. `
        + `Planned technologies: ${project.technologies.join(", ")}.`,
      tags: `project prototype portfolio ${project.category.toLowerCase()}`,
      url: `/work#${project.id}`,
    });
  }

  return passages;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildKnowledgeSql(passages: KnowledgePassage[], version: string, publishedAt: string): string {
  const v = sqlText(version);
  const statements = [
    `INSERT OR IGNORE INTO knowledge_versions (version, active, published_at) VALUES (${v}, 0, ${sqlText(publishedAt)});`,
    ...passages.map((passage) => `INSERT INTO knowledge_passages
  (passage_id, title, body, tags, url, status, last_reviewed, content_version)
  VALUES (${[passage.id, passage.title, passage.body, passage.tags, passage.url].map(sqlText).join(", ")},
  'published', ${sqlText(KNOWLEDGE_REVIEWED_ON)}, ${v})
  ON CONFLICT (content_version, passage_id) DO UPDATE SET title = excluded.title, body = excluded.body,
  tags = excluded.tags, url = excluded.url, last_reviewed = excluded.last_reviewed;`),
    `UPDATE knowledge_versions SET active = 0 WHERE version <> ${v} AND active = 1;`,
    `UPDATE knowledge_versions SET active = 1 WHERE version = ${v};`,
    `DELETE FROM knowledge_passages WHERE content_version <> ${v};`,
    `DELETE FROM knowledge_versions WHERE version <> ${v};`,
  ];
  return `${statements.join("\n")}\n`;
}

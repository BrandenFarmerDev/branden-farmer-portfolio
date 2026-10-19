import type { ProjectSummary } from "@portfolio/shared";

/** Projects with a dedicated page; the label names what the visitor will find there. */
export const projectLinks: Record<string, { path: string; label: string }> = {
  "grid-operations": { path: "/projects/grid-operations", label: "Read case study" },
  "job-search-intelligence": { path: "/projects/job-search-intelligence", label: "Try the interactive demo" },
};

export const projects: ProjectSummary[] = [
  {
    id: "job-search-intelligence",
    title: "Job Search Intelligence",
    category: "Application",
    description:
      "A private-first application that turns application confirmations and recruiter conversations into a reviewable job-search timeline.",
    problem:
      "Important application events are scattered across a mailbox, making follow-up and outcome analysis difficult without careful evidence linking.",
    role: "Product design, data model, workflow design, and full-stack implementation",
    status: "Interactive demo · synthetic data",
    technologies: ["React", "TypeScript", "Gmail API", "Cloudflare Workers", "D1"],
    accent: "teal",
  },
  {
    id: "municipal-capital-project-tracker",
    title: "Municipal Capital Project Tracker",
    category: "Operations",
    description:
      "A synthetic-data prototype for tracking public capital projects from request through construction and closeout.",
    problem:
      "Project status, budget changes, decisions, and public updates need a shared history without exposing internal notes.",
    role: "Product design, information architecture, workflow design, and full-stack implementation",
    status: "Prototype - in development",
    technologies: ["React", "TypeScript", "Cloudflare Workers", "D1", "SVG data views"],
    accent: "coral",
  },
  {
    id: "operational-review-workspace",
    title: "Operational Review Workspace",
    category: "Analytics",
    description:
      "A monthly operating review workflow connecting KPI context, decisions, owners, and action history.",
    problem:
      "Spreadsheet and slide compilation can separate performance numbers from the commentary and commitments needed to act on them.",
    role: "Product design, KPI model, interaction design, and full-stack implementation",
    status: "Prototype - in development",
    technologies: ["React", "TypeScript", "Cloudflare Workers", "D1", "Lightweight charts"],
    accent: "gold",
  },
  {
    id: "grid-operations",
    title: "Grid Operations Command Center",
    category: "Operations",
    description:
      "A fictional utility operations case study that connects outage, crew, weather, and hourly impact data for investigation and reliability review.",
    problem:
      "Operations leaders need a consistent view of active outage impact and restoration work while keeping current-impact measures separate from hourly history.",
    role: "Business analysis, KPI definition, data modeling, SQL validation, and portfolio presentation",
    status: "Case study · synthetic model",
    technologies: ["SQL Server", "Power BI", "Synthetic data"],
    accent: "teal",
  },
];

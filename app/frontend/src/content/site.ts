export interface EditableLink {
  label: string;
  href: string;
  placeholder: string;
}

const bookingCalLink = "branden-farmer-live.com-vhpkbs/recruiter-conversation";

export const siteContent = {
  name: "Branden Farmer",
  shortName: "BF",
  statement: "I turn complex operations and data into software people can use.",
  introduction:
    "My background spans manufacturing and operations, production planning, business intelligence, data engineering, automation, and application development.",
  perspective:
    "I build with both the technical system and the people doing the work in view: how information moves, where decisions stall, and what makes a tool dependable in practice.",
  availability: "Exploring application development, data and BI, operations analysis, and automation roles.",
  links: {
    github: {
      label: "GitHub",
      href: "https://github.com/BrandenFarmerDev",
      placeholder: "GitHub profile unavailable",
    },
    portfolioRepository: {
      label: "Portfolio source",
      href: "https://github.com/BrandenFarmerDev/branden-farmer-portfolio",
      placeholder: "Portfolio repository unavailable",
    },
    linkedin: {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/branden-farmer-a3a35a28b/",
      placeholder: "LinkedIn profile unavailable",
    },
    email: {
      label: "Email",
      href: "mailto:branden_farmer@live.com",
      placeholder: "Email address unavailable",
    },
    resume: {
      label: "Résumé PDF",
      href: "/Branden_Farmer_Resume.pdf",
      placeholder: "Résumé PDF unavailable",
    },
    booking: {
      label: "Book an interview",
      href: `https://cal.com/${bookingCalLink}`,
      placeholder: "Interview booking unavailable",
    },
  } satisfies Record<string, EditableLink>,
} as const;

export const bookingContent = {
  namespace: "recruiter-conversation",
  calLink: bookingCalLink,
  title: "Recruiter conversation",
  description:
    "Choose an available time for a focused conversation about experience, projects, and role alignment.",
} as const;

export const experienceAreas = [
  {
    title: "Operations and planning",
    description:
      "Understanding production environments, planning constraints, handoffs, and the operating rhythms behind the numbers.",
    evidence: [
      "Progressed from production roles into planning and planning leadership.",
      "Worked directly with schedules, material constraints, capacity, delivery, and operating KPIs.",
    ],
  },
  {
    title: "Business intelligence and data",
    description:
      "Organizing source data into useful reporting, clear definitions, and decision-ready views.",
    evidence: [
      "Built reporting and data workflows with Power BI, SQL, Python, and enterprise data platforms.",
      "Connected operational definitions, source data, quality controls, and decision context.",
    ],
  },
  {
    title: "Automation and applications",
    description:
      "Turning repeated workflows into maintainable tools with deliberate interfaces and traceable behavior.",
    evidence: [
      "Developed applications and automations across TypeScript, React, Power Platform, SharePoint, and Python.",
      "Designed for governed workflows, exception handling, traceability, and human review.",
    ],
  },
] as const;

export const careerMilestones = [
  {
    period: "2014–2018",
    title: "Manufacturing foundation",
    roles: "Assembly and production technician roles",
    description:
      "Built an operations-first understanding of quality, production flow, material tracking, and the reporting gaps experienced by frontline teams.",
  },
  {
    period: "2018–2022",
    title: "Planning and team leadership",
    roles: "Lead technician, production planner, and planning supervisor",
    description:
      "Moved from executing the work to coordinating schedules, capacity, materials, performance measures, and the people responsible for delivery.",
  },
  {
    period: "2022–Present",
    title: "Business intelligence and application development",
    roles: "Business Intelligence Developer III",
    description:
      "Builds analytics, data integrations, automations, and operational applications that connect governed technical systems to practical decisions.",
  },
] as const;

export const githubContent = {
  username: "BrandenFarmerDev",
  title: "Public code, with context",
  description:
    "The portfolio repository is public so reviewers can inspect the application structure, accessibility work, Worker API, validation, and deployment configuration.",
  availability:
    "The three planned application repositories will be linked only when their synthetic-data demos are ready for review.",
} as const;

export const workingPrinciples = [
  "Start with the decision or workflow the software needs to support.",
  "Make definitions, system boundaries, and data provenance visible.",
  "Prefer useful, maintainable releases over speculative complexity.",
  "Treat corrections, exceptions, and human review as product features.",
] as const;

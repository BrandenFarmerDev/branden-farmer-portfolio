export interface HealthResponse {
  status: "ok";
  service: "portfolio-api";
  timestamp: string;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  fieldErrors?: ContactFieldErrors;
}

export type ContactField = "name" | "email" | "company" | "position" | "message" | "turnstileToken";

export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export interface ContactRequest {
  submissionId: string;
  name: string;
  email: string;
  company: string;
  position: string;
  message: string;
  turnstileToken: string;
}

export interface ContactSuccessResponse {
  ok: true;
  message: string;
}

export type ProjectStatus = "Prototype - in development";

export interface ProjectSummary {
  id: string;
  title: string;
  category: "Application" | "Analytics" | "Operations" | "AI";
  description: string;
  problem: string;
  role: string;
  status: ProjectStatus;
  technologies: string[];
  accent: "teal" | "coral" | "gold";
}

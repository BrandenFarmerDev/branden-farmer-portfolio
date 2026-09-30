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

export type AskMode = "question" | "job_description";

export interface AskRequest {
  mode: AskMode;
  text: string;
  turnstileToken: string;
}

export interface EvidenceLink {
  id: string;
  title: string;
  url: string;
}

export interface AskResponse {
  status: "answered" | "evidence_only" | "no_evidence";
  message: string;
  answer?: string;
  relevant?: string[];
  gaps?: string[];
  evidence: EvidenceLink[];
  remaining: number | null;
}

export type ContactStatus = "new" | "replied" | "archived";
export type DeliveryState = "pending" | "sent";

export interface OwnerContact {
  submissionId: string;
  name: string;
  email: string;
  company: string;
  position: string;
  message: string;
  status: ContactStatus;
  ownerNotification: DeliveryState;
  confirmation: DeliveryState;
  submittedAt: string;
}

export type BookingStatus = "booked" | "rescheduled" | "cancelled";

export interface OwnerBooking {
  bookingUid: string;
  previousBookingUid: string | null;
  name: string;
  email: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  source: "cal" | "manual";
  updatedAt: string;
}

export interface ManualBookingRequest {
  name: string;
  email: string;
  startAt: string;
  endAt: string;
}

export interface OwnerSettings {
  aiEnabled: boolean;
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

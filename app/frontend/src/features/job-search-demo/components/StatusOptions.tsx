import { eventTypes, type EventType } from "../model/types";
import { humanize } from "../ui";

const stageOrder = ["Applied", "Outreach and screening", "Assessment", "Interview", "Outcome", "Other"] as const;
// A Record forces every event type to belong to a stage.
const stageOf: Record<EventType, typeof stageOrder[number]> = {
  application_submitted: "Applied", application_confirmation: "Applied", recruiter_outreach: "Outreach and screening", screening: "Outreach and screening",
  assessment_requested: "Assessment", assessment_completed: "Assessment", interview_requested: "Interview", interview_scheduled: "Interview", interview_completed: "Interview",
  offer: "Outcome", rejection: "Outcome", withdrawal: "Outcome", position_closed: "Outcome", follow_up_sent: "Other", follow_up_received: "Other", other_job_related: "Other",
};
const statusGroups = stageOrder.map((label) => ({ label, types: eventTypes.filter((type) => stageOf[type] === label) }));

// Event types grouped by stage; a leading placeholder option is the caller's responsibility.
export function StatusOptions() {
  return <>{statusGroups.map((group) => <optgroup key={group.label} label={group.label}>
    {group.types.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
  </optgroup>)}</>;
}

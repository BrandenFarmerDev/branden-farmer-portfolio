import { demoToday } from "../model/clock";
import { formatDate } from "../model/format";
import type { ApplicationFields } from "../model/actions";
import type { ApplicationRecord } from "../model/types";
import { Button, Field } from "../ui";
import { StatusOptions } from "./StatusOptions";

export interface ApplicationFormProps { application?: ApplicationRecord; submitLabel: string; onSubmit: (fields: ApplicationFields) => void }

export function ApplicationForm({ application, submitLabel, onSubmit }: ApplicationFormProps) {
  return <form className="qe-stack" data-gap="4" onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({ company: String(form.get("company")), role: String(form.get("role")), applied_at: String(form.get("date")), status: String(form.get("status")) });
  }}>
    <Field label="Company">{(control) => <input {...control} className="qe-input" name="company" required maxLength={200} defaultValue={application?.company} />}</Field>
    <Field label="Role">{(control) => <input {...control} className="qe-input" name="role" required maxLength={200} defaultValue={application?.role} />}</Field>
    <Field label="Applied date" help={`Demo dates run up to ${demoToday}.`}>{(control) => <input {...control} className="qe-input" name="date" type="date" required max={demoToday} defaultValue={application ? formatDate(application.applied_at) : undefined} />}</Field>
    <Field label="Status">{(control) => <select {...control} className="qe-input" name="status" defaultValue={application?.status ?? "application_submitted"}><StatusOptions /></select>}</Field>
    <div className="qe-cluster"><Button type="submit" variant="primary">{submitLabel}</Button></div>
  </form>;
}

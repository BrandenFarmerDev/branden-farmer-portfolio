import { useMemo, useState } from "react";
import { formatDate } from "../model/format";
import { emptyTextFilters } from "../model/filters";
import { activeApplications, queryApplications } from "../model/selectors";
import type { ApplicationRecord } from "../model/types";
import { useDemo } from "../state/DemoProvider";
import { Field, SearchInput } from "../ui";

export interface ApplicationPickerProps { label: string; value: string; onChange: (id: string) => void; excludeId?: string; required?: boolean }

// Looks applications up on its own so the choice never depends on the list filters or the current page.
export function ApplicationPicker({ label, value, onChange, excludeId, required }: ApplicationPickerProps) {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const options = useMemo<ApplicationRecord[]>(() => {
    const active = activeApplications(state).filter((application) => application.id !== excludeId);
    const filters = { ...emptyTextFilters, status: "", source: "", reconciliation: "", q: query };
    const found = queryApplications(active, { filters, sort: "applied_desc", page: 0, pageSize: 25 }).applications;
    const chosen = active.find((application) => application.id === value);
    return chosen && !found.some((application) => application.id === value) ? [chosen, ...found] : found;
  }, [state, query, excludeId, value]);
  return <div className="qe-stack" data-gap="3">
    <SearchInput label="Search applications" value={query} onChange={setQuery} placeholder="Company or role" />
    <Field label={label}>{(control) => <select {...control} className="qe-input" required={required} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose application</option>
      {options.map((application) => <option key={application.id} value={application.id}>{application.company} · {application.role} · {formatDate(application.applied_at)}</option>)}
    </select>}</Field>
    <p className="qe-help" role="status">{options.length ? "" : "No matches. Try a different company or role."}</p>
  </div>;
}

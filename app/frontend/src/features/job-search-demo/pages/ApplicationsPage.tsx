import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApplicationDrawer } from "../components/ApplicationDrawer";
import { ApplicationForm } from "../components/ApplicationForm";
import { PageHeader } from "../components/PageHeader";
import { StatusOptions } from "../components/StatusOptions";
import { addApplication } from "../model/actions";
import { downloadCsv } from "../model/download";
import { datePresets, emptyTextFilters, pageSizes, readUrlView, sortLabels, toListQuery, type DatePreset } from "../model/filters";
import { formatDate } from "../model/format";
import { demoPath } from "../model/routes";
import { queryApplications, applicationsCsv } from "../model/selectors";
import { applicationSorts, reconciliationOptions, sourceOptions, type ApplicationRecord, type ApplicationSort } from "../model/types";
import { useDemo } from "../state/DemoProvider";
import { Alert, Button, DataTable, Drawer, EmptyState, Field, FilterChip, Pagination, SearchInput, StatusBadge, humanize, type Column, type SortState } from "../ui";

const sortStates: Record<ApplicationSort, SortState> = {
  applied_desc: { key: "applied", direction: "descending" }, applied_asc: { key: "applied", direction: "ascending" },
  company: { key: "company", direction: "ascending" }, status: { key: "status", direction: "ascending" }, updated: { key: "updated", direction: "descending" },
};
type Changes = Partial<Record<string, string | null>>;
interface Chip { id: string; label: string; value: string; clear: () => void }

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const { state, perform, text, setText, customRange, setCustomRange } = useDemo();
  const heading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const view = readUrlView(params);
  const query = toListQuery(view, text, customRange);
  const list = queryApplications(state.applications, query);
  const { sort, pageSize } = query;

  // Updates are functional so a debounced search can never overwrite a filter changed in the meantime.
  function update(changes: Changes, options: { replace?: boolean; keepPage?: boolean } = {}) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) if (value) next.set(key, value); else next.delete(key);
      if (!options.keepPage) next.delete("page");
      return next;
    }, { replace: options.replace });
  }
  const preset: DatePreset = customRange ? "custom" : view.range || "any";
  const chips: Chip[] = [
    text.q && { id: "q", label: "Search", value: text.q, clear: () => setText({ q: "" }) },
    text.company && { id: "company", label: "Company", value: text.company, clear: () => setText({ company: "" }) },
    text.role && { id: "role", label: "Role", value: text.role, clear: () => setText({ role: "" }) },
    view.status && { id: "status", label: "Status", value: humanize(view.status), clear: () => update({ status: null }) },
    view.source && { id: "source", label: "Source", value: humanize(view.source), clear: () => update({ source: null }) },
    view.reconciliation && { id: "reconciliation", label: "Reconciliation", value: humanize(view.reconciliation), clear: () => update({ reconciliation: null }) },
    query.filters.from && { id: "from", label: "Applied from", value: query.filters.from, clear: () => (customRange ? setText({ from: "" }) : update({ range: null })) },
    query.filters.to && { id: "to", label: "Applied through", value: query.filters.to, clear: () => setText({ to: "" }) },
  ].filter((chip): chip is Chip => Boolean(chip));
  function clearFilters() {
    setText(emptyTextFilters); setCustomRange(false);
    update({ status: null, source: null, reconciliation: null, range: null });
  }
  function choosePreset(value: DatePreset) {
    setCustomRange(value === "custom");
    setText({ from: "", to: "" });
    update({ range: value === "any" || value === "custom" ? null : value });
  }
  function add(fields: Parameters<typeof addApplication>[0]) {
    const error = perform(addApplication(fields));
    setAddError(error);
    if (!error) setAdding(false);
  }

  const empty = chips.length
    ? <EmptyState variant="filtered" title="No applications match these filters" description="Remove a filter or search for something broader." action={<Button onClick={clearFilters}>Clear all filters</Button>} />
    : <EmptyState title="No applications yet" description="Connect a simulated source and sync, or add an application by hand."
      action={<Link className="qe-button" data-variant="primary" to={demoPath("sources")}>Open Sources &amp; privacy</Link>} />;
  const columns: Column<ApplicationRecord>[] = [
    { key: "company", header: "Company / role", sortKey: "company", render: (row) => <span className="qe-two-line"><span className="qe-strong">{row.company}</span><span className="qe-text-muted">{row.role}</span></span> },
    { key: "applied", header: "Applied", sortKey: "applied", render: (row) => formatDate(row.applied_at) },
    { key: "status", header: "Status", sortKey: "status", render: (row) => <StatusBadge value={row.status} /> },
    { key: "source", header: "Source", render: (row) => humanize(row.source) },
    { key: "reconciliation", header: "Reconciliation", render: (row) => <StatusBadge value={row.reconciliation} /> },
    { key: "updated", header: "Updated", sortKey: "updated", render: (row) => formatDate(row.updated_at) },
  ];
  const sortKeyOf: Record<string, ApplicationSort> = { applied: sort === "applied_desc" ? "applied_asc" : "applied_desc", company: "company", status: "status", updated: "updated" };

  return <>
    <PageHeader title="Applications" description="Search, filter and review every application with its source evidence." headingRef={heading} actions={<>
      <Button variant="primary" onClick={() => { setAddError(null); setAdding(true); }}>Add application</Button>
      <Button onClick={() => downloadCsv(applicationsCsv(state.applications))}>Export CSV</Button>
    </>} />
    <div className="qe-stack" data-gap="3">
      <form className="qe-stack" data-gap="3" role="search" aria-label="Filter applications" onSubmit={(event) => event.preventDefault()}>
        <div className="qe-toolbar" data-row="primary">
          <SearchInput label="Search company or role" value={text.q} onChange={(value) => { setText({ q: value.slice(0, 200) }); update({}, { replace: true }); }} help="Search text stays on this page and is never added to the address." />
          <Field label="Sort by">{(control) => <select {...control} className="qe-input" value={sort} onChange={(event) => update({ sort: event.target.value === "applied_desc" ? null : event.target.value })}>{applicationSorts.map((value) => <option key={value} value={value}>{sortLabels[value].option}</option>)}</select>}</Field>
        </div>
        <div className="qe-toolbar">
          <Field label="Status">{(control) => <select {...control} className="qe-input" value={view.status} onChange={(event) => update({ status: event.target.value })}><option value="">All statuses</option><StatusOptions /></select>}</Field>
          <Field label="Source">{(control) => <select {...control} className="qe-input" value={view.source} onChange={(event) => update({ source: event.target.value })}><option value="">All sources</option>{sourceOptions.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select>}</Field>
          <Field label="Reconciliation">{(control) => <select {...control} className="qe-input" value={view.reconciliation} onChange={(event) => update({ reconciliation: event.target.value })}><option value="">All states</option>{reconciliationOptions.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select>}</Field>
          <Field label="Applied date">{(control) => <select {...control} className="qe-input" value={preset} onChange={(event) => choosePreset(event.target.value as DatePreset)}>{datePresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</Field>
          {preset === "custom" && <>
            <Field label="Applied from">{(control) => <input {...control} className="qe-input" type="date" value={text.from} max={text.to || undefined} onChange={(event) => { setText({ from: event.target.value }); update({}, { replace: true }); }} />}</Field>
            <Field label="Applied through">{(control) => <input {...control} className="qe-input" type="date" value={text.to} min={text.from || undefined} onChange={(event) => { setText({ to: event.target.value }); update({}, { replace: true }); }} />}</Field>
          </>}
        </div>
      </form>
      {chips.length > 0 && <div className="qe-cluster" data-gap="3" role="group" aria-label="Active filters">
        {chips.map((chip) => <FilterChip key={chip.id} label={chip.label} value={chip.value} onRemove={() => { chip.clear(); update({}, { replace: true }); }} />)}
        <Button variant="quiet" size="compact" onClick={clearFilters}>Clear all filters</Button>
      </div>}
    </div>
    <div className="qe-stack" data-gap="3">
      <p className="qe-result-line" aria-live="polite">{`${list.total ? "" : "No applications · "}Sorted by ${sortLabels[sort].summary}`}</p>
      <DataTable caption="Applications" columns={columns} rows={list.applications} rowKey={(row) => row.id} empty={empty} currentRowKey={view.appId || null}
        sort={sortStates[sort]} onSort={(key) => update({ sort: sortKeyOf[key] === "applied_desc" ? null : sortKeyOf[key] })}
        action={{ header: "Actions", render: (row) => <Button variant="quiet" size="compact" aria-label={`View ${row.company} ${row.role}`} onClick={() => update({ app: row.id }, { keepPage: true })}>View</Button> }} />
      {list.total > 0 && <Pagination page={list.page} pageSize={pageSize} total={list.total} pageSizes={[...pageSizes]} label="Applications pages"
        onPageChange={(next) => update({ page: next ? String(next) : null }, { keepPage: true })} onPageSizeChange={(size) => update({ pageSize: size === 25 ? null : String(size) })} />}
    </div>
    <ApplicationDrawer appId={view.appId} fallbackFocusRef={heading} onClose={() => update({ app: null }, { keepPage: true })} />
    <Drawer open={adding} title="Add application" onClose={() => setAdding(false)}>
      <div className="qe-stack" data-gap="4">
        {addError && <Alert tone="danger" title="Not saved">{addError}</Alert>}
        <ApplicationForm submitLabel="Save application" onSubmit={add} />
      </div>
    </Drawer>
  </>;
}

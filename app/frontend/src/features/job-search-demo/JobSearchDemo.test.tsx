import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { currentUrl, guardNetwork, renderDemo, violations } from "../../test/demoRender";
import { demoPath } from "./model/routes";

guardNetwork();
// Instrumented jsdom runs are slow, and several tests type into forms keystroke by keystroke.
vi.setConfig({ testTimeout: 30_000 });

const MARKER = "zq-marker-91";
const rowsOf = (caption: string) => within(screen.getByRole("region", { name: `${caption} table` })).getAllByRole("row").slice(1);
const range = () => screen.getByText(/^\d+–\d+ of \d+$/).textContent;
const dialog = (name: string | RegExp) => screen.findByRole("dialog", { name });
const kpi = (label: string) => within(screen.getByRole("group", { name: "Key figures" })).getByText(label).closest(".qe-kpi") as HTMLElement;
async function addApplication(company: string, role = "Tester") {
  await userEvent.click(screen.getByRole("button", { name: "Add application" }));
  const form = await dialog("Add application");
  await userEvent.type(within(form).getByLabelText("Company"), company);
  await userEvent.type(within(form).getByLabelText("Role"), role);
  fireEvent.change(within(form).getByLabelText("Applied date"), { target: { value: "2026-10-10" } });
  await userEvent.click(within(form).getByRole("button", { name: "Save application" }));
}

describe("shell and routing", () => {
  it("renders the overview with one main landmark, the synthetic-data banner and a way back to the portfolio", () => {
    renderDemo();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByText("Interactive demo with fictional data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to portfolio" })).toHaveAttribute("href", "/work");
    expect(within(kpi("Applications")).getByText("36")).toBeInTheDocument();
    expect(screen.getByText(/Last successful sync: Oct 15, 2026/)).toBeInTheDocument();
  });
  it.each([
    ["applications", "Applications"], ["review", "Review"], ["sources", "Sources & privacy"], ["about", "A reviewable job-search timeline"],
  ])("opens %s directly", (section, heading) => {
    renderDemo(demoPath(section));
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(document.title).toContain("Job Search Intelligence demo");
  });
  it("navigates between sections and keeps edits across navigation", async () => {
    renderDemo();
    await userEvent.click(screen.getByRole("link", { name: "Applications" }));
    await addApplication("Persist Co");
    await userEvent.click(screen.getByRole("link", { name: "About" }));
    expect(currentUrl().pathname).toBe(demoPath("about"));
    await userEvent.click(screen.getByRole("link", { name: "Overview" }));
    expect(within(kpi("Applications")).getByText("37")).toBeInTheDocument();
  });
  it("shows a way home for unknown demo pages", () => {
    renderDemo(demoPath("nope"));
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to the overview" })).toHaveAttribute("href", demoPath());
  });
  it("keeps theme and navigation preferences on the demo root only", async () => {
    const { container } = renderDemo();
    const root = container.querySelector<HTMLElement>(".jsd-app")!;
    await userEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(root).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "Light theme" }));
    expect(root).toHaveAttribute("data-theme", "light");
    await userEvent.click(screen.getByRole("button", { name: "Navigation panel" }));
    expect(root).toHaveAttribute("data-sidebar", "collapsed");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.sidebar).toBeUndefined();
    expect(localStorage.length).toBe(0);
  });
  it("opens the mobile menu, closes it with Escape and restores focus to the Menu button", async () => {
    renderDemo();
    const menu = screen.getByRole("button", { name: "Menu" });
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });
  it("moves focus to the page heading after navigating", async () => {
    renderDemo();
    await userEvent.click(screen.getByRole("link", { name: "Sources & privacy" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Sources & privacy" })).toHaveFocus());
  });
});

describe("overview", () => {
  it("shows derived figures, chart table equivalents, insights and follow-ups", async () => {
    renderDemo();
    expect(within(kpi("Response rate")).getByText(/^\d+%$/)).toBeInTheDocument();
    expect(within(kpi("Applications needing review")).getByText("4")).toBeInTheDocument();
    expect(screen.getByText("9 source records in the review queue")).toBeInTheDocument();
    const stage = screen.getByRole("region", { name: "Stage reach" });
    await userEvent.click(within(stage).getByRole("button", { name: "Table" }));
    expect(within(stage).getByRole("region", { name: "Stage reach: values table" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Applications per week" })).toBeInTheDocument();
    expect(rowsOf("Follow-ups due").length).toBeGreaterThan(5);
    await userEvent.click(screen.getByRole("tab", { name: "By company" }));
    expect(rowsOf("Outcomes by company").length).toBeGreaterThan(10);
    await userEvent.click(screen.getByRole("button", { name: /^Applied/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Applied/ }));
    expect(rowsOf("Outcomes by company")).not.toHaveLength(0);
  });
  it("opens follow-up evidence in the matching application", async () => {
    renderDemo();
    const link = within(screen.getByRole("region", { name: "Follow-ups due table" })).getAllByRole("link", { name: /Open evidence/ })[0];
    await userEvent.click(link);
    expect(currentUrl().searchParams.get("app")).toMatch(/^[\w-]+$/);
    expect(await dialog(/.+ — .+/)).toBeInTheDocument();
  });
  it("moves between insight tabs with the arrow, Home and End keys", async () => {
    renderDemo();
    screen.getByRole("tab", { name: "By source" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "By company" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "By role" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "By source" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}{Home}x");
    expect(screen.getByRole("tab", { name: "By source" })).toHaveFocus();
  });
  it("sorts outcome columns in both directions", async () => {
    renderDemo();
    const names = () => rowsOf("Outcomes by source").map((row) => within(row).getAllByRole("cell")[0].textContent);
    await userEvent.click(screen.getByRole("button", { name: /^Source/ }));
    expect(names()).toEqual(["email", "manual", "sheet"]);
    await userEvent.click(screen.getByRole("button", { name: /^Source/ }));
    expect(names()).toEqual(["sheet", "manual", "email"]);
  });
  it("shows an empty state with a route to Sources after all data is deleted", async () => {
    renderDemo(demoPath("sources"));
    await userEvent.click(screen.getByRole("button", { name: "Delete all job data" }));
    const form = await dialog("Delete all job data");
    await userEvent.type(within(form).getByLabelText(/Type DELETE ALL JOB DATA/), "DELETE ALL JOB DATA");
    await userEvent.click(within(form).getByRole("button", { name: "Delete permanently" }));
    await userEvent.click(screen.getByRole("link", { name: "Overview" }));
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Sources/ })).toHaveAttribute("href", demoPath("sources"));
  });
});

describe("applications", () => {
  it("pages through 36 seeded applications at 25 and 50 per page", async () => {
    renderDemo(demoPath("applications"));
    expect(range()).toBe("1–25 of 36");
    expect(rowsOf("Applications")).toHaveLength(25);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(currentUrl().search).toBe("?page=1");
    expect(range()).toBe("26–36 of 36");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(currentUrl().search).toBe("?pageSize=50");
    expect(range()).toBe("1–36 of 36");
  });
  it("filters by status, source, reconciliation and date preset using only enumerated URL values", async () => {
    renderDemo(demoPath("applications"));
    await userEvent.selectOptions(screen.getByLabelText("Source", { selector: "select" }), "manual");
    await userEvent.selectOptions(screen.getByLabelText("Reconciliation"), "matched");
    await userEvent.selectOptions(screen.getByLabelText("Status", { selector: "select" }), "screening");
    expect(currentUrl().search).toBe("?source=manual&reconciliation=matched&status=screening");
    expect(rowsOf("Applications")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Status: Screening" }));
    await userEvent.selectOptions(screen.getByLabelText("Applied date"), "90");
    expect(currentUrl().searchParams.get("range")).toBe("90");
    expect(screen.getByRole("button", { name: /Remove filter: Applied from: 2026-07-17/ })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("group", { name: "Active filters" })).getByRole("button", { name: "Clear all filters" }));
    expect(currentUrl().search).toBe("");
    expect(range()).toBe("1–25 of 36");
  });
  it("supports a custom applied-date range kept out of the URL", async () => {
    renderDemo(demoPath("applications"));
    await userEvent.selectOptions(screen.getByLabelText("Applied date"), "custom");
    fireEvent.change(screen.getByLabelText("Applied from", { selector: "input" }), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Applied through", { selector: "input" }), { target: { value: "2026-10-10" } });
    expect(rowsOf("Applications")).toHaveLength(3);
    expect(currentUrl().search).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Applied through: 2026-10-10" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove filter: Applied from: 2026-10-01" }));
    expect(range()).toBe("1–25 of 36");
    await userEvent.selectOptions(screen.getByLabelText("Applied date"), "any");
  });
  it("sorts from the header and the sort control", async () => {
    renderDemo(demoPath("applications"));
    const first = () => within(rowsOf("Applications")[0]).getAllByRole("cell")[0].textContent;
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "company");
    expect(currentUrl().search).toBe("?sort=company");
    expect(first()).toContain("Alderbrook");
    await userEvent.click(screen.getByRole("button", { name: /^Applied/ }));
    expect(currentUrl().search).toBe("");
    await userEvent.click(screen.getByRole("button", { name: /^Applied/ }));
    expect(currentUrl().search).toBe("?sort=applied_asc");
    await userEvent.click(screen.getByRole("button", { name: /^Status/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Updated/ }));
    expect(currentUrl().search).toBe("?sort=updated");
  });
  it("keeps typed search text, company and role selections out of the URL and history", async () => {
    renderDemo(demoPath("applications"));
    await addApplication(`Marker Co ${MARKER}`, `Role ${MARKER}`);
    const search = screen.getByRole("searchbox", { name: "Search company or role" });
    await userEvent.type(search, `${MARKER}{Enter}`);
    expect(rowsOf("Applications")).toHaveLength(1);
    expect(currentUrl().href).not.toContain(MARKER);
    expect(screen.getByRole("button", { name: `Remove filter: Search: ${MARKER}` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await userEvent.click(screen.getByRole("link", { name: "Overview" }));
    await userEvent.click(screen.getByRole("tab", { name: "By company" }));
    await userEvent.click(screen.getByRole("link", { name: `Marker Co ${MARKER}` }));
    expect(currentUrl().pathname).toBe(demoPath("applications"));
    expect(currentUrl().href).not.toContain(MARKER);
    expect(rowsOf("Applications")).toHaveLength(1);
    await userEvent.click(screen.getByRole("link", { name: "Overview" }));
    await userEvent.click(screen.getByRole("tab", { name: "By role" }));
    await userEvent.click(screen.getByRole("link", { name: `Role ${MARKER}` }));
    expect(currentUrl().href).not.toContain(MARKER);
    expect(screen.getByRole("button", { name: `Remove filter: Role: Role ${MARKER}` })).toBeInTheDocument();
    expect(document.querySelector("a[href*='zq-marker']")).toBeNull();
  });
  it("loses typed text on reload while the URL stays free of it", async () => {
    const first = renderDemo(demoPath("applications"));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search company or role" }), `${MARKER}{Enter}`);
    expect(rowsOf("Applications")).toHaveLength(1);
    const reloaded = currentUrl().pathname + currentUrl().search;
    first.unmount();
    renderDemo(reloaded);
    expect(range()).toBe("1–25 of 36");
    expect(reloaded).not.toContain(MARKER);
  });
  it("links a source insight to the enumerated source filter", async () => {
    renderDemo();
    await userEvent.click(within(screen.getByRole("region", { name: "Outcomes by source table" })).getByRole("link", { name: "sheet" }));
    expect(currentUrl().search).toBe("?source=sheet");
    expect(rowsOf("Applications").length).toBeGreaterThan(0);
  });
  it("explains empty results and recovers with Clear all filters", async () => {
    renderDemo(demoPath("applications"));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search company or role" }), "no such company{Enter}");
    expect(screen.getByText("No applications match these filters")).toBeInTheDocument();
    expect(screen.getByText(/^No applications · Sorted by/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear all filters" })[0]);
    expect(range()).toBe("1–25 of 36");
  });
  it("opens a deep-linked application that is not on the current page and closes safely", async () => {
    renderDemo(`${demoPath("applications")}?app=app-001`);
    const drawer = await dialog("Alderbrook Analytics — Data Analyst");
    expect(within(drawer).getByRole("list", { name: "Evidence timeline" })).toBeInTheDocument();
    expect(within(drawer).getByText("0 recorded owner decisions")).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(currentUrl().search).toBe(""));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("returns focus to the View button when the drawer closes", async () => {
    renderDemo(demoPath("applications"));
    const view = screen.getAllByRole("button", { name: /^View / })[0];
    await userEvent.click(view);
    const drawer = await dialog(/.+ — .+/);
    act(() => { (drawer as HTMLDialogElement).close(); });
    await waitFor(() => expect(view).toHaveFocus());
    expect(currentUrl().searchParams.has("app")).toBe(false);
  });
  it("handles invalid, malicious and deleted application IDs", async () => {
    const first = renderDemo(`${demoPath("applications")}?app=missing-id`);
    expect(await screen.findByText("Application not found")).toBeInTheDocument();
    first.unmount();
    renderDemo(`${demoPath("applications")}?app=${encodeURIComponent("<script>alert(1)</script>")}&page=-5&status=bogus`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(range()).toBe("1–25 of 36");
  });
  it("adds an application that appears in the list, overview and review counts", async () => {
    renderDemo(demoPath("applications"));
    await addApplication("Brand New Co", "Quality Lead");
    expect(screen.getByText("Added Brand New Co, Quality Lead.")).toBeInTheDocument();
    expect(range()).toBe("1–25 of 37");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search company or role" }), "brand new{Enter}");
    expect(within(rowsOf("Applications")[0]).getByText("Brand New Co")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Overview" }));
    expect(within(kpi("Applications")).getByText("37")).toBeInTheDocument();
  });
  it("edits an application from its details tab", async () => {
    renderDemo(`${demoPath("applications")}?app=app-002`);
    const drawer = await dialog("Bluefen Logistics — Operations Analyst");
    await userEvent.click(within(drawer).getByRole("tab", { name: "Details" }));
    const company = within(drawer).getByLabelText("Company");
    await userEvent.clear(company);
    await userEvent.type(company, "Bluefen Renamed");
    await userEvent.selectOptions(within(drawer).getByLabelText("Status"), "offer");
    await userEvent.click(within(drawer).getByRole("button", { name: "Save application" }));
    expect(screen.getByText("Saved. The dashboard has been refreshed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Applications" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search company or role" }), "renamed{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "View Bluefen Renamed Operations Analyst" }));
    const reopened = await dialog("Bluefen Renamed — Operations Analyst");
    expect(within(reopened).getByText("2 recorded owner decisions")).toBeInTheDocument();
  });
  it("excludes an application only after confirmation and then treats its link as missing", async () => {
    renderDemo(`${demoPath("applications")}?app=app-006`);
    const drawer = await dialog("Fernhollow Labs — Analytics Engineer");
    await userEvent.click(within(drawer).getByRole("button", { name: "Exclude application" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Cancel" }));
    expect(within(drawer).queryByRole("button", { name: "Confirm exclusion" })).not.toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Exclude application" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "Confirm exclusion" }));
    expect(range()).toBe("1–25 of 35");
    expect(screen.getByText("Application excluded.")).toBeInTheDocument();
  });
  it("merges one application into another and moves its evidence", async () => {
    renderDemo(`${demoPath("applications")}?app=app-003`);
    const drawer = await dialog("Cinderpoint Software — Application Developer");
    await userEvent.click(within(drawer).getByRole("tab", { name: "Merge" }));
    expect(within(drawer).getByLabelText("Merge into")).toBeInTheDocument();
    await userEvent.type(within(drawer).getByRole("searchbox", { name: "Search applications" }), "no-match-here{Enter}");
    expect(within(drawer).getByText("No matches. Try a different company or role.")).toBeInTheDocument();
    await userEvent.clear(within(drawer).getByRole("searchbox", { name: "Search applications" }));
    await userEvent.type(within(drawer).getByRole("searchbox", { name: "Search applications" }), "Nettlebay{Enter}");
    expect(within(drawer).queryByRole("option", { name: /Cinderpoint Software · Application/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(drawer).getByLabelText("Merge into"), "app-014");
    await userEvent.selectOptions(within(drawer).getByLabelText("Verified status after merge"), "interview_scheduled");
    await userEvent.click(within(drawer).getByRole("button", { name: "Merge evidence" }));
    expect(screen.getByText("Merged Cinderpoint Software into Nettlebay Cloud.")).toBeInTheDocument();
    expect(range()).toBe("1–25 of 35");
  });
  it("shows a stale merge target as an explicit error and changes nothing", async () => {
    renderDemo(`${demoPath("applications")}?app=app-003`);
    const drawer = await dialog("Cinderpoint Software — Application Developer");
    await userEvent.click(within(drawer).getByRole("tab", { name: "Merge" }));
    fireEvent.submit(within(drawer).getByRole("button", { name: "Merge evidence" }).closest("form")!);
    expect(await within(drawer).findByText(/Choose a different, active application/)).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: "Merge into another application" })).toBeInTheDocument();
  });
  it("downloads a CSV of the current active applications without any request", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((value: Blob) => { blob = value; return "blob:demo"; });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderDemo(demoPath("applications"));
    await addApplication("=HYPERLINK(\"x\")");
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:demo");
    const text = await blob!.text();
    expect(text.split("\r\n")).toHaveLength(38);
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("review", () => {
  it("lists source records and resolves one into an application with a verified event", async () => {
    renderDemo(demoPath("review"));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(9);
    expect(screen.getByRole("link", { name: /Review 9 records waiting/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resolve Thank you for applying" }));
    const form = screen.getByRole("form", { name: "Decision for Thank you for applying" });
    await userEvent.selectOptions(within(form).getByLabelText("Canonical application"), "app-036");
    await userEvent.selectOptions(within(form).getByLabelText("Verified event"), "interview_scheduled");
    await userEvent.click(within(form).getByRole("button", { name: "Save decision" }));
    expect(screen.getByText("Linked to Kestrel Mill Foods.")).toBeInTheDocument();
    expect(screen.queryByText("Thank you for applying")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review 8 records waiting/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Review" })).toHaveFocus();
    await userEvent.click(screen.getByRole("link", { name: "Applications" }));
    await userEvent.click(screen.getByRole("button", { name: "View Kestrel Mill Foods Supply Chain Analyst" }));
    const drawer = await dialog("Kestrel Mill Foods — Supply Chain Analyst");
    expect(within(within(drawer).getByRole("list", { name: "Evidence timeline" })).getByText(/Interview scheduled/)).toBeInTheDocument();
  });
  it("excludes a source record and keeps the application", async () => {
    renderDemo(demoPath("review"));
    await userEvent.click(screen.getByRole("button", { name: "Resolve Interview availability for next week" }));
    await userEvent.click(screen.getByRole("button", { name: "Exclude source" }));
    expect(screen.getByText("Source record excluded.")).toBeInTheDocument();
    expect(screen.queryByText("Interview availability for next week")).not.toBeInTheDocument();
  });
  it("does not submit an incomplete decision", async () => {
    renderDemo(demoPath("review"));
    await userEvent.click(screen.getByRole("button", { name: "Resolve Thank you for applying" }));
    const form = screen.getByRole("form", { name: "Decision for Thank you for applying" });
    fireEvent.submit(form);
    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(9);
    await userEvent.click(screen.getByRole("button", { name: "Resolve Thank you for applying" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
  it("shows an empty queue after every record is excluded", async () => {
    renderDemo(demoPath("review"));
    for (let remaining = 9; remaining > 0; remaining--) {
      await userEvent.click(screen.getAllByRole("button", { name: /^Resolve / })[0]);
      await userEvent.click(screen.getByRole("button", { name: "Exclude source" }));
    }
    expect(screen.getByText("No outstanding source records.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /records waiting/ })).not.toBeInTheDocument();
  });
});

describe("sources and privacy", () => {
  it("syncs fixed sample batches without duplicating and records history", async () => {
    renderDemo(demoPath("sources"));
    expect(rowsOf("Sync history")).toHaveLength(4);
    for (let sync = 1; sync <= 3; sync++) {
      await userEvent.click(screen.getByRole("button", { name: "Run Gmail sync" }));
      expect(rowsOf("Sync history")).toHaveLength(4 + sync);
    }
    expect(screen.getByText(/Imported 2 sample applications and 1 record for review/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(screen.getByText(/No new sample messages/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Applications" }));
    expect(range()).toBe("1–25 of 42");
    await userEvent.click(screen.getByRole("link", { name: /Review/ }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(12);
  });
  it("pauses and reconnects the simulated tracker and queues reprocessing", async () => {
    renderDemo(demoPath("sources"));
    await userEvent.click(screen.getByRole("button", { name: "Pause tracker" }));
    expect(screen.getByText("Simulated tracker paused.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect tracker" }));
    expect(screen.getByText("Simulated tracker connected.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reprocess retained evidence" }));
    expect(screen.getByText("Retained evidence will be reprocessed on the next sync.")).toBeInTheDocument();
  });
  it("requires the exact confirmation phrase, deletes everything, pauses imports and allows a simulated reconnect", async () => {
    renderDemo(demoPath("sources"));
    await userEvent.click(screen.getByRole("button", { name: "Delete all job data" }));
    const form = await dialog("Delete all job data");
    const submit = within(form).getByRole("button", { name: "Delete permanently" });
    await userEvent.type(within(form).getByLabelText(/Type DELETE ALL JOB DATA/), "delete all job data");
    expect(submit).toBeDisabled();
    fireEvent.submit(form.querySelector("form")!);
    expect(await within(form).findByText(/exactly to confirm/)).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText(/Type DELETE ALL JOB DATA/));
    await userEvent.type(within(form).getByLabelText(/Type DELETE ALL JOB DATA/), "DELETE ALL JOB DATA");
    await userEvent.click(submit);
    expect(screen.getByText(/All demo data was deleted/)).toBeInTheDocument();
    expect(screen.getAllByText("Not connected")).toHaveLength(2);
    expect(screen.getByText("No sync runs yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Connect Gmail (simulated)" }));
    expect(screen.getByText("Gmail imports are paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Gmail sync" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Resume Gmail imports" }));
    expect(screen.getByText(/Gmail imports resumed and sync completed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Applications" }));
    expect(range()).toBe("1–2 of 2");
  });
  it("reset restores the deterministic initial state, filters and clears messages", async () => {
    renderDemo(demoPath("applications"));
    await addApplication("Temporary Co");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search company or role" }), `${MARKER}{Enter}`);
    await userEvent.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(screen.getByText("Demo reset to its original sample data.")).toBeInTheDocument();
    expect(range()).toBe("1–25 of 36");
    expect(screen.queryByRole("group", { name: "Active filters" })).not.toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it.each([["", "overview"], ["applications", "applications"], ["review", "review"], ["sources", "sources"], ["about", "about"]])("has no axe violations on %s", async (section) => {
    const { container } = renderDemo(section ? demoPath(section) : demoPath());
    expect(await violations(container)).toEqual([]);
  });
  it("has no axe violations in an open application drawer", async () => {
    const { container } = renderDemo(`${demoPath("applications")}?app=app-001`);
    await dialog("Alderbrook Analytics — Data Analyst");
    expect(await violations(container)).toEqual([]);
  });
});

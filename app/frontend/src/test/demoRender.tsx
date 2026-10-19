import { render } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { JobSearchDemo } from "../features/job-search-demo/JobSearchDemo";
import { DEMO_BASE } from "../features/job-search-demo/model/routes";

// jsdom has no modal <dialog>; these doubles track `open` and fire `close` like the browser.
export function installDialogDoubles() {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

/** Every demo test runs with network APIs that fail loudly; call after each test via `expectNoNetwork`. */
const fetchSpy = vi.fn(() => Promise.reject(new Error("The demo must not use the network.")));
const beaconSpy = vi.fn(() => false);
const xhrOpen = vi.fn();
export function guardNetwork() {
  beforeEach(() => {
    installDialogDoubles();
    fetchSpy.mockClear(); beaconSpy.mockClear(); xhrOpen.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beaconSpy });
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(xhrOpen);
  });
  afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); expect(beaconSpy).not.toHaveBeenCalled(); expect(xhrOpen).not.toHaveBeenCalled(); });
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{pathname}{search}</output>;
}
export function renderDemo(path = DEMO_BASE) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="projects/job-search-intelligence/*" element={<JobSearchDemo />} /><Route path="*" element={<p>Portfolio page</p>} /></Routes>
    <LocationProbe />
  </MemoryRouter>);
}
export const currentUrl = (): URL => new URL(document.querySelector("[data-testid=location]")!.textContent!, "http://demo.test");
export const violations = async (container: HTMLElement) => (await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations;

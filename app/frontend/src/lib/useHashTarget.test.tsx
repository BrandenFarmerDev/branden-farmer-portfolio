import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHashTarget } from "./useHashTarget";

function Page() {
  useHashTarget();
  return (
    <main id="main-content" tabIndex={-1}>
      <a id="plain-target" href="/about" tabIndex={0}>Plain target</a>
      <ul>
        <li id="group-1" data-passage="group-1">First</li>
        <li data-passage="group-1">Second</li>
      </ul>
      <p id='odd"id'>Odd id</p>
    </main>
  );
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Page /></MemoryRouter>);
}

describe("useHashTarget", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  it("highlights a passage group and clears it on unmount", () => {
    const { unmount } = renderAt("/resume#group-1");
    expect(screen.getByText("First")).toHaveFocus();
    expect(screen.getByText("First")).toHaveAttribute("tabindex", "-1");
    expect(document.querySelectorAll("[data-hash-active]")).toHaveLength(2);
    unmount();
    expect(document.querySelectorAll("[data-hash-active]")).toHaveLength(0);
  });

  it("keeps an existing tab order and highlights a single target", () => {
    renderAt("/about#plain-target");
    expect(screen.getByText("Plain target")).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("Plain target")).toHaveAttribute("data-hash-active");
  });

  it("handles ids that cannot be used in selectors and malformed fragments", () => {
    const { unmount } = renderAt(`/about#${encodeURIComponent('odd"id')}`);
    expect(screen.getByText("Odd id")).toHaveFocus();
    expect(screen.getByText("Odd id")).toHaveAttribute("data-hash-active");
    unmount();

    renderAt("/about#%E0%A4%A");
    expect(document.querySelectorAll("[data-hash-active]")).toHaveLength(0);
  });
});

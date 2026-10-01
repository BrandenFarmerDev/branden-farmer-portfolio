import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

describe("Header", () => {
  it("closes the mobile menu with Escape and restores button focus", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    const menuButton = screen.getByRole("button", { name: "Open navigation" });

    fireEvent.click(menuButton);
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveFocus();
  });

  it("closes the mobile menu when an internal navigation link is selected", () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    fireEvent.click(screen.getByRole("link", { name: "Work" }));

    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("persists the selected color theme and follows the system by default", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    render(<MemoryRouter><Header /></MemoryRouter>);
    const select = screen.getByRole("combobox", { name: "Color theme" });

    expect(select).toHaveValue("system");
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.change(select, { target: { value: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("portfolio-theme")).toBe("light");
  });

  it("falls back to the system theme when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<MemoryRouter><Header /></MemoryRouter>);

    expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("marks Ask Branden as the active navigation destination", () => {
    render(<MemoryRouter initialEntries={["/ask"]}><Header /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Ask Branden" })).toHaveClass("ask-link", "active");
  });
});

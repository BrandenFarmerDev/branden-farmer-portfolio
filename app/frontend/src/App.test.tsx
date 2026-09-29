import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@calcom/embed-react", () => ({
  getCalApi: vi.fn().mockRejectedValue(new Error("embed unavailable in unit tests")),
}));

function renderRoute(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

describe("portfolio routes", () => {
  it.each([
    ["/", "Branden Farmer"],
    ["/work", "Tools shaped around real decisions"],
    ["/about", "Technical depth with an operations point of view"],
    ["/resume", "Experience across operations, data, and development"],
    ["/contact", "Start with the channel that works for you"],
    ["/ask", "Evidence first, assistant later"],
  ])("renders %s", async (path, heading) => {
    renderRoute(path);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Branden Farmer on GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/BrandenFarmerDev",
    );
  });

  it("keeps unfinished work and Ask Branden explicitly unavailable", async () => {
    const { unmount } = renderRoute("/work");
    expect(await screen.findAllByText("Prototype - in development")).toHaveLength(3);
    unmount();

    renderRoute("/ask");
    expect(await screen.findByText("Assistant not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeDisabled();
  });

  it("exposes the PDF download and the public portfolio source", async () => {
    const { unmount } = renderRoute("/resume");
    expect(await screen.findByRole("link", { name: /Download PDF/ })).toHaveAttribute(
      "href",
      "/Branden_Farmer_Resume.pdf",
    );
    unmount();

    renderRoute("/about");
    expect(await screen.findByRole("link", { name: /Portfolio source/ })).toHaveAttribute(
      "href",
      "https://github.com/BrandenFarmerDev/branden-farmer-portfolio",
    );
  });

  it("has no automatically detectable accessibility violations on the About page", async () => {
    const { container } = renderRoute("/about");
    await screen.findByRole("heading", { name: "From the workbench to connected systems" });
    await waitFor(async () => {
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(results.violations).toEqual([]);
    });
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridOperationsPage } from "./GridOperationsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("GridOperationsPage report", () => {
  it("renders one lazy fullscreen report and keeps its direct link available", () => {
    const reportUrl = "https://app.powerbi.com/view?r=public-token";
    vi.stubEnv("VITE_POWER_BI_EMBED_URL", reportUrl);
    render(<MemoryRouter><GridOperationsPage /></MemoryRouter>);

    expect(screen.getByText("Facilities fully covered").nextElementSibling).toHaveTextContent("5 of 6");
    const report = screen.getByTitle("Sierra North Energy synthetic grid operations report");
    expect(report).toHaveAttribute("src", reportUrl);
    expect(report).toHaveAttribute("loading", "lazy");
    expect(report).toHaveAttribute("allowfullscreen");
    expect(screen.getAllByRole("link", { name: /open it directly/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /open it directly/i })[0]).toHaveAttribute("href", reportUrl);
    expect(screen.getAllByTitle("Sierra North Energy synthetic grid operations report")).toHaveLength(1);
    expect(screen.getByText(/availability depends on the report owner’s Power BI publishing settings/i)).toBeInTheDocument();
  });

  it("keeps a safe placeholder when the configured runtime URL is invalid", () => {
    vi.stubEnv("VITE_POWER_BI_EMBED_URL", "https://evil.example/view?r=secret");
    render(<MemoryRouter><GridOperationsPage /></MemoryRouter>);

    expect(screen.queryByTitle("Sierra North Energy synthetic grid operations report")).not.toBeInTheDocument();
    expect(screen.getByText(/public Power BI report link is not configured/i)).toBeInTheDocument();
  });
});

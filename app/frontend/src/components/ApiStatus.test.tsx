import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiStatus } from "./ApiStatus";

describe("API session recovery", () => {
  it("offers a separate API sign-in tab after an expired or missing session", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ApiStatus />);
    const link = await screen.findByRole("link", { name: "Sign in to the portfolio API" });
    expect(link).toHaveAttribute("href", "http://localhost:8787/api/health");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/then return and reload this page/)).toBeInTheDocument();
  });
  it("does not report a followed Access login page as connected", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Sign in</html>", { status: 200 }));
    render(<ApiStatus />);
    expect(await screen.findByText("API unavailable")).toBeInTheDocument();
    expect(screen.queryByText("API connected")).not.toBeInTheDocument();
  });
});

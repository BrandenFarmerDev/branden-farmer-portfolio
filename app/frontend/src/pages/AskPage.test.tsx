import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/api";
import { AskPage } from "./AskPage";

const mocks = vi.hoisted(() => ({ submitAsk: vi.fn() }));

vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  submitAsk: mocks.submitAsk,
}));

vi.mock("../components/TurnstileWidget", () => ({
  TurnstileWidget: ({ action, onToken, onError }: { action: string; onToken: (token: string) => void; onError: (message: string) => void }) => (
    <>
      <button type="button" onClick={() => onToken(`token-${action}`)}>Complete security check</button>
      <button type="button" onClick={() => onError("The security check expired.")}>Expire security check</button>
    </>
  ),
}));

function renderPage() {
  return render(<MemoryRouter><AskPage /></MemoryRouter>);
}

describe("AskPage", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    mocks.submitAsk.mockReset();
  });

  it("submits a suggested question and shows the cited answer, gaps, and allowance", async () => {
    mocks.submitAsk.mockResolvedValueOnce({
      status: "answered",
      message: "Answer generated only from the cited portfolio evidence.",
      answer: "Branden builds Power BI and Foundry applications.",
      relevant: ["Power BI dashboards"],
      gaps: ["Tableau is not listed"],
      evidence: [{ id: "skills", title: "Technical skills", url: "/resume#resume-skills-heading" }],
      remaining: 1,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Power BI and Palantir Foundry/ }));
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));

    expect(mocks.submitAsk).toHaveBeenCalledWith({
      mode: "question",
      text: "What experience does Branden have with Power BI and Palantir Foundry?",
      turnstileToken: "token-ask_branden",
    });
    expect(await screen.findByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByText("Tableau is not listed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Technical skills" })).toHaveAttribute("href", "/resume#resume-skills-heading");
    expect(screen.getByText("1 generated answer remaining today.")).toBeInTheDocument();
  });

  it("switches to job-description mode, enforces length, and shows evidence-only results", async () => {
    mocks.submitAsk.mockResolvedValueOnce({
      status: "evidence_only",
      message: "Generated answers are paused.",
      evidence: [{ id: "about", title: "About Branden", url: "/about" }],
      remaining: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Compare a job description" }));
    expect(screen.getByRole("button", { name: "Compare a job description" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Suggested questions")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Job description"), "Too short");
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 40–4,000 characters.");

    await user.type(screen.getByLabelText("Job description"), " but now it describes Power BI and SQL requirements clearly.");
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Complete the security check first.");

    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    expect(await screen.findByRole("heading", { name: "Matching evidence" })).toBeInTheDocument();
    expect(screen.queryByText(/remaining today/)).not.toBeInTheDocument();
  });

  it("reports API and security-check errors", async () => {
    mocks.submitAsk.mockRejectedValueOnce(new ApiRequestError(429, { error: "rate_limited", message: "Too many questions." }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Expire security check" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The security check expired.");
    await user.type(screen.getByLabelText("Question"), "Power BI?");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many questions."));
  });
});

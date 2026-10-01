import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/api";
import { AskPage } from "./AskPage";

const mocks = vi.hoisted(() => ({ submitAsk: vi.fn(), getAskStatus: vi.fn() }));

vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  submitAsk: mocks.submitAsk,
  getAskStatus: mocks.getAskStatus,
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

const resetsAt = "2026-10-02T00:00:00.000Z";
const allowance = (used: number, remaining = 5 - used) => ({ used, limit: 5, remaining, resetsAt });

describe("AskPage", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    sessionStorage.clear();
    mocks.submitAsk.mockReset();
    mocks.getAskStatus.mockReset().mockResolvedValue({ aiEnabled: true, allowance: allowance(0) });
  });

  afterEach(() => vi.useRealTimers());

  it("ignores a status read started before a newer submission", async () => {
    let finishStatus!: (value: { aiEnabled: boolean; allowance: ReturnType<typeof allowance> }) => void;
    mocks.getAskStatus.mockReturnValueOnce(new Promise((resolve) => { finishStatus = resolve; }));
    mocks.getAskStatus.mockResolvedValue({ aiEnabled: true, allowance: allowance(5) });
    mocks.submitAsk.mockResolvedValueOnce({
      status: "answered", message: "Supported answer.", evidence: [], remaining: 0, allowance: allowance(5),
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Question"), "Power BI?");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    expect(await screen.findByText("5 of 5 used")).toBeInTheDocument();
    await act(async () => finishStatus({ aiEnabled: true, allowance: allowance(0) }));
    expect(screen.getByText("5 of 5 used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeDisabled();
  });

  it("refreshes the allowance at reset while the tab remains focused", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T23:59:59.000Z"));
    mocks.getAskStatus.mockResolvedValueOnce({ aiEnabled: true, allowance: allowance(5) });
    mocks.getAskStatus.mockResolvedValue({ aiEnabled: true, allowance: { ...allowance(0), resetsAt: "2026-10-03T00:00:00.000Z" } });
    await act(async () => { renderPage(); });
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_050); });
    expect(screen.getByText("0 of 5 used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeEnabled();
  });

  it("submits a suggested question and shows the cited answer, gaps, and allowance", async () => {
    mocks.submitAsk.mockResolvedValueOnce({
      status: "answered",
      message: "Answer generated only from the cited portfolio evidence.",
      answer: "Branden builds Power BI and Foundry applications.",
      relevant: ["Power BI dashboards"],
      gaps: ["Tableau is not listed"],
      evidence: [{ id: "skills", title: "Technical skills", url: "/resume#skills-business-intelligence" }],
      remaining: 4,
      allowance: allowance(1),
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("0 of 5 used")).toBeInTheDocument();
    expect(screen.getByText(/Each browser can generate 5 answers per day/)).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Technical skills" })).toHaveAttribute("href", "/resume#skills-business-intelligence");
    expect(screen.getByText("Résumé")).toHaveClass("ask-evidence-source");
    expect(screen.getByText("1 of 5 used")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("ask-branden:last-result")!)).toMatchObject({ status: "answered" });
  });

  it("disables asking with an explanation once today's answers are used", async () => {
    mocks.getAskStatus.mockResolvedValue({ aiEnabled: true, allowance: allowance(5) });
    renderPage();

    const submit = await screen.findByRole("button", { name: "Ask Branden" });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(screen.getByText("5 of 5 used")).toBeInTheDocument();
    expect(screen.getByText(/You've used today's 5 generated answers/)).toHaveAttribute("id", submit.getAttribute("aria-describedby"));
    expect(screen.getByRole("button", { name: /Power BI and Palantir Foundry/ })).toBeDisabled();
  });

  it("explains a shared network limit and refreshes after the daily reset", async () => {
    mocks.getAskStatus.mockResolvedValueOnce({ aiEnabled: true, allowance: { ...allowance(2, 0), resetsAt: "2000-01-01T00:00:00.000Z" } });
    renderPage();

    expect(await screen.findByText(/shared answer allowance for your network/)).toBeInTheDocument();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("0 of 5 used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeEnabled();
  });

  it("hides the counter when the allowance cannot be loaded and restores the last answer", async () => {
    sessionStorage.setItem("ask-branden:last-result", JSON.stringify({
      status: "evidence_only", message: "Restored.", evidence: [{ id: "about", title: "About Branden", url: "/about" }], remaining: null,
    }));
    mocks.getAskStatus.mockRejectedValueOnce(new Error("offline"));
    renderPage();

    expect(screen.getByText("Restored.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAskStatus).toHaveBeenCalled());
    expect(screen.queryByText(/of 5 used/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask Branden" })).toBeEnabled();
  });

  it("ignores unreadable stored results and storage that cannot be written", async () => {
    sessionStorage.setItem("ask-branden:last-result", "{not json");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    mocks.submitAsk.mockResolvedValueOnce({ status: "no_evidence", message: "Nothing matched.", evidence: [], remaining: null });
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("heading", { name: "Matching evidence" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Question"), "Power BI?");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    expect(await screen.findByText("Nothing matched.")).toBeInTheDocument();
  });

  it("marks the allowance exhausted when the server declines without counts", async () => {
    mocks.getAskStatus.mockResolvedValue({ aiEnabled: true, allowance: allowance(4) });
    mocks.submitAsk.mockResolvedValueOnce({ status: "evidence_only", message: "Used up.", evidence: [], remaining: 0 });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("4 of 5 used");
    await user.type(screen.getByLabelText("Question"), "Power BI?");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Ask Branden" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ask Branden" })).toBeDisabled());
  });

  it("switches to job-description mode, enforces length, and shows evidence-only results", async () => {
    mocks.getAskStatus.mockResolvedValue({ aiEnabled: false, allowance: null });
    mocks.submitAsk.mockResolvedValueOnce({
      status: "evidence_only",
      message: "Generated answers are paused.",
      evidence: [{ id: "about", title: "About Branden", url: "/about" }],
      remaining: null,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Generated answers are paused. Ask Branden will return/)).toBeInTheDocument();
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
    expect(screen.queryByText(/of 5 used/)).not.toBeInTheDocument();
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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "./ContactForm";
import { ApiStatus } from "./ApiStatus";

const mocks = vi.hoisted(() => ({ submitContact: vi.fn() }));

vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  submitContact: mocks.submitContact,
}));

vi.mock("./TurnstileWidget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken("verified-token")}>Complete security check</button>
  ),
}));

describe("ContactForm", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    mocks.submitContact.mockReset();
  });

  it("offers session recovery after initial health succeeds but a later contact request loses access", async () => {
    mocks.submitContact.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    const { unmount } = render(<><ContactForm /><ApiStatus /></>);
    await screen.findByText("API available at page load");
    expect(screen.queryByRole("link", { name: "Sign in to the portfolio API" })).not.toBeInTheDocument();
    for (const [label, value] of [["Name", "Recruiter Name"], ["Email", "recruiter@example.com"], ["Company", "Example Company"], ["Position", "Developer"], ["Message", "Please discuss this application development opportunity."]]) {
      await user.type(screen.getByLabelText(new RegExp(label)), value);
    }
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Send message" }));
    const recovery = await screen.findByRole("link", { name: "Sign in to the portfolio API" });
    expect(recovery).toHaveAttribute("href", "http://localhost:8787/api/health");
    expect(recovery).toHaveAttribute("target", "_blank");
    expect(recovery).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText(/Message/)).toHaveValue("Please discuss this application development opportunity.");
    expect(screen.getByRole("alert")).toHaveTextContent("then return and reload this page");
    unmount();
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ status: "ok", service: "portfolio-api", timestamp: new Date().toISOString() }));
    render(<><ContactForm /><ApiStatus /></>);
    await screen.findByText("API available at page load");
    expect(screen.queryByRole("link", { name: "Sign in to the portfolio API" })).not.toBeInTheDocument();
  });

  it("requires company and position and focuses the first invalid field", async () => {
    render(<ContactForm />);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByLabelText(/Name/)).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent("company");
    expect(screen.getByRole("alert")).toHaveTextContent("position");
    expect(mocks.submitContact).not.toHaveBeenCalled();
  });

  it("clears a resolved security-check validation error", async () => {
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(screen.getByLabelText(/Name/), "Recruiter Name");
    await user.type(screen.getByLabelText(/Email/), "recruiter@example.com");
    await user.type(screen.getByLabelText(/Company/), "Example Company");
    await user.type(screen.getByLabelText(/Position/), "Data Engineer");
    await user.type(screen.getByLabelText(/Message/), "I would like to discuss this role with you.");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByRole("alert")).toHaveTextContent("security check");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.queryByText("Complete the security check before sending.")).not.toBeInTheDocument();
  });

  it("submits all required fields and reports confirmation", async () => {
    mocks.submitContact.mockResolvedValueOnce({
      ok: true,
      message: "Thanks. Your message was sent, and a confirmation email is on its way.",
    });
    const user = userEvent.setup();
    render(<ContactForm />);

    await user.type(screen.getByLabelText(/Name/), "Recruiter Name");
    await user.type(screen.getByLabelText(/Email/), "recruiter@example.com");
    await user.type(screen.getByLabelText(/Company/), "Example Company");
    await user.type(screen.getByLabelText(/Position/), "Data Engineer");
    await user.type(screen.getByLabelText(/Message/), "I would like to discuss this role with you.");
    await user.click(screen.getByRole("button", { name: "Complete security check" }));
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(mocks.submitContact).toHaveBeenCalledWith(
      expect.objectContaining({
        company: "Example Company",
        position: "Data Engineer",
        turnstileToken: "verified-token",
      }),
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText(/confirmation email is on its way/i)).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/api";
import { OwnerPage } from "./OwnerPage";

const api = vi.hoisted(() => ({
  contacts: vi.fn(),
  bookings: vi.fn(),
  settings: vi.fn(),
  setContactStatus: vi.fn(),
  retryContact: vi.fn(),
  deleteContact: vi.fn(),
  addBooking: vi.fn(),
  deleteBooking: vi.fn(),
  setAiEnabled: vi.fn(),
  exportHistory: vi.fn(),
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/api")>(),
  ownerApi: api,
}));

const contact = {
  submissionId: "c1", name: "Recruiter", email: "r@example.com", company: "Acme", position: "Developer",
  message: "Hello from Acme.", status: "new", ownerNotification: "pending", confirmation: "pending", submittedAt: "2026-09-29T10:00:00Z",
};
const booking = {
  bookingUid: "b1", previousBookingUid: "b0", name: "Hiring Manager", email: "h@example.com",
  startAt: "2026-10-01T15:00:00Z", endAt: "2026-10-01T15:30:00Z", status: "booked", source: "manual", updatedAt: "2026-09-29T10:00:00Z",
};

describe("OwnerPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(api)) mock.mockReset().mockResolvedValue({ ok: true });
    api.contacts.mockResolvedValue({ contacts: [contact] });
    api.bookings.mockResolvedValue({ bookings: [booking] });
    api.settings.mockResolvedValue({ aiEnabled: true, deploymentAiEnabled: false });
    api.exportHistory.mockResolvedValue({ contacts: [] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    URL.createObjectURL = vi.fn().mockReturnValue("blob:export");
    URL.revokeObjectURL = vi.fn();
  });

  it("lists history and runs owner actions", async () => {
    const user = userEvent.setup();
    render(<OwnerPage />);

    expect(await screen.findByText("Hello from Acme.")).toBeInTheDocument();
    expect(screen.getByText(/manual entry/)).toBeInTheDocument();
    expect(screen.getByText(/also disabled by deployment setting/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox"), "replied");
    expect(api.setContactStatus).toHaveBeenCalledWith("c1", "replied");
    await user.click(screen.getByRole("button", { name: "Retry email" }));
    expect(api.retryContact).toHaveBeenCalledWith("c1");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(api.deleteContact).toHaveBeenCalledWith("c1");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(api.deleteBooking).toHaveBeenCalledWith("b1");
    await user.click(screen.getByRole("checkbox"));
    expect(api.setAiEnabled).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Export JSON" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());

    await user.type(screen.getByLabelText("Name"), "New Contact");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Start"), "2026-10-02T10:00");
    await user.type(screen.getByLabelText("End"), "2026-10-02T10:30");
    await user.click(screen.getByRole("button", { name: "Add booking" }));
    expect(api.addBooking).toHaveBeenCalledWith(expect.objectContaining({ name: "New Contact", email: "new@example.com" }));
    expect(await screen.findByText("Booking added.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Search/), "acme");
    await waitFor(() => expect(api.contacts).toHaveBeenLastCalledWith("acme"));
  });

  it("offers sign-in when Access blocks the API and reports failed actions", async () => {
    api.contacts.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<OwnerPage />);
    expect(await screen.findByRole("link", { name: "Sign in to the owner API" })).toHaveAttribute(
      "href", "http://localhost:8787/api/owner/settings");
  });

  it("shows action errors", async () => {
    api.deleteContact.mockRejectedValue(new ApiRequestError(500, { error: "internal_error", message: "Delete failed." }));
    const user = userEvent.setup();
    render(<OwnerPage />);
    await screen.findByText("Hello from Acme.");
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(await screen.findByText("Delete failed.")).toBeInTheDocument();
  });

  it("shows a provider failure when a retry was not delivered", async () => {
    api.retryContact.mockResolvedValue({ ok: false, message: "Delivery failed and will be retried." });
    const user = userEvent.setup();
    render(<OwnerPage />);
    await screen.findByText("Hello from Acme.");

    await user.click(screen.getByRole("button", { name: "Retry email" }));

    expect(await screen.findByText("Delivery failed and will be retried.")).toBeInTheDocument();
  });

  it("does not let an older search response replace newer results", async () => {
    let resolveInitial: ((value: { contacts: (typeof contact)[] }) => void) | undefined;
    api.contacts.mockImplementation((query: string) => query
      ? Promise.resolve({ contacts: [{ ...contact, submissionId: "new", message: "Newest result" }] })
      : new Promise((resolve) => { resolveInitial = resolve; }));
    render(<OwnerPage />);
    await waitFor(() => expect(api.contacts).toHaveBeenCalledWith(""));

    fireEvent.change(screen.getByLabelText(/Search/), { target: { value: "acme" } });
    await act(async () => resolveInitial?.({ contacts: [{ ...contact, message: "Stale result" }] }));
    expect(screen.queryByText("Stale result")).not.toBeInTheDocument();
    expect(await screen.findByText("Newest result")).toBeInTheDocument();

    expect(screen.getByText("Newest result")).toBeInTheDocument();
  });

  it("renders completed delivery and provider bookings without pending labels", async () => {
    api.contacts.mockResolvedValue({ contacts: [{ ...contact, ownerNotification: "sent", confirmation: "sent" }] });
    api.bookings.mockResolvedValue({ bookings: [{ ...booking, previousBookingUid: null, source: "cal" }] });
    api.settings.mockResolvedValue({ aiEnabled: false, deploymentAiEnabled: true });
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup();
    render(<OwnerPage />);

    expect(await screen.findByText("Hello from Acme.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry email" })).not.toBeInTheDocument();
    expect(screen.queryByText(/also disabled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/manual entry|rescheduled from/)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    expect(api.deleteContact).not.toHaveBeenCalled();
  });

  it("uses fallback messages for non-error failures", async () => {
    api.contacts.mockRejectedValue("load failed");
    render(<OwnerPage />);

    expect(await screen.findByText("Owner tools are unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to the owner API" })).not.toBeInTheDocument();
  });
});

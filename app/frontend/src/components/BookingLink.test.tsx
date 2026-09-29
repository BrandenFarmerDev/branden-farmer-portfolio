import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingLink } from "./BookingLink";

const mocks = vi.hoisted(() => ({
  calApi: vi.fn(),
  getCalApi: vi.fn(),
}));

vi.mock("@calcom/embed-react", () => ({
  getCalApi: mocks.getCalApi,
}));

describe("BookingLink", () => {
  beforeEach(() => {
    mocks.calApi.mockReset();
    Object.assign(mocks.calApi, { instance: {} });
    mocks.getCalApi.mockResolvedValue(mocks.calApi);
  });

  it("opens the Cal dialog without also following the fallback link", async () => {
    render(<BookingLink />);
    await waitFor(() => expect(mocks.getCalApi).toHaveBeenCalled());
    const link = screen.getByRole("link", { name: /Book an interview/ });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });

    expect(link.dispatchEvent(click)).toBe(false);
    expect(mocks.calApi).toHaveBeenCalledWith("modal", expect.objectContaining({
      calLink: "branden-farmer-live.com-vhpkbs/recruiter-conversation",
    }));
  });

  it("keeps the external Cal URL as the fallback", () => {
    mocks.getCalApi.mockRejectedValueOnce(new Error("offline"));
    render(<BookingLink />);

    expect(screen.getByRole("link", { name: /Book an interview/ })).toHaveAttribute(
      "href",
      "https://cal.com/branden-farmer-live.com-vhpkbs/recruiter-conversation",
    );
  });

  it("leaves modified clicks to the browser", async () => {
    render(<BookingLink />);
    await waitFor(() => expect(mocks.getCalApi).toHaveBeenCalled());
    const link = screen.getByRole("link", { name: /Book an interview/ });

    fireEvent.click(link, { ctrlKey: true });
    expect(mocks.calApi).not.toHaveBeenCalledWith("modal", expect.anything());
  });
});

import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "./TurnstileWidget";

describe("TurnstileWidget", () => {
  afterEach(() => {
    delete window.turnstile;
    document.getElementById("cloudflare-turnstile-script")?.remove();
  });

  it("renders a bounded contact action and removes the widget on cleanup", async () => {
    let callbacks: TurnstileRenderOptions | undefined;
    const remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_container, options) => {
        callbacks = options;
        return "widget-1";
      }),
      remove,
    };
    const onToken = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key" resetKey={0} onToken={onToken} onError={onError} />,
    );

    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    expect(callbacks).toEqual(expect.objectContaining({ sitekey: "site-key", action: "contact_form" }));
    callbacks?.callback("token");
    expect(onToken).toHaveBeenCalledWith("token");

    callbacks?.["expired-callback"]();
    expect(onError).toHaveBeenCalledWith("The security check expired. Please complete it again.");
    callbacks?.["error-callback"]("110200");
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("not authorized"));
    callbacks?.["error-callback"]("unknown");
    expect(onError).toHaveBeenCalledWith("The security check could not be completed. Please try again.");

    unmount();
    expect(remove).toHaveBeenCalledWith("widget-1");
  });

  it("reports a missing site key", () => {
    const onError = vi.fn();
    render(<TurnstileWidget siteKey="" resetKey={0} onToken={vi.fn()} onError={onError} />);

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("not configured"));
  });

  it("loads the Turnstile script once and renders after it becomes available", async () => {
    const renderWidget = vi.fn().mockReturnValue("widget-2");
    const onError = vi.fn();
    render(<TurnstileWidget siteKey="site-key" resetKey={1} onToken={vi.fn()} onError={onError} />);
    const script = document.getElementById("cloudflare-turnstile-script");

    expect(script).toHaveAttribute("src", "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    window.turnstile = { render: renderWidget, remove: vi.fn() };
    fireEvent.load(script as HTMLScriptElement);

    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
  });

  it("removes a failed script so a reset can retry loading", async () => {
    const onError = vi.fn();
    const { rerender } = render(
      <TurnstileWidget siteKey="site-key" resetKey={1} onToken={vi.fn()} onError={onError} />,
    );
    const failedScript = document.getElementById("cloudflare-turnstile-script") as HTMLScriptElement;

    fireEvent.error(failedScript);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("could not load")));
    expect(document.getElementById("cloudflare-turnstile-script")).not.toBeInTheDocument();

    rerender(<TurnstileWidget siteKey="site-key" resetKey={2} onToken={vi.fn()} onError={onError} />);
    const replacementScript = document.getElementById("cloudflare-turnstile-script") as HTMLScriptElement;
    expect(replacementScript).not.toBe(failedScript);

    const renderWidget = vi.fn().mockReturnValue("widget-retry");
    window.turnstile = { render: renderWidget, remove: vi.fn() };
    fireEvent.load(replacementScript);

    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
  });
});

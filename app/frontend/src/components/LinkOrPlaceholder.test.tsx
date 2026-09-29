import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkOrPlaceholder } from "./LinkOrPlaceholder";

describe("LinkOrPlaceholder", () => {
  it("renders external links safely", () => {
    render(<LinkOrPlaceholder link={{ label: "GitHub", href: "https://github.com/example", placeholder: "Missing" }} />);

    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("target", "_blank");
  });

  it("keeps direct links in the current context", () => {
    render(<LinkOrPlaceholder link={{ label: "Email", href: "mailto:person@example.com", placeholder: "Missing" }} />);

    expect(screen.getByRole("link", { name: "Email" })).not.toHaveAttribute("target");
  });

  it("does not make missing or unsupported destinations clickable", () => {
    const { rerender } = render(<LinkOrPlaceholder link={{ label: "Missing", href: "", placeholder: "Not ready" }} />);
    expect(screen.queryByRole("link", { name: /Missing/ })).not.toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();

    rerender(<LinkOrPlaceholder link={{ label: "Unsafe", href: "javascript:alert(1)", placeholder: "Not ready" }} />);
    expect(screen.queryByRole("link", { name: /Unsafe/ })).not.toBeInTheDocument();
  });
});

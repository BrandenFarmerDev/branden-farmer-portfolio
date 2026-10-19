import type { ComponentProps } from "react";
import { cx } from "../model/cx";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: "primary" | "secondary" | "quiet" | "destructive";
  size?: "compact" | "default";
  iconOnly?: boolean;
}

export function Button({ variant = "secondary", size = "default", iconOnly = false, type = "button", className, children, ...rest }: ButtonProps) {
  return <button {...rest} type={type} className={cx("qe-button", className)} data-variant={variant} data-size={size} data-icon-only={iconOnly || undefined}>
    <span className="qe-button-label">{children}</span>
  </button>;
}

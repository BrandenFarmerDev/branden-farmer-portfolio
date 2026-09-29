import { ExternalLink } from "lucide-react";
import type { EditableLink } from "../content/site";

interface LinkOrPlaceholderProps {
  link: EditableLink;
  variant?: "button" | "text";
}

type LinkKind = "external" | "direct" | "unsupported";

function getLinkKind(href: string): LinkKind {
  if (/^https?:\/\//i.test(href)) return "external";
  if (/^(mailto:|tel:)/i.test(href) || href.startsWith("/")) return "direct";
  return "unsupported";
}

export function LinkOrPlaceholder({ link, variant = "text" }: LinkOrPlaceholderProps) {
  const className = variant === "button" ? "button button-secondary" : "text-link";
  const linkKind = link.href ? getLinkKind(link.href) : "unsupported";

  if (!link.href || linkKind === "unsupported") {
    return (
      <span className={`${className} is-placeholder`} title={link.placeholder}>
        {link.label}
        <span className="placeholder-label">Not configured</span>
      </span>
    );
  }

  return (
    <a
      className={className}
      href={link.href}
      target={linkKind === "external" ? "_blank" : undefined}
      rel={linkKind === "external" ? "noopener noreferrer" : undefined}
    >
      {link.label}
      {linkKind === "external" ? (
        <>
          <ExternalLink aria-hidden="true" size={15} />
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      ) : null}
    </a>
  );
}

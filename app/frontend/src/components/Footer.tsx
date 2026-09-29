import { ApiStatus } from "./ApiStatus";
import { LinkOrPlaceholder } from "./LinkOrPlaceholder";
import { siteContent } from "../content/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <strong>{siteContent.name}</strong>
          <p>Operations, data, and software.</p>
        </div>
        <nav className="footer-links" aria-label="External links">
          <LinkOrPlaceholder link={siteContent.links.github} />
          <LinkOrPlaceholder link={siteContent.links.linkedin} />
          <LinkOrPlaceholder link={siteContent.links.email} />
        </nav>
        <ApiStatus />
      </div>
    </footer>
  );
}

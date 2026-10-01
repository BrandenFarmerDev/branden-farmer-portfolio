import { CodeXml, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { siteContent } from "../content/site";

const navigation = [
  ["Work", "/work"],
  ["About", "/about"],
  ["Résumé", "/resume"],
  ["Contact", "/contact"],
] as const;

type ThemePreference = "light" | "dark" | "system";

// Keep the storage key in sync with the pre-paint script in index.html.
const THEME_STORAGE_KEY = "portfolio-theme";

function getInitialPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Storage can be blocked; fall back to the system theme.
  }
  return "system";
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState(getInitialPreference);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // The preference still applies for this page view.
    }
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = themePreference === "system"
        ? (systemDark.matches ? "dark" : "light")
        : themePreference;
    };

    applyTheme();
    if (themePreference !== "system") return;
    systemDark.addEventListener("change", applyTheme);
    return () => systemDark.removeEventListener("change", applyTheme);
  }, [themePreference]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label={`${siteContent.name}, home`} onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">{siteContent.shortName}</span>
          <span>{siteContent.name}</span>
        </Link>

        <button
          ref={menuButtonRef}
          className="icon-button menu-button"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav
          id="primary-navigation"
          className={menuOpen ? "primary-nav is-open" : "primary-nav"}
          aria-label="Primary navigation"
        >
          {navigation.map(([label, path]) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => (isActive ? "active" : undefined)}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            className={({ isActive }) => isActive ? "ask-link active" : "ask-link"}
            to="/ask"
            onClick={() => setMenuOpen(false)}
          >
            Ask Branden
          </NavLink>
          <a
            className="header-github-link"
            href={siteContent.links.github.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Branden Farmer on GitHub (opens in a new tab)"
          >
            <CodeXml aria-hidden="true" size={17} />
            <span className="header-github-label">GitHub</span>
          </a>
          <label className="sr-only" htmlFor="theme-select">Color theme</label>
          <select
            id="theme-select"
            className="theme-select"
            value={themePreference}
            onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
          >
            <option value="system">System theme</option>
            <option value="light">Light theme</option>
            <option value="dark">Dark theme</option>
          </select>
        </nav>
      </div>
    </header>
  );
}

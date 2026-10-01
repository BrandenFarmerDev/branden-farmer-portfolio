import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Scrolls to, highlights, and focuses the element named by the URL fragment once the page has rendered. */
export function useHashTarget() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;

    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }

    const target = document.getElementById(id);
    if (!target) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      return;
    }

    const group = SAFE_ID.test(id) ? Array.from(document.querySelectorAll<HTMLElement>(`[data-passage="${id}"]`)) : [];
    const highlighted = group.length > 0 ? group : [target];
    highlighted.forEach((element) => element.setAttribute("data-hash-active", ""));
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.scrollIntoView({ block: "start" });
    target.focus({ preventScroll: true });

    return () => highlighted.forEach((element) => element.removeAttribute("data-hash-active"));
  }, [hash]);
}

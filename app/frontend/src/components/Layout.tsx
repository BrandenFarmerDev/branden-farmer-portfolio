import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const initialRenderRef = useRef(true);

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" });

    const routeMeta: Record<string, { title: string; description: string }> = {
      "/": {
        title: "Branden Farmer | Operations, data, and software",
        description: "Branden Farmer builds practical software at the intersection of operations, data, and application development.",
      },
      "/work": {
        title: "Work | Branden Farmer",
        description: "Portfolio projects connecting workflow design, data structure, and application engineering.",
      },
      "/about": {
        title: "About | Branden Farmer",
        description: "Branden Farmer's progression from manufacturing and planning into business intelligence and application development.",
      },
      "/resume": {
        title: "Résumé | Branden Farmer",
        description: "Digital résumé covering operations, planning, business intelligence, data engineering, automation, and application development.",
      },
      "/contact": {
        title: "Contact | Branden Farmer",
        description: "Contact Branden Farmer by secure form, email, LinkedIn, GitHub, or recruiter interview booking.",
      },
      "/ask": {
        title: "Ask Branden | Planned portfolio assistant",
        description: "A transparent preview of the planned evidence-grounded Ask Branden assistant.",
      },
    };
    const meta = routeMeta[location.pathname] ?? routeMeta["/"];
    document.title = meta.title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", meta.description);

    if (initialRenderRef.current) initialRenderRef.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [location.hash, location.pathname]);

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Header />
      <main ref={mainRef} id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

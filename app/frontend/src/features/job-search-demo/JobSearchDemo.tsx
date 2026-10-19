import { useEffect } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { PageHeader } from "./components/PageHeader";
import { Shell } from "./components/Shell";
import { demoPath } from "./model/routes";
import { AboutPage } from "./pages/AboutPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SourcesPage } from "./pages/SourcesPage";
import { DemoProvider } from "./state/DemoProvider";
import "./demo.css";

const description = "An interactive Job Search Intelligence demo with fictional data and no login: overview analytics, application timelines, review decisions and simulated sources.";

function NotFoundPage() {
  return <>
    <PageHeader title="Page not found" description="This page is not part of the demo." />
    <p><Link className="qe-button" data-variant="primary" to={demoPath()}>Return to the overview</Link></p>
  </>;
}

/** Client-only entry for /projects/job-search-intelligence/*. Everything it needs ships in this lazy chunk. */
export function JobSearchDemo() {
  useEffect(() => {
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", description);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    canonical?.setAttribute("href", `https://brandenfarmer.com${demoPath()}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  return <DemoProvider>
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<OverviewPage />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </DemoProvider>;
}

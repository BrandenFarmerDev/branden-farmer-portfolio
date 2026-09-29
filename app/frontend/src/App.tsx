import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";

const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const WorkPage = lazy(() => import("./pages/WorkPage").then((module) => ({ default: module.WorkPage })));
const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({ default: module.AboutPage })));
const ResumePage = lazy(() => import("./pages/ResumePage").then((module) => ({ default: module.ResumePage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const AskPage = lazy(() => import("./pages/AskPage").then((module) => ({ default: module.AskPage })));

function RouteFallback() {
  return <p className="route-loading" role="status">Loading pageâ€¦</p>;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<Suspense fallback={<RouteFallback />}><HomePage /></Suspense>} index />
        <Route path="work" element={<Suspense fallback={<RouteFallback />}><WorkPage /></Suspense>} />
        <Route path="about" element={<Suspense fallback={<RouteFallback />}><AboutPage /></Suspense>} />
        <Route path="resume" element={<Suspense fallback={<RouteFallback />}><ResumePage /></Suspense>} />
        <Route path="contact" element={<Suspense fallback={<RouteFallback />}><ContactPage /></Suspense>} />
        <Route path="ask" element={<Suspense fallback={<RouteFallback />}><AskPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

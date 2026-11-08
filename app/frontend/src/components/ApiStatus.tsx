import { useEffect, useState } from "react";
import { apiBaseUrl, getApiHealth } from "../lib/api";

export function ApiSignInRecovery() {
  return <span>If your API session expired, <a href={`${apiBaseUrl}/api/health`} target="_blank" rel="noopener noreferrer">Sign in to the portfolio API</a> in a separate tab, then return and reload this page.</span>;
}

export function ApiStatus() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getApiHealth(controller.signal)
      .then(() => setAvailable(true))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setAvailable(false);
      });
    return () => controller.abort();
  }, []);

  const label = available === null ? "Checking API" : available ? "API available at page load" : "API unavailable";

  return (
    <span className="api-status" title="Cloudflare Worker status when this page loaded">
      <span className={available ? "status-dot is-online" : "status-dot"} aria-hidden="true" />
      <span>{label}</span>
      {available === false ? <> · <ApiSignInRecovery /></> : null}
    </span>
  );
}

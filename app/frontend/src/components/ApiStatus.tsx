import { useEffect, useState } from "react";
import { getApiHealth } from "../lib/api";

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

  const label = available === null ? "Checking API" : available ? "API connected" : "API unavailable";

  return (
    <span className="api-status" title="Cloudflare Worker status">
      <span className={available ? "status-dot is-online" : "status-dot"} aria-hidden="true" />
      {label}
    </span>
  );
}

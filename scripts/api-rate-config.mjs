import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unstable_readConfig } from "wrangler";

// This is the reviewed Free-zone request contract, not a general infrastructure manager.
export function validateApiRateConfig(config) {
  assert.deepEqual(config, {
    zone_id: "5eb81d7cb45f570b20e2e301f1003897",
    phase: "http_ratelimit",
    rule: {
      description: "API request burst protection",
      expression: '(http.request.uri.path eq "/api" or starts_with(http.request.uri.path, "/api/"))',
      action: "block",
      enabled: false,
      ratelimit: {
        characteristics: ["cf.colo.id", "ip.src"],
        period: 10,
        requests_per_period: 120,
        mitigation_timeout: 10,
      },
    },
  }, "WAF candidate must match the reviewed disabled Free-zone contract");
}

export function validateWorkerRateConfig(config, environment) {
  const namespaces = { "": ["1001", "1003", "2001"], preview: ["1005", "1006", "2002"], production: ["1002", "1004", "2003"] };
  const ids = namespaces[environment];
  assert.ok(ids, "unknown Worker environment");
  assert.deepEqual(structuredClone(config.ratelimits), [
    { name: "CONTACT_RATE_LIMITER", namespace_id: ids[0], simple: { limit: 5, period: 60 } },
    { name: "ASK_RATE_LIMITER", namespace_id: ids[1], simple: { limit: 3, period: 60 } },
    { name: "API_RATE_LIMITER", namespace_id: ids[2], simple: { limit: 300, period: 60 } },
  ], "native limits and environment namespaces must preserve the reviewed policy");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(structuredClone(config.observability), {
    enabled: false, redact_query_string: true,
    logs: { enabled: false, invocation_logs: false, head_sampling_rate: 0.01 },
    traces: { enabled: false },
  }, "collection must remain disabled pending release privacy evidence");
}

export function readWorkerRateConfig(environment) {
  return unstable_readConfig({ config: fileURLToPath(new URL("../app/backend/wrangler.toml", import.meta.url)), env: environment });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateApiRateConfig(JSON.parse(readFileSync(new URL("../docs/api-rate-protection-waf.json", import.meta.url), "utf8")));
  for (const environment of ["", "preview", "production"]) validateWorkerRateConfig(readWorkerRateConfig(environment), environment);
  console.log("Disabled WAF desired state and all three Worker environment policies validated.");
}

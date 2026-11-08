import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readWorkerRateConfig, validateApiRateConfig, validateWorkerRateConfig } from "./api-rate-config.mjs";

const candidate = () => JSON.parse(readFileSync(new URL("../docs/api-rate-protection-waf.json", import.meta.url), "utf8"));
test("accepts the disabled API-wide Free-zone candidate", () => {
  assert.doesNotThrow(() => validateApiRateConfig(candidate()));
});
for (const [name, change] of [
  ["premature activation", c => { c.rule.enabled = true; }],
  ["host-based paid scope", c => { c.rule.expression += ' and http.host eq "api.example"'; }],
  ["incomplete API scope", c => { c.rule.expression = 'starts_with(http.request.uri.path, "/api/")'; }],
  ["a second rule", c => { c.rules = [c.rule, c.rule]; }],
  ["custom edge response", c => { c.rule.action_parameters = { response: { status_code: 429 } }; }],
  ["bot exemption", c => { c.rule.expression += " and not cf.client.bot"; }],
  ["caller-controlled counter", c => { c.rule.ratelimit.characteristics.push("http.request.headers.x-user"); }],
  ["long mitigation", c => { c.rule.ratelimit.mitigation_timeout = 60; }],
  ["different zone", c => { c.zone_id = "other"; }],
]) {
  test(`rejects ${name}`, () => {
    const config = candidate(); change(config);
    assert.throws(() => validateApiRateConfig(config));
  });
}

for (const environment of ["", "preview", "production"]) {
  test(`validates loaded ${environment || "local"} policy and rejects bypass/namespace/privacy drift`, () => {
    const config = readWorkerRateConfig(environment);
    assert.doesNotThrow(() => validateWorkerRateConfig(config, environment));
    for (const mutate of [
      c => { c.ratelimits.pop(); },
      c => { c.ratelimits[0].simple.limit = 300; },
      c => { c.ratelimits[2].namespace_id = c.ratelimits[0].namespace_id; },
      c => { c.ratelimits[2].simple.limit = 301; },
      c => { c.workers_dev = true; },
      c => { c.preview_urls = true; },
      c => { c.observability.logs.invocation_logs = true; },
      c => { c.observability.enabled = true; },
      c => { c.observability.traces.enabled = true; },
    ]) {
      const changed = structuredClone(config); mutate(changed);
      assert.throws(() => validateWorkerRateConfig(changed, environment));
    }
  });
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAccessConfig } from "./access-config.mjs";

const candidate = () => JSON.parse(readFileSync("docs/visitor-access-config.json", "utf8"));
test("prepared configuration preserves owner privacy, OTP, sessions, machine authority and all host boundaries", () => {
  assert.doesNotThrow(() => validateAccessConfig(candidate()));
});
test("rejects the GET-only null inactivity shape instead of inventing enforcement defaults", () => {
  const config = candidate();
  config.organization_request.service_token_inactivity = { enabled: false, inactivity_threshold_days: null, action: null };
  assert.throws(() => validateAccessConfig(config), /optional unconfigured inactivity/);
});
for (const [name, mutate] of [
  ["a private deployment wildcard moved to visitor authority", c => {
    const owner = c.new_apps_to_create.find(a => a.role === "owner");
    const visitor = c.new_apps_to_create.find(a => a.role === "visitor");
    visitor.request.destinations.push(owner.request.destinations.pop());
  }],
  ["a missing production portfolio owner API destination", c => {
    c.existing_apps_to_update.find(a => a.id === "db977420-b11d-4c07-8340-42271473755c").request.destinations.pop();
  }],
  ["a legacy owner policy substituted consistently across the candidate", c => {
    const prepared = c.human_policies.owner.id;
    c.human_policies.owner.id = c.rollback_owner_policy_id;
    for (const app of [...c.existing_apps_to_update, ...c.new_apps_to_create]) {
      for (const reference of app.request.policies) if (reference.id === prepared) reference.id = c.rollback_owner_policy_id;
    }
  }],
  ["a preview API hostname routed to the production Worker", c => {
    c.worker_inventory.find(w => w.hostname === "jobs-api-test.brandenfarmer.com").worker = "job-search-intelligence-api";
  }],
]) {
  test(`rejects ${name}`, () => {
    const config = candidate();
    mutate(config);
    assert.throws(() => validateAccessConfig(config));
  });
}
test("rejects human policy broadening, missing OTP/US, session and WARP bypass changes", () => {
  for (const mutate of [
    c => { c.human_policies.owner.request.include = [{ everyone: {} }]; },
    c => { c.human_policies.owner.request.require.shift(); },
    c => { c.human_policies.visitor.request.require = []; },
    c => { c.existing_apps_to_update[0].request.allowed_idps = []; },
    c => { c.existing_apps_to_update[0].request.allow_authenticate_via_warp = true; },
    c => { c.organization_request.session_duration = "12h"; },
    c => { c.human_policies.owner.request.session_duration = "12h"; },
    c => { c.new_apps_to_create[0].request.policies = [{ id: c.jobs_machine_policy_update.id, precedence: 1 }]; },
    c => { c.existing_apps_to_update[0].role = "visitor"; },
  ]) { const config = candidate(); mutate(config); assert.throws(() => validateAccessConfig(config)); }
});
test("rejects machine identity changes, missing off-zone geography and authority extension", () => {
  for (const mutate of [
    c => { c.jobs_machine_policy_update.request.require = []; },
    c => { c.jobs_machine_policy_update.request.include = [{ any_valid_service_token: {} }]; },
    c => { c.jobs_machine_policy_update.request.session_duration = "24h"; },
    c => { c.jobs_machine_policy_update.worker_contract.subject = "owner"; },
  ]) { const config = candidate(); mutate(config); assert.throws(() => validateAccessConfig(config)); }
});
test("rejects missing aliases, host scope changes, disabled-origin bypasses and premature WAF activation", () => {
  for (const mutate of [
    c => { c.waf_stages[0].hosts.pop(); },
    c => { c.waf_stages[0].request.enabled = true; },
    c => { c.waf_stages[0].request.expression = "true"; },
    c => { c.worker_inventory[0].workers_dev = true; },
    c => { c.pages_inventory[0].wildcard = "other.pages.dev"; },
    c => { c.new_apps_to_create[2].request.destinations.pop(); },
    c => { c.new_apps_to_create[0].request.destinations.push({ type: "public", uri: "unreviewed.example" }); },
    c => { c.cal_transport.destinations.push("api.brandenfarmer.com/api/owner"); },
  ]) { const config = candidate(); mutate(config); assert.throws(() => validateAccessConfig(config)); }
});

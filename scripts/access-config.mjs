import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const customHosts = {
  portfolio: { preview: ["preview.brandenfarmer.com", "api-preview.brandenfarmer.com"], production: ["brandenfarmer.com", "www.brandenfarmer.com", "api.brandenfarmer.com"] },
  jobs: { preview: ["jobs-test.brandenfarmer.com", "jobs-api-test.brandenfarmer.com"], production: ["jobs.brandenfarmer.com", "jobs-api.brandenfarmer.com"] },
  municipal: { preview: ["capital-test.brandenfarmer.com", "capital-api-test.brandenfarmer.com"], production: ["capital.brandenfarmer.com", "capital-api.brandenfarmer.com"] },
};
const existingApps = {
  "243a269b-a9da-4adb-926d-6a783bd58a5e": ["jobs", "production", "0437e387d1f293f375b086ed18e6dcbb70448a03cbf9814ba8ed2196b097fab8"],
  "edb7d94d-dac3-4b2f-ae5d-6e2f06c78b90": ["jobs", "preview", "e3bb7f883d8b3694227d6cd2296e5af91335b9ffe7836a7073fc2b5d7ce7c72a"],
  "6b52727c-5d1a-46c3-8c96-248601006162": ["municipal", "preview", "3c357e8babb46f9615d2dc564ef7e526cdf002d91ac51dad75e82b83a58fe223"],
  "7dcaf0bf-6fcd-44ca-ad80-d5fcd015d858": ["municipal", "production", "513b2edf78733f77d95e90c59c7fd3d43cd8c5b150874282db44c6d17244557f"],
  "db977420-b11d-4c07-8340-42271473755c": ["portfolio", "production", "8dca71ab16ffff43fbb436291bae7b9756a4495a5e631c39ebea4226320df564"],
  "447184cc-a644-491d-a763-c63ef65ce833": ["portfolio", "preview", "14fecc1ea27133e0e949f3ed09435cc162fd35f6e44881942148b97dde024f9b"],
};
const us = { geo: { country_code: "US" } };
const servicePolicyId = "918c5c71-87e0-4743-98d9-5ef5c807c640";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function validateAccessConfig(config) {
  const otp = config.otp_provider.id;
  assert.match(otp, uuid);
  assert.equal(config.otp_provider.type, "onetimepin");
  assert.notEqual(otp, config.rollback_provider_id);
  assert.equal(config.organization_request.session_duration, "24h");
  assert.equal(config.organization_request.allow_authenticate_via_warp, false);
  const method = { login_method: { id: otp } };
  for (const [role, policy] of Object.entries(config.human_policies)) {
    assert.ok(["owner", "visitor"].includes(role));
    assert.match(policy.id, uuid);
    assert.equal(policy.request.decision, "allow");
    assert.equal(policy.request.session_duration, "24h");
    assert.deepEqual(policy.request.exclude, []);
    assert.deepEqual(policy.request.include, role === "owner" ? [{ email: { email: "branden_farmer@live.com" } }] : [method]);
    assert.deepEqual(policy.request.require, role === "owner" ? [method, us] : [us]);
  }
  assert.deepEqual(Object.keys(config.human_policies).sort(), ["owner", "visitor"]);
  assert.notEqual(config.human_policies.owner.id, config.human_policies.visitor.id);
  assert.deepEqual(config.existing_apps_to_update.map(a => a.id).sort(), Object.keys(existingApps).sort());
  const apps = [...config.existing_apps_to_update, ...config.new_apps_to_create];
  for (const app of apps) {
    const request = app.request;
    if (app.id) {
      assert.deepEqual([app.family, app.environment, app.preserve_aud], existingApps[app.id]);
      assert.equal(app.role, app.family === "portfolio" ? "owner" : "private");
      assert.ok(!("aud" in request) && !("id" in request), "read-only app identity must not enter PUT bodies");
    } else {
      assert.equal(app.family, "portfolio");
      assert.equal(app.role, app.environment === "deployment" ? "owner" : "visitor");
    }
    assert.equal(request.type, "self_hosted");
    assert.ok(request.domain);
    assert.deepEqual(request.allowed_idps, [otp]);
    assert.equal(request.session_duration, "24h");
    assert.equal(request.allow_authenticate_via_warp, false);
    assert.equal(request.http_only_cookie_attribute, true);
    const humanPolicy = config.human_policies[app.role === "visitor" ? "visitor" : "owner"].id;
    const references = [{ id: humanPolicy, precedence: 1 }];
    if (app.id === "243a269b-a9da-4adb-926d-6a783bd58a5e") references.push({ id: servicePolicyId, precedence: 2 });
    assert.deepEqual(request.policies, references, "only Jobs production may retain the existing machine policy");
  }
  const machine = config.jobs_machine_policy_update;
  assert.equal(machine.id, servicePolicyId);
  assert.equal(machine.request.decision, "non_identity");
  assert.deepEqual(machine.request.include, [{ service_token: { token_id: "f50e39f8-f375-4cd8-b48b-841bbcea2255" } }]);
  assert.deepEqual(machine.request.require, [us]);
  assert.equal(machine.request.session_duration, "12h", "do not extend the existing machine authority to the new human duration");
  assert.deepEqual(machine.worker_contract, { claim: "common_name", binding: "existing AUTOMATION_CLIENT_ID unchanged", subject: "", email_claim: "absent", token_type: "app" });
  const destinations = apps.flatMap(a => a.request.destinations.map(d => d.uri));
  const scope = Object.values(customHosts).flatMap(envs => Object.values(envs).flat());
  const allowedDestinations = new Set([
    ...scope.filter(h => h !== "www.brandenfarmer.com"),
    "brandenfarmer.com/owner", "api.brandenfarmer.com/api/owner",
    "preview.brandenfarmer.com/owner", "api-preview.brandenfarmer.com/api/owner",
    ...["branden-farmer-portfolio", "job-search-intelligence", "municipal-capital-project-tracker"].flatMap(project => [`${project}.pages.dev`, `*.${project}.pages.dev`, `preview.${project}.pages.dev`]),
  ]);
  for (const destination of destinations) assert.ok(allowedDestinations.has(destination), `Unreviewed destination ${destination}`);
  for (const host of scope.filter(h => h !== "www.brandenfarmer.com")) assert.ok(destinations.includes(host), `Missing ${host}`);
  assert.ok(!destinations.includes("www.brandenfarmer.com"), "www must stay redirect-only");
  assert.deepEqual(config.pages_inventory.map(p => p.project).sort(), ["branden-farmer-portfolio", "job-search-intelligence", "municipal-capital-project-tracker"].sort());
  for (const page of config.pages_inventory) {
    assert.equal(page.root, `${page.project}.pages.dev`);
    assert.equal(page.wildcard, `*.${page.project}.pages.dev`);
    assert.equal(page.preview_alias, `preview.${page.project}.pages.dev`);
    assert.ok(destinations.includes(page.root) && destinations.includes(page.wildcard), "Pages defaults and every deployment must be protected");
    assert.ok(destinations.includes(page.preview_alias) || page.family === "portfolio", "private preview alias must have an explicit app destination");
  }
  assert.deepEqual(config.worker_inventory.map(w => w.hostname).sort(), scope.filter(h => h.startsWith("api") || h.includes("-api")).sort());
  for (const worker of config.worker_inventory) assert.ok(worker.workers_dev === false && worker.preview_urls === false);
  assert.deepEqual(config.waf_stages.map(s => `${s.family}/${s.environment}`).sort(), Object.entries(customHosts).flatMap(([family, envs]) => Object.keys(envs).map(env => `${family}/${env}`)).sort());
  for (const stage of config.waf_stages) {
    assert.deepEqual([...stage.hosts].sort(), [...customHosts[stage.family][stage.environment]].sort());
    assert.equal(stage.request.enabled, false, "prepared WAF stages must not silently activate");
    assert.equal(stage.request.action, "block");
    assert.equal(stage.request.expression, `(http.host in {${stage.hosts.map(h => `"${h}"`).join(" ")}} and ip.src.country ne "US")`);
  }
  assert.equal(config.cal_transport.policy_to_create.decision, "bypass");
  assert.deepEqual(config.cal_transport.destinations, ["api.brandenfarmer.com/api/webhooks/cal", "api-preview.brandenfarmer.com/api/webhooks/cal"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  validateAccessConfig(JSON.parse(readFileSync("docs/visitor-access-config.json", "utf8")));
  console.info("OTP configuration invariants passed; this does not verify live activation.");
}

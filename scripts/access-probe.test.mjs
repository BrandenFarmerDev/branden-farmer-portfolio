import assert from "node:assert/strict";
import test from "node:test";
import { rolloutMode, verifyApiError, verifyResponse } from "./access-probe.mjs";

const target = "https://api.brandenfarmer.com/api/health";
test("bootstrap must be explicit, finite and within the frozen rollout window", () => {
  assert.equal(rolloutMode({ ACCESS_ROLLOUT_STATE: "enforced" }), "enforced");
  assert.equal(rolloutMode({ ACCESS_ROLLOUT_STATE: "bootstrap", ACCESS_BOOTSTRAP_DEADLINE: "2026-11-06T00:00:00Z" }, Date.parse("2026-11-05")), "bootstrap");
  for (const env of [{}, { ACCESS_ROLLOUT_STATE: "bootstrap" },
    { ACCESS_ROLLOUT_STATE: "bootstrap", ACCESS_BOOTSTRAP_DEADLINE: "2026-11-13" },
    { ACCESS_ROLLOUT_STATE: "bootstrap", ACCESS_BOOTSTRAP_DEADLINE: "2026-11-04" }]) {
    assert.throws(() => rolloutMode(env, Date.parse("2026-11-05")), /bootstrap/);
  }
});
test("enforced probe accepts only the exact team and application challenge", async () => {
  const challenge = (location, status = 302) => new Response(null, { status, headers: { location } });
  await verifyResponse(challenge("https://cold-union-464d.cloudflareaccess.com/cdn-cgi/access/login/api.brandenfarmer.com?token=opaque"), target, "enforced", "health");
  for (const response of [Response.json({ status: "ok" }), new Response("blocked", { status: 403 }),
    challenge("https://evil.example/cdn-cgi/access/login/api.brandenfarmer.com"),
    challenge("https://cold-union-464d.cloudflareaccess.com/"),
    challenge("https://cold-union-464d.cloudflareaccess.com/cdn-cgi/access/login/other.example")]) {
    await assert.rejects(verifyResponse(response, target, "enforced", "health"), /Expected/);
  }
});
test("bootstrap rejects login HTML, redirects and malformed health", async () => {
  await verifyResponse(Response.json({ status: "ok", service: "portfolio-api", timestamp: "2026-11-05T00:00:00Z" }), target, "bootstrap", "health");
  for (const response of [new Response("<html>Login</html>"), Response.json({ status: "ok" }), new Response(null, { status: 302 })]) {
    await assert.rejects(verifyResponse(response, target, "bootstrap", "health"));
  }
  await verifyResponse(new Response('<title>Branden Farmer | Portfolio</title><script src="/assets/app.js">'), "https://brandenfarmer.com", "bootstrap", "site");
  await assert.rejects(verifyResponse(new Response("Access login"), "https://brandenfarmer.com", "bootstrap", "site"), /portfolio/);
});
test("bootstrap retains exact Ask validation and unsigned Cal signature configuration checks", async () => {
  for (const [status, error] of [[400, "validation_error"], [401, "invalid_signature"]]) {
    await verifyApiError(Response.json({ error }, { status }), status, error);
    for (const response of [Response.json({ error: "wrong_error" }, { status }),
      new Response("Access login"), new Response(null, { status: 403 }), new Response(null, { status: 302 })]) {
      await assert.rejects(verifyApiError(response, status, error));
    }
  }
});

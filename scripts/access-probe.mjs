import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const teamHost = "cold-union-464d.cloudflareaccess.com";
const bootstrapLimit = Date.parse("2026-11-12T08:00:00Z");

export function rolloutMode(env, now = Date.now()) {
  if (env.ACCESS_ROLLOUT_STATE === "enforced") return "enforced";
  const deadline = Date.parse(env.ACCESS_BOOTSTRAP_DEADLINE || "");
  if (env.ACCESS_ROLLOUT_STATE !== "bootstrap" || !Number.isFinite(deadline)
    || deadline > bootstrapLimit || now >= deadline) {
    throw new Error("Set ACCESS_ROLLOUT_STATE=enforced, or a bootstrap deadline no later than 2026-11-12T08:00:00Z. Expired bootstrap is forbidden.");
  }
  return "bootstrap";
}

export async function verifyResponse(response, target, mode, kind) {
  if (mode === "enforced") {
    const location = new URL(response.headers.get("location") || "/", target);
    if (response.status !== 302 || location.protocol !== "https:" || location.hostname !== teamHost
      || location.pathname !== `/cdn-cgi/access/login/${new URL(target).hostname}`) {
      throw new Error(`Expected the pinned Access login challenge for ${new URL(target).hostname}; received HTTP ${response.status}.`);
    }
    return;
  }
  if (response.status !== 200) throw new Error(`Bootstrap ${kind} returned HTTP ${response.status}.`);
  if (kind === "health") {
    const body = await response.json();
    if (body.status !== "ok" || body.service !== "portfolio-api" || !Number.isFinite(Date.parse(body.timestamp))) {
      throw new Error("Bootstrap health did not return the portfolio health contract.");
    }
  } else {
    const body = await response.text();
    if (!body.includes("<title>Branden Farmer") || !body.includes('/assets/')) {
      throw new Error("Bootstrap site did not return the portfolio application.");
    }
  }
}

export async function verifyApiError(response, status, error) {
  if (response.status !== status || (await response.json()).error !== error) {
    throw new Error(`Bootstrap API configuration must return HTTP ${status} ${error}.`);
  }
}

export async function probe(env = process.env) {
  const mode = rolloutMode(env);
  const preview = env.ACCESS_PROBE_ENVIRONMENT === "preview";
  if (!preview && env.ACCESS_PROBE_ENVIRONMENT !== "production") throw new Error("Unknown probe environment.");
  const site = preview ? "https://preview.brandenfarmer.com/" : "https://brandenfarmer.com/";
  const api = preview ? "https://api-preview.brandenfarmer.com/api/health" : "https://api.brandenfarmer.com/api/health";
  const targets = [[site, "site"], [api, "health"]];
  if (env.ACCESS_DEPLOYMENT_URL) {
    const deployment = new URL(env.ACCESS_DEPLOYMENT_URL);
    if (deployment.protocol !== "https:" || !/^[a-z0-9-]+\.branden-farmer-portfolio\.pages\.dev$/.test(deployment.hostname)
      || deployment.username || deployment.password || deployment.port || deployment.pathname !== "/" || deployment.search || deployment.hash) {
      throw new Error("Unexpected Pages deployment URL.");
    }
    targets.push([deployment.href, "site"]);
  }
  for (const [target, kind] of targets) {
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    await verifyResponse(response, target, mode, kind);
    console.info(`${mode}: verified ${target}`);
  }
  if (mode === "bootstrap") {
    const origin = new URL(site).origin;
    const apiOrigin = new URL(api).origin;
    const ask = await fetch(`${apiOrigin}/api/ask`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}",
      redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    await verifyApiError(ask, 400, "validation_error");
    const cal = await fetch(`${apiOrigin}/api/webhooks/cal`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    await verifyApiError(cal, 401, "invalid_signature");
  }
  console.info(mode === "enforced" ? "Signed-out Access boundary verified. Authenticated health and Cal delivery still require release checks." : "Finite bootstrap only: visitor protection is not active.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await probe(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

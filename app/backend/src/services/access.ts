import type { Env } from "../types";

interface Jwk extends JsonWebKey {
  kid?: string;
}

let keyCache: { team: string; expires: number; keys: Map<string, CryptoKey> } | undefined;

function decodeSegment(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function decodeJson(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(decodeSegment(segment))) as Record<string, unknown>;
}

async function signingKeys(team: string): Promise<Map<string, CryptoKey>> {
  if (keyCache?.team === team && keyCache.expires > Date.now()) return keyCache.keys;
  const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Access keys unavailable");
  const { keys } = await response.json<{ keys: Jwk[] }>();
  const imported = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid) continue;
    imported.set(jwk.kid, await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
  }
  keyCache = { team, expires: Date.now() + 60 * 60_000, keys: imported };
  return imported;
}

export function resetAccessKeyCache(): void {
  keyCache = undefined;
}

export async function verifyOwner(request: Request, env: Env): Promise<boolean> {
  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: audience, OWNER_EMAIL: owner } = env;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!team || !audience || !owner || !token) return false;

  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return false;
    const { alg, kid } = decodeJson(header);
    if (alg !== "RS256" || typeof kid !== "string") return false;
    const key = (await signingKeys(team)).get(kid);
    if (!key) return false;
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeSegment(signature),
      new TextEncoder().encode(`${header}.${payload}`));
    if (!valid) return false;

    const claims = decodeJson(payload);
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return claims.iss === `https://${team}`
      && audiences.includes(audience)
      && typeof claims.exp === "number" && claims.exp > now
      && (typeof claims.nbf !== "number" || claims.nbf <= now + 60)
      && typeof claims.email === "string" && claims.email.toLowerCase() === owner.toLowerCase();
  } catch {
    return false;
  }
}

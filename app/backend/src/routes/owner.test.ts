import type { OwnerBooking, OwnerContact } from "@portfolio/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccessKeyCache } from "../services/access";
import { createTestD1 } from "../test/sqlite-d1";
import type { Env } from "../types";
import { ownerRoute } from "./owner";

const team = "branden.cloudflareaccess.com";
const origin = "https://brandenfarmer.com";
let db: D1Database;
let close: () => void;
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function token(claims: Record<string, unknown> = {}): Promise<string> {
  const encode = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", kid: "key-1" })}.${encode({
    iss: `https://${team}`, aud: ["access-aud"], email: "Owner@Example.com", exp: Math.floor(Date.now() / 1000) + 300, ...claims,
  })}`;
  return `${unsigned}.${base64Url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsigned)))}`;
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    PORTFOLIO_DB: db, ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "access-aud", OWNER_EMAIL: "owner@example.com",
    ALLOWED_ORIGIN: origin, AI_ENABLED: "true", RESEND_API_KEY: "resend", CONTACT_FROM_EMAIL: "from@example.com",
    CONTACT_TO_EMAIL: "owner@example.com", ...overrides,
  };
}

async function call(path: string, init: RequestInit & { jwt?: string | null } = {}, config = env()) {
  const headers = new Headers(init.headers);
  const jwt = init.jwt === undefined ? await token() : init.jwt;
  if (jwt) headers.set("Cf-Access-Jwt-Assertion", jwt);
  if (init.method && init.method !== "GET") headers.set("Origin", headers.get("Origin") ?? origin);
  if (init.body) headers.set("Content-Type", "application/json");
  const url = new URL(`https://api.brandenfarmer.com${path}`);
  return ownerRoute(new Request(url, { ...init, headers }), config, url.pathname);
}

beforeEach(async () => {
  ({ db, close } = createTestD1());
  resetAccessKeyCache();
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = { ...await crypto.subtle.exportKey("jwk", pair.publicKey), kid: "key-1" } as JsonWebKey;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => String(url).includes("/cdn-cgi/access/certs")
    ? Response.json({ keys: [publicJwk] })
    : Response.json({ id: "email" })));
  await db.prepare(`INSERT INTO contact_submissions (submission_id, name, email, company, position, message, submitted_at, last_interaction_at)
    VALUES ('c1', 'Recruiter', 'recruiter@example.com', 'Acme', 'Developer', 'Hello there from Acme recruiting.', '2026-09-29', '2026-09-29')`)
    .bind().run();
});

afterEach(() => {
  close();
  vi.unstubAllGlobals();
});

describe("owner access", () => {
  it("rejects missing, forged, expired, foreign-audience, and non-owner tokens", async () => {
    expect((await call("/api/owner/contacts", { jwt: null })).status).toBe(403);
    expect((await call("/api/owner/contacts", { jwt: `${(await token()).slice(0, -4)}AAAA` })).status).toBe(403);
    expect((await call("/api/owner/contacts", { jwt: await token({ exp: 1 }) })).status).toBe(403);
    expect((await call("/api/owner/contacts", { jwt: await token({ aud: ["other"] }) })).status).toBe(403);
    expect((await call("/api/owner/contacts", { jwt: await token({ email: "someone@example.com" }) })).status).toBe(403);
    expect((await call("/api/owner/contacts", { jwt: "not-a-token" })).status).toBe(403);
    expect((await call("/api/owner/contacts", {}, env({ OWNER_EMAIL: undefined }))).status).toBe(403);
    expect((await call("/api/owner/contacts", {}, env({ PORTFOLIO_DB: undefined }))).status).toBe(503);
  });

  it("requires the site origin for changes", async () => {
    const response = await call("/api/owner/contacts/c1", { method: "PATCH", headers: { Origin: "https://attacker.example" },
      body: JSON.stringify({ status: "replied" }) });
    expect(response.status).toBe(403);
  });
});

describe("owner tools", () => {
  it("searches, updates, retries, exports, and deletes contact history", async () => {
    expect(await (await call("/api/owner/contacts?q=acme")).json()).toMatchObject({ contacts: [{ submissionId: "c1", status: "new" }] });
    expect(await (await call("/api/owner/contacts?q=%25")).json()).toEqual({ contacts: [] });
    expect((await call("/api/owner/contacts/c1", { method: "PATCH", body: JSON.stringify({ status: "bad" }) })).status).toBe(400);
    expect((await call("/api/owner/contacts/c1", { method: "PATCH", body: JSON.stringify({ status: "replied" }) })).status).toBe(200);
    expect((await call("/api/owner/contacts/missing", { method: "PATCH", body: JSON.stringify({ status: "replied" }) })).status).toBe(404);

    expect(await (await call("/api/owner/contacts/c1/retry", { method: "POST" })).json()).toMatchObject({ ok: true });
    expect(await (await call("/api/owner/contacts/c1/retry", { method: "POST" })).json()).toMatchObject({ message: "Already delivered." });
    expect((await call("/api/owner/contacts/missing/retry", { method: "POST" })).status).toBe(404);

    const exported = await call("/api/owner/export");
    expect(exported.headers.get("Content-Disposition")).toContain("portfolio-history.json");
    expect(await exported.json()).toMatchObject({ contacts: [{ status: "replied", ownerNotification: "sent" }], bookings: [] });

    expect((await call("/api/owner/contacts/c1", { method: "DELETE" })).status).toBe(200);
    expect(await (await call("/api/owner/contacts")).json()).toEqual({ contacts: [] });
  });

  it("records manual bookings and deletes booking history", async () => {
    expect((await call("/api/owner/bookings", { method: "POST", body: JSON.stringify({ name: "R", email: "bad" }) })).status).toBe(400);
    const created = await call("/api/owner/bookings", { method: "POST", body: JSON.stringify({
      name: "Recruiter", email: "Recruiter@Example.com", startAt: "2026-10-01T15:00:00Z", endAt: "2026-10-01T15:30:00Z",
    }) });
    const { bookingUid } = await created.json<{ bookingUid: string }>();
    expect(created.status).toBe(201);
    expect(await (await call("/api/owner/bookings")).json()).toMatchObject({ bookings: [{ bookingUid, source: "manual", email: "recruiter@example.com" }] });
    expect((await call(`/api/owner/bookings/${bookingUid}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await call("/api/owner/bookings")).json()).toEqual({ bookings: [] });
  });

  it("exports retained history beyond the owner list limit", async () => {
    await db.exec(`WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter WHERE n <= 205)
      INSERT INTO contact_submissions
        (submission_id, name, email, company, position, message, submitted_at, last_interaction_at)
      SELECT 'bulk-contact-' || n, 'Recruiter ' || n, 'recruiter' || n || '@example.com', 'Acme', 'Developer',
        'Portfolio opportunity', printf('2026-09-%02d', (n % 28) + 1), printf('2026-09-%02d', (n % 28) + 1)
      FROM counter;
      WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter WHERE n <= 205)
      INSERT INTO booking_history
        (booking_uid, name, email, start_at, end_at, status, source, created_at, updated_at)
      SELECT 'bulk-booking-' || n, 'Recruiter ' || n, 'recruiter' || n || '@example.com',
        '2026-10-01T15:00:00Z', '2026-10-01T15:30:00Z', 'booked', 'manual', '2026-09-29', '2026-09-29'
      FROM counter;`);

    const listed = await call("/api/owner/contacts");
    expect((await listed.json<{ contacts: OwnerContact[] }>()).contacts).toHaveLength(200);
    const exported = await call("/api/owner/export");
    const history = await exported.json<{ contacts: OwnerContact[]; bookings: OwnerBooking[] }>();
    expect(history.contacts).toHaveLength(207);
    expect(history.bookings).toHaveLength(206);
  });

  it("toggles the AI kill switch", async () => {
    expect(await (await call("/api/owner/settings")).json()).toEqual({ aiEnabled: true, deploymentAiEnabled: true });
    expect((await call("/api/owner/settings", { method: "PUT", body: JSON.stringify({ aiEnabled: "no" }) })).status).toBe(400);
    expect((await call("/api/owner/settings", { method: "PUT", body: JSON.stringify({ aiEnabled: false }) })).status).toBe(200);
    expect(await (await call("/api/owner/settings")).json()).toMatchObject({ aiEnabled: false });
    expect((await call("/api/owner/unknown")).status).toBe(404);
  });
});

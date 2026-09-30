import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../types";
import { contactRoute } from "./contact";

const store = vi.hoisted(() => ({
  saveContact: vi.fn(),
  claimContact: vi.fn(),
  finishContact: vi.fn(),
}));

vi.mock("../services/contact-store", () => store);

const contact = {
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
  name: "Portfolio Visitor",
  email: "visitor@example.com",
  company: "Example Company",
  position: "Application Developer",
  message: "I would like to discuss an application development opportunity.",
  turnstileToken: "valid-test-token",
};

function createRequest(body: unknown = contact) {
  return new Request("https://api.brandenfarmer.com/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.1",
    },
    body: JSON.stringify(body),
  });
}

function createEnv(rateLimitSuccess = true): Env {
  return {
    PORTFOLIO_DB: {} as D1Database,
    CONTACT_FROM_EMAIL: "Branden Farmer Portfolio <contact@mail.brandenfarmer.com>",
    CONTACT_TO_EMAIL: "branden_farmer@live.com",
    RESEND_API_KEY: "resend-test-key",
    TURNSTILE_EXPECTED_HOSTNAME: "brandenfarmer.com",
    TURNSTILE_SECRET_KEY: "turnstile-test-key",
    CONTACT_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: rateLimitSuccess }),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  store.saveContact.mockReset().mockImplementation(async (_db, value) => ({
    owner_notification_state: "pending",
    confirmation_state: "pending",
    ...value,
  }));
  store.claimContact.mockReset().mockResolvedValue(true);
  store.finishContact.mockReset().mockResolvedValue(undefined);
});

describe("contactRoute", () => {
  it("verifies Turnstile and delivers an idempotent Resend email", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        action: "contact_form",
        hostname: "brandenfarmer.com",
      }))
      .mockResolvedValueOnce(Response.json({ id: "notification-email-id" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "email-id" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const resendRequest = fetchMock.mock.calls[1];
    expect(resendRequest[0]).toBe("https://api.resend.com/emails");
    const options = resendRequest[1] as RequestInit;
    expect(new Headers(options.headers).get("Idempotency-Key")).toBe(`portfolio-contact/${contact.submissionId}`);
    expect(JSON.parse(options.body as string)).toMatchObject({
      reply_to: contact.email,
      subject: `Portfolio contact: ${contact.position} at ${contact.company}`,
      text: expect.stringContaining(`Position: ${contact.position}`),
    });

    const confirmationRequest = fetchMock.mock.calls[2];
    expect(confirmationRequest[0]).toBe("https://api.resend.com/emails");
    const confirmationOptions = confirmationRequest[1] as RequestInit;
    expect(new Headers(confirmationOptions.headers).get("Idempotency-Key"))
      .toBe(`portfolio-contact-confirmation/${contact.submissionId}`);
    expect(JSON.parse(confirmationOptions.body as string)).toMatchObject({
      to: [contact.email],
      reply_to: "branden_farmer@live.com",
      subject: "Your message to Branden Farmer was received",
      text: expect.stringContaining(`Company: ${contact.company}`),
    });
  });

  it("rejects invalid input before calling external providers", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest({ ...contact, message: "short" }), createEnv());

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports submission success when notification succeeds but confirmation fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        action: "contact_form",
        hostname: "brandenfarmer.com",
      }))
      .mockResolvedValueOnce(Response.json({ id: "notification-email-id" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ message: "rejected" }, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());
    const body = await response.json<{ message: string }>();

    expect(response.status).toBe(200);
    expect(body.message).toContain("confirmation email could not be sent");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports partial success when the confirmation request throws", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        action: "contact_form",
        hostname: "brandenfarmer.com",
      }))
      .mockResolvedValueOnce(Response.json({ id: "notification-email-id" }, { status: 200 }))
      .mockRejectedValueOnce(new Error("confirmation provider unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());
    const body = await response.json<{ message: string }>();

    expect(response.status).toBe(200);
    expect(body.message).toContain("confirmation email could not be sent");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not attempt confirmation when the notification fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        action: "contact_form",
        hostname: "brandenfarmer.com",
      }))
      .mockResolvedValueOnce(Response.json({ message: "rejected" }, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, message: expect.stringContaining("saved") });
    expect(store.finishContact).toHaveBeenCalledWith(expect.anything(), contact.submissionId, false, false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not send email when storage is unavailable", async () => {
    store.saveContact.mockRejectedValueOnce(new Error("D1 unavailable"));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true, action: "contact_form", hostname: "brandenfarmer.com",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());

    expect(response.status).toBe(503);
    expect(store.claimContact).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops reading an oversized body when Content-Length is missing or understated", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const oversizedBody = JSON.stringify({ ...contact, message: "x".repeat(20_000) });
    const request = new Request("https://api.brandenfarmer.com/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "1",
        "CF-Connecting-IP": "192.0.2.1",
      },
      body: oversizedBody,
    });

    const response = await contactRoute(request, createEnv());

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects failed Turnstile verification without sending email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: false,
      action: "contact_form",
      hostname: "brandenfarmer.com",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a Turnstile token issued for the wrong hostname", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      action: "contact_form",
      hostname: "attacker.example",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv());

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts Cloudflare's live dummy response only with the local test pair", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        success: true,
        hostname: "example.com",
      }))
      .mockResolvedValueOnce(Response.json({ id: "notification-email-id" }, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ id: "email-id" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = createEnv();
    env.TURNSTILE_EXPECTED_HOSTNAME = "localhost";
    env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

    const response = await contactRoute(createRequest({
      ...contact,
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    }), env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects the dummy test response with a non-test secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: "example.com",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const env = createEnv();
    env.TURNSTILE_EXPECTED_HOSTNAME = "localhost";

    const response = await contactRoute(createRequest({
      ...contact,
      turnstileToken: "XXXX.DUMMY.TOKEN.XXXX",
    }), env);

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects other tokens even when a local test secret is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: true,
      hostname: "example.com",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const env = createEnv();
    env.TURNSTILE_EXPECTED_HOSTNAME = "localhost";
    env.TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA";

    const response = await contactRoute(createRequest(), env);

    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 429 before provider calls when the rate limit is exceeded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await contactRoute(createRequest(), createEnv(false));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same rate-limit bucket when one client changes email addresses", async () => {
    const rateLimit = vi.fn().mockResolvedValue({ success: true });
    const env = createEnv();
    env.CONTACT_RATE_LIMITER = { limit: rateLimit };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      success: false,
      action: "contact_form",
      hostname: "brandenfarmer.com",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await contactRoute(createRequest(), env);
    await contactRoute(createRequest({ ...contact, email: "another@example.com" }), env);

    expect(rateLimit).toHaveBeenCalledTimes(2);
    expect(rateLimit.mock.calls[0][0].key).toBe(rateLimit.mock.calls[1][0].key);
  });

  it("fails closed when the rate-limit binding is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const env = createEnv();
    env.CONTACT_RATE_LIMITER = {
      limit: vi.fn().mockRejectedValue(new Error("binding unavailable")),
    };

    const response = await contactRoute(createRequest(), env);

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when required bindings are missing", async () => {
    const response = await contactRoute(createRequest(), {});
    expect(response.status).toBe(503);
  });
});

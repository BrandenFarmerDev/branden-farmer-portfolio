export interface Env {
  ALLOWED_ORIGIN?: string;
  CONTACT_FROM_EMAIL?: string;
  CONTACT_TO_EMAIL?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  TURNSTILE_SECRET_KEY?: string;
  CONTACT_RATE_LIMITER?: RateLimit;
  PORTFOLIO_DB?: D1Database;
  ASK_RATE_LIMITER?: RateLimit;
  ASK_SIGNING_SECRET?: string;
  AI?: Ai;
  AI_ENABLED?: string;
  AI_MODEL?: string;
  CAL_WEBHOOK_SECRET?: string;
  CAL_EVENT_TYPE_ID?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
}

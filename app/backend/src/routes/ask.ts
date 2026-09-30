import type { AskMode, AskRequest, AskResponse, EvidenceLink } from "@portfolio/shared";
import { DEFAULT_MODEL, generateAnswer, recordUsage } from "../services/assistant";
import { errorResponse, hashClient, readJson } from "../services/http";
import { searchKnowledge } from "../services/knowledge";
import { isAiEnabled, reserveQuota, resolveVisitor } from "../services/quota";
import { turnstileError, verifyTurnstile } from "../services/turnstile";
import type { Env } from "../types";

const ASK_BODY_LIMIT = 12_288;
const TEXT_LIMITS: Record<AskMode, { min: number; max: number }> = {
  question: { min: 3, max: 500 },
  job_description: { min: 40, max: 4_000 },
};

export const FALLBACK_LINKS: EvidenceLink[] = [
  { id: "resume", title: "Digital résumé", url: "/resume" },
  { id: "about", title: "About Branden", url: "/about" },
  { id: "work", title: "Portfolio projects", url: "/work" },
];

function askResponse(body: AskResponse, status = 200, setCookie?: string): Response {
  return Response.json(body, { status, headers: setCookie ? { "Set-Cookie": setCookie } : undefined });
}

function unavailable(message: string): Response {
  return askResponse({ status: "evidence_only", message, evidence: FALLBACK_LINKS, remaining: null }, 503);
}

export function validateAskRequest(value: unknown): AskRequest | null {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const mode = input.mode === "question" || input.mode === "job_description" ? input.mode : null;
  const text = typeof input.text === "string" ? input.text.normalize("NFKC").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "";
  const turnstileToken = typeof input.turnstileToken === "string" ? input.turnstileToken.trim() : "";
  if (!mode || text.length < TEXT_LIMITS[mode].min || text.length > TEXT_LIMITS[mode].max) return null;
  if (!turnstileToken || turnstileToken.length > 2_048) return null;
  return { mode, text, turnstileToken };
}

export async function askRoute(request: Request, env: Env): Promise<Response> {
  const db = env.PORTFOLIO_DB;
  if (!db || !env.ASK_RATE_LIMITER || !env.ASK_SIGNING_SECRET || !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME) {
    return unavailable("Ask Branden is temporarily unavailable. Browse the portfolio evidence directly.");
  }

  const body = await readJson(request, ASK_BODY_LIMIT);
  if (!body.ok) return body.response;
  const ask = validateAskRequest(body.value);
  if (!ask) {
    return errorResponse(400, "validation_error",
      "Enter a question of 3–500 characters or a job description of 40–4,000 characters, then complete the security check.");
  }

  try {
    const rateLimit = await env.ASK_RATE_LIMITER.limit({ key: await hashClient(request, "ask") });
    if (!rateLimit.success) {
      return errorResponse(429, "rate_limited", "Too many questions in a short time. Please wait a minute.", undefined, { "Retry-After": "60" });
    }
  } catch {
    return unavailable("Ask Branden is temporarily unavailable. Browse the portfolio evidence directly.");
  }

  const verification = await verifyTurnstile(ask.turnstileToken, "ask_branden", request, env);
  if (!verification.success) return turnstileError(verification.reason);

  let passages;
  try {
    passages = await searchKnowledge(db, ask.text, ask.mode);
  } catch {
    return unavailable("Portfolio search is temporarily unavailable. Browse the portfolio evidence directly.");
  }
  if (passages.length === 0) {
    return askResponse({
      status: "no_evidence",
      message: "The approved portfolio evidence does not cover that. Nothing could be verified, so no answer was generated.",
      evidence: FALLBACK_LINKS,
      remaining: null,
    });
  }

  const evidence = passages.map(({ id, title, url }) => ({ id, title, url }));
  if (!await isAiEnabled(env, db)) {
    return askResponse({
      status: "evidence_only",
      message: "Generated answers are paused. These approved portfolio sections match your request.",
      evidence,
      remaining: null,
    });
  }

  const day = new Date().toISOString().slice(0, 10);
  const visitor = await resolveVisitor(request, env.ASK_SIGNING_SECRET, day);
  let quota;
  try {
    quota = await reserveQuota(db, visitor, day);
  } catch {
    return askResponse({ status: "evidence_only", message: "Generated answers are temporarily unavailable. These sections match your request.",
      evidence, remaining: null }, 503, visitor.setCookie);
  }
  if (!quota.ok) {
    return askResponse({ status: "evidence_only", message: "Today's answer allowance is used up. These approved sections match your request.",
      evidence, remaining: 0 }, 429, visitor.setCookie);
  }

  const model = env.AI_MODEL ?? DEFAULT_MODEL;
  const generation = await generateAnswer(env.AI as Ai, model, ask.mode, ask.text, passages);
  await recordUsage(db, day, model, generation).catch(() => undefined);

  if (!generation.answer) {
    return askResponse({ status: "evidence_only", message: "A supported answer could not be produced. These approved sections match your request.",
      evidence, remaining: quota.remaining }, 200, visitor.setCookie);
  }

  const cited = new Set(generation.answer.citations);
  return askResponse({
    status: "answered",
    message: "Answer generated only from the cited portfolio evidence.",
    answer: generation.answer.answer,
    relevant: generation.answer.relevant,
    gaps: generation.answer.gaps,
    evidence: evidence.filter((link) => cited.has(link.id)),
    remaining: quota.remaining,
  }, 200, visitor.setCookie);
}
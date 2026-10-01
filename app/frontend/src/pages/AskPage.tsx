import type { AskAllowance, AskMode, AskResponse } from "@portfolio/shared";
import { BookOpen, Search, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageIntro } from "../components/PageIntro";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { getAskStatus, submitAsk } from "../lib/api";

const stages = [
  { icon: BookOpen, title: "Approved sources", text: "Only the published résumé, About, and Work content is searched. Private messages and bookings are never used." },
  { icon: Search, title: "Evidence retrieval", text: "Matching passages are found first. If nothing matches, no answer is generated." },
  { icon: ShieldCheck, title: "Bounded answers", text: "Answers must cite the retrieved passages. For job descriptions, unsupported requirements are listed as gaps. No hiring prediction is made." },
];

const modes: Record<AskMode, { label: string; field: string; min: number; max: number; placeholder: string }> = {
  question: { label: "Ask a question", field: "Question", min: 3, max: 500, placeholder: "Ask about experience, projects, or skills" },
  job_description: {
    label: "Compare a job description",
    field: "Job description",
    min: 40,
    max: 4_000,
    placeholder: "Paste the responsibilities and requirements",
  },
};

const suggestions = [
  "What kinds of applications has Branden built?",
  "What experience does Branden have with Power BI and Palantir Foundry?",
  "How did Branden move from manufacturing into software development?",
];

const RESULT_STORAGE_KEY = "ask-branden:last-result";
const evidenceSources: Record<string, string> = { "/resume": "Résumé", "/about": "About", "/work": "Work" };

// Only the answer is kept, never the visitor's question, so Back can restore it within this tab.
function readStoredResult(): AskResponse | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(RESULT_STORAGE_KEY) ?? "null") as AskResponse | null;
    return stored && typeof stored.status === "string" && Array.isArray(stored.evidence) ? stored : null;
  } catch {
    return null;
  }
}

function storeResult(result: AskResponse) {
  try {
    sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
  } catch {
    // Storage can be unavailable in private browsing; restoring the result is optional.
  }
}

function formatResetTime(resetsAt: string): string {
  return new Date(resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

export function AskPage() {
  const [mode, setMode] = useState<AskMode>("question");
  const [text, setText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskResponse | null>(readStoredResult);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [allowance, setAllowance] = useState<AskAllowance | null>(null);
  const statusVersionRef = useRef(0);
  const pendingRef = useRef(false);
  const resultRef = useRef<HTMLElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
  const config = modes[mode];
  const exhausted = aiEnabled === true && allowance !== null && allowance.remaining <= 0;

  const loadStatus = useCallback((signal?: AbortSignal) => {
    if (pendingRef.current) return Promise.resolve();
    const version = ++statusVersionRef.current;
    return getAskStatus(signal).then((status) => {
      if (signal?.aborted || version !== statusVersionRef.current) return;
      setAiEnabled(status.aiEnabled);
      setAllowance(status.allowance);
    }).catch(() => {
      if (signal?.aborted || version !== statusVersionRef.current) return;
      setAiEnabled(null);
      setAllowance(null);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  useEffect(() => {
    if (!allowance) return;
    const refreshAfterReset = () => {
      if (Date.now() >= Date.parse(allowance.resetsAt)) void loadStatus();
    };
    window.addEventListener("focus", refreshAfterReset);
    const delay = Date.parse(allowance.resetsAt) - Date.now();
    const timer = delay > 0 ? window.setTimeout(refreshAfterReset, delay + 50) : undefined;
    return () => {
      window.removeEventListener("focus", refreshAfterReset);
      window.clearTimeout(timer);
    };
  }, [allowance, loadStatus]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (exhausted || pendingRef.current) return;
    const trimmed = text.trim();
    if (trimmed.length < config.min || trimmed.length > config.max) {
      setError(`Enter ${config.min.toLocaleString()}–${config.max.toLocaleString()} characters.`);
      return;
    }
    if (!turnstileToken) {
      setError("Complete the security check first.");
      return;
    }

    setPending(true);
    pendingRef.current = true;
    // A status read started before this submission no longer describes its quota.
    statusVersionRef.current += 1;
    setError("");
    let refreshStatus = true;
    try {
      const response = await submitAsk({ mode, text: trimmed, turnstileToken });
      setResult(response);
      storeResult(response);
      if (response.allowance) {
        refreshStatus = false;
        setAiEnabled(true);
        setAllowance(response.allowance);
      } else if (response.remaining === 0) {
        refreshStatus = false;
        setAllowance((current) => current && { ...current, remaining: 0 });
      }
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ask Branden is unavailable. Browse the résumé and projects instead.");
    } finally {
      pendingRef.current = false;
      if (refreshStatus) void loadStatus();
      setPending(false);
      setTurnstileToken("");
      setResetKey((current) => current + 1);
    }
  };

  return (
    <>
      <PageIntro
        eyebrow="Ask Branden"
        title="Questions answered from approved evidence"
        description="Ask about Branden's experience, or paste a job description to see supporting evidence and unverified requirements. Every answer links to its sources."
      />
      <section className="section content-width ask-layout">
        <div className="assistant-shell">
          {aiEnabled && allowance ? (
            <section className="ask-allowance" aria-labelledby="ask-allowance-heading">
              <div className="ask-allowance-header">
                <h2 id="ask-allowance-heading">Generated answers today</h2>
                <p className="ask-allowance-count">{allowance.used} of {allowance.limit} used</p>
              </div>
              <div className="ask-allowance-meter" aria-hidden="true">
                {Array.from({ length: allowance.limit }, (_, index) => (
                  <span key={index} className={index < allowance.used ? "is-used" : undefined} />
                ))}
              </div>
              <p className="ask-allowance-note">
                Each browser can generate {allowance.limit} answers per day. The cap keeps this free, self-funded assistant within
                its daily compute budget and discourages automated use. Searches with no matching evidence don't count.
                Resets at {formatResetTime(allowance.resetsAt)}.
              </p>
              {exhausted ? (
                <p id="ask-allowance-notice" className="inline-notice is-warning">
                  {allowance.used >= allowance.limit
                    ? `You've used today's ${allowance.limit} generated answers.`
                    : "Today's shared answer allowance for your network or this site is used up."}
                  {" "}New questions open at {formatResetTime(allowance.resetsAt)}. Meanwhile, browse the <Link to="/resume">résumé</Link> or{" "}
                  <Link to="/contact">contact Branden</Link>.
                </p>
              ) : null}
            </section>
          ) : null}
          {aiEnabled === false ? (
            <p className="inline-notice is-info">
              Generated answers are paused. Ask Branden will return the matching portfolio evidence instead.
            </p>
          ) : null}
          <div className="ask-modes" role="group" aria-label="Ask mode">
            {(Object.keys(modes) as AskMode[]).map((option) => (
              <button
                key={option}
                type="button"
                className={option === mode ? "filter-button is-active" : "filter-button"}
                aria-pressed={option === mode}
                onClick={() => {
                  setMode(option);
                  setError("");
                }}
              >
                {modes[option].label}
              </button>
            ))}
          </div>

          <form className="ask-form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
            <label htmlFor="ask-text">{config.field}</label>
            <textarea
              id="ask-text"
              value={text}
              rows={mode === "question" ? 4 : 10}
              maxLength={config.max}
              placeholder={config.placeholder}
              disabled={pending}
              aria-describedby="ask-text-meta"
              onChange={(event) => setText(event.target.value)}
            />
            <p id="ask-text-meta" className="field-meta">
              <span>Questions and job descriptions are not stored.</span>
              <span>{text.length.toLocaleString()}/{config.max.toLocaleString()}</span>
            </p>

            {mode === "question" ? (
              <div className="ask-suggestions" aria-label="Suggested questions">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="text-button" disabled={exhausted} onClick={() => setText(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            <TurnstileWidget
              siteKey={siteKey}
              resetKey={resetKey}
              action="ask_branden"
              onToken={(token) => {
                setTurnstileToken(token);
                if (token) setError("");
              }}
              onError={(message) => {
                setTurnstileToken("");
                setError(message);
              }}
            />

            <button
              className="button button-primary"
              type="submit"
              disabled={pending || !siteKey || exhausted}
              aria-describedby={exhausted ? "ask-allowance-notice" : undefined}
            >
              <Send aria-hidden="true" size={17} />
              {pending ? "Searching…" : "Ask Branden"}
            </button>
            <p className="form-status is-error" role="alert">{error}</p>
          </form>

          {result ? (
            <section ref={resultRef} className="ask-result" aria-labelledby="ask-result-heading" tabIndex={-1}>
              <h2 id="ask-result-heading">{result.status === "answered" ? "Answer" : "Matching evidence"}</h2>
              <p className="ask-result-message">{result.message}</p>
              {result.answer ? <p>{result.answer}</p> : null}
              {result.relevant?.length ? (
                <>
                  <h3>Relevant experience</h3>
                  <ul>{result.relevant.map((item) => <li key={item}>{item}</li>)}</ul>
                </>
              ) : null}
              {result.gaps?.length ? (
                <>
                  <h3>Unverified or missing requirements</h3>
                  <ul>{result.gaps.map((item) => <li key={item}>{item}</li>)}</ul>
                </>
              ) : null}
              <h3>Evidence</h3>
              <ul className="ask-evidence">
                {result.evidence.map((link) => (
                  <li key={link.id}>
                    <span className="ask-evidence-source">{evidenceSources[link.url.split("#")[0]] ?? "Portfolio"}</span>
                    <Link to={link.url}>{link.title}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="ask-contact">
            Prefer a conversation? <Link to="/contact">Contact Branden or book time</Link>.
          </p>
        </div>
        <div className="rag-stages">
          <p className="eyebrow">How answers are grounded</p>
          {stages.map(({ icon: Icon, title, text: description }) => (
            <article key={title}>
              <Icon aria-hidden="true" />
              <div><h2>{title}</h2><p>{description}</p></div>
            </article>
          ))}
          <p className="rag-note">This assistant describes Branden. It is not Branden and cannot send messages or book meetings. <Link to="/privacy">Privacy notice</Link></p>
        </div>
      </section>
    </>
  );
}

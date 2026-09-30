import type { AskMode, AskResponse } from "@portfolio/shared";
import { BookOpen, Search, Send, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageIntro } from "../components/PageIntro";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { submitAsk } from "../lib/api";

const stages = [
  { icon: BookOpen, title: "Approved sources", text: "Only the published résumé, About, and Work content is searched. Private messages and bookings are never used." },
  { icon: Search, title: "Evidence retrieval", text: "Matching passages are found first. If nothing matches, no answer is generated." },
  { icon: ShieldCheck, title: "Bounded answers", text: "Answers must cite the retrieved passages. Unsupported qualifications are listed as gaps, and no hiring prediction is made." },
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

export function AskPage() {
  const [mode, setMode] = useState<AskMode>("question");
  const [text, setText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
  const config = modes[mode];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setError("");
    try {
      setResult(await submitAsk({ mode, text: trimmed, turnstileToken }));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ask Branden is unavailable. Browse the résumé and projects instead.");
    } finally {
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
                  <button key={suggestion} type="button" className="text-button" onClick={() => setText(suggestion)}>
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

            <button className="button button-primary" type="submit" disabled={pending || !siteKey}>
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
                {result.evidence.map((link) => <li key={link.id}><Link to={link.url}>{link.title}</Link></li>)}
              </ul>
              {result.remaining !== null ? (
                <p className="ask-remaining">{result.remaining} generated {result.remaining === 1 ? "answer" : "answers"} remaining today.</p>
              ) : null}
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
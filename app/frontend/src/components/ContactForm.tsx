import type { ContactFieldErrors } from "@portfolio/shared";
import { Send } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ContactApiError, submitContact } from "../lib/api";
import { TurnstileWidget } from "./TurnstileWidget";

interface ContactValues {
  name: string;
  email: string;
  company: string;
  position: string;
  message: string;
}

const emptyValues: ContactValues = { name: "", email: "", company: "", position: "", message: "" };
const fieldLabels: Record<keyof ContactFieldErrors, string> = {
  name: "name",
  email: "email",
  company: "company",
  position: "position",
  message: "message",
  turnstileToken: "security check",
};

function validate(values: ContactValues, turnstileToken: string): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const company = values.company.trim();
  const position = values.position.trim();
  const message = values.message.trim();

  if (name.length < 2 || name.length > 100) errors.name = "Enter a name between 2 and 100 characters.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (company.length < 2 || company.length > 120) errors.company = "Enter a company name between 2 and 120 characters.";
  if (position.length < 2 || position.length > 120) errors.position = "Enter a position between 2 and 120 characters.";
  if (message.length < 20 || message.length > 3_000) errors.message = "Enter a message between 20 and 3,000 characters.";
  if (!turnstileToken) errors.turnstileToken = "Complete the security check before sending.";

  return errors;
}

export function ContactForm() {
  const [values, setValues] = useState<ContactValues>(emptyValues);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const submissionRef = useRef({ id: crypto.randomUUID(), signature: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusErrorsRef = useRef(false);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
  const isSubmitting = status === "submitting";

  useEffect(() => {
    if (status !== "error" || !focusErrorsRef.current) return;
    focusErrorsRef.current = false;

    const firstInvalidField = formRef.current?.querySelector<HTMLElement>("input[aria-invalid='true'], textarea[aria-invalid='true']");
    (firstInvalidField ?? statusRef.current)?.focus();
  }, [fieldErrors, status]);

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isSubmitting) return;

    const field = event.target.name as keyof ContactValues;
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (status !== "idle") {
      setStatus("idle");
      setStatusMessage("");
    }
  };

  const resetTurnstile = () => {
    setTurnstileToken("");
    setTurnstileResetKey((current) => current + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validate(values, turnstileToken);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      const invalidFields = Object.keys(errors).map((field) => fieldLabels[field as keyof ContactFieldErrors]);
      focusErrorsRef.current = true;
      setStatus("error");
      setStatusMessage(`Please correct: ${invalidFields.join(", ")}.`);
      return;
    }

    const signature = JSON.stringify(values);
    if (submissionRef.current.signature !== signature) {
      submissionRef.current = { id: crypto.randomUUID(), signature };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18_000);
    setStatus("submitting");
    setStatusMessage("Sending your message…");

    try {
      const response = await submitContact({
        submissionId: submissionRef.current.id,
        name: values.name,
        email: values.email,
        company: values.company,
        position: values.position,
        message: values.message,
        turnstileToken,
      }, controller.signal);

      setValues(emptyValues);
      setFieldErrors({});
      setStatus("success");
      setStatusMessage(response.message);
      submissionRef.current = { id: crypto.randomUUID(), signature: "" };
    } catch (error) {
      if (error instanceof ContactApiError) {
        setFieldErrors(error.details.fieldErrors ?? {});
        focusErrorsRef.current = true;
      }
      setStatus("error");
      setStatusMessage(
        error instanceof ContactApiError
          ? error.message
          : error instanceof DOMException && error.name === "AbortError"
            ? "The request timed out. Please try again or use direct email."
            : "The message could not be sent. Please try again or use direct email.",
      );
    } finally {
      window.clearTimeout(timeout);
      resetTurnstile();
    }
  };

  return (
    <section className="contact-form-card" aria-labelledby="contact-form-heading">
      <p className="eyebrow">Send a message</p>
      <h2 id="contact-form-heading">Tell me what you’re working on</h2>
      <p className="contact-form-intro">Share a role, project, or problem worth discussing. Required fields are marked.</p>

      <form ref={formRef} className="contact-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
        <div className="form-field">
          <label htmlFor="contact-name">Name <span aria-hidden="true">*</span></label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            disabled={isSubmitting}
            maxLength={100}
            value={values.name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
            onChange={handleChange}
          />
          {fieldErrors.name ? <p id="contact-name-error" className="field-error">{fieldErrors.name}</p> : null}
        </div>

        <div className="form-field">
          <label htmlFor="contact-email">Email <span aria-hidden="true">*</span></label>
          <input
            id="contact-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            disabled={isSubmitting}
            maxLength={254}
            value={values.email}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
            onChange={handleChange}
          />
          {fieldErrors.email ? <p id="contact-email-error" className="field-error">{fieldErrors.email}</p> : null}
        </div>

        <div className="form-field">
          <label htmlFor="contact-company">Company <span aria-hidden="true">*</span></label>
          <input
            id="contact-company"
            name="company"
            type="text"
            autoComplete="organization"
            required
            disabled={isSubmitting}
            maxLength={120}
            value={values.company}
            aria-invalid={Boolean(fieldErrors.company)}
            aria-describedby={fieldErrors.company ? "contact-company-error" : undefined}
            onChange={handleChange}
          />
          {fieldErrors.company ? <p id="contact-company-error" className="field-error">{fieldErrors.company}</p> : null}
        </div>

        <div className="form-field">
          <label htmlFor="contact-position">Position <span aria-hidden="true">*</span></label>
          <input
            id="contact-position"
            name="position"
            type="text"
            autoComplete="organization-title"
            required
            disabled={isSubmitting}
            maxLength={120}
            value={values.position}
            aria-invalid={Boolean(fieldErrors.position)}
            aria-describedby={fieldErrors.position ? "contact-position-error" : undefined}
            onChange={handleChange}
          />
          {fieldErrors.position ? <p id="contact-position-error" className="field-error">{fieldErrors.position}</p> : null}
        </div>

        <div className="form-field">
          <label htmlFor="contact-message">Message <span aria-hidden="true">*</span></label>
          <textarea
            id="contact-message"
            name="message"
            rows={7}
            required
            disabled={isSubmitting}
            minLength={20}
            maxLength={3_000}
            value={values.message}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={fieldErrors.message ? "contact-message-error" : "contact-message-hint"}
            onChange={handleChange}
          />
          <div className="field-meta">
            {fieldErrors.message
              ? <p id="contact-message-error" className="field-error">{fieldErrors.message}</p>
              : <p id="contact-message-hint">20–3,000 characters</p>}
            <span>{values.message.length}/3,000</span>
          </div>
        </div>

        <div
          className="form-field security-field"
          role="group"
          aria-labelledby="contact-security-label"
          aria-describedby={fieldErrors.turnstileToken ? "contact-security-error" : undefined}
        >
          <span id="contact-security-label" className="field-label">Security check <span aria-hidden="true">*</span></span>
          <TurnstileWidget
            siteKey={siteKey}
            resetKey={turnstileResetKey}
            onToken={(token) => {
              setTurnstileToken(token);
              if (!token) return;

              const remainingInvalidFields = Object.entries(fieldErrors)
                .filter(([field, message]) => field !== "turnstileToken" && Boolean(message))
                .map(([field]) => fieldLabels[field as keyof ContactFieldErrors]);
              setFieldErrors((current) => ({ ...current, turnstileToken: undefined }));

              if (status === "error" && fieldErrors.turnstileToken) {
                if (remainingInvalidFields.length > 0) {
                  setStatusMessage(`Please correct: ${remainingInvalidFields.join(", ")}.`);
                } else {
                  setStatus("idle");
                  setStatusMessage("");
                }
              }
            }}
            onError={(message) => {
              setTurnstileToken("");
              setFieldErrors((current) => ({ ...current, turnstileToken: message }));
            }}
          />
          {fieldErrors.turnstileToken ? <p id="contact-security-error" className="field-error">{fieldErrors.turnstileToken}</p> : null}
        </div>

        <p className="form-privacy">
          Your message is stored privately for up to 12 months and delivered through Resend. <a href="/privacy">Privacy notice</a>
        </p>

        <button className="button button-primary contact-submit" type="submit" disabled={isSubmitting || !siteKey}>
          <Send aria-hidden="true" size={17} />
          {status === "submitting" ? "Sending…" : "Send message"}
        </button>

        <p
          ref={statusRef}
          className={`form-status is-${status}`}
          role={status === "error" ? "alert" : "status"}
          aria-live={status === "error" ? "assertive" : "polite"}
          tabIndex={status === "error" ? -1 : undefined}
        >
          {statusMessage}
        </p>
      </form>
    </section>
  );
}

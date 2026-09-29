import { useEffect, useRef } from "react";

const TURNSTILE_SCRIPT_ID = "cloudflare-turnstile-script";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}

let scriptPromise: Promise<void> | undefined;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    const handleLoad = () => {
      if (window.turnstile) resolve();
      else {
        scriptPromise = undefined;
        reject(new Error("Turnstile API unavailable"));
      }
    };
    const handleError = () => {
      scriptPromise = undefined;
      reject(new Error("Turnstile failed to load"));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

export function TurnstileWidget({ siteKey, resetKey, onToken, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onToken, onError });

  callbacksRef.current = { onToken, onError };

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;

    if (!siteKey) {
      const message = "The security check is not configured. Please use direct email for now.";
      callbacksRef.current.onError(message);
      return;
    }

    void loadTurnstile().then(() => {
      if (!active || !containerRef.current || !window.turnstile) return;

      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action: "contact_form",
        theme: "auto",
        size: "flexible",
        callback: (token) => callbacksRef.current.onToken(token),
        "expired-callback": () => {
          callbacksRef.current.onToken("");
          callbacksRef.current.onError("The security check expired. Please complete it again.");
        },
        "error-callback": (errorCode) => {
          callbacksRef.current.onToken("");
          const message = errorCode === "110200"
            ? "This security check is not authorized for this website address. Please use direct email for now."
            : "The security check could not be completed. Please try again.";
          callbacksRef.current.onError(message);
        },
      });
    }).catch(() => {
      if (!active) return;
      const message = "The security check could not load. Please try again or use direct email.";
      callbacksRef.current.onError(message);
    });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  return (
    <div className="turnstile-shell">
      <div ref={containerRef} />
    </div>
  );
}

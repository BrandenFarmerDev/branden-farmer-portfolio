import { getCalApi } from "@calcom/embed-react";
import { CalendarDays } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { bookingContent, siteContent } from "../content/site";

const bookingConfig = {
  layout: "month_view",
  useSlotsViewOnSmallScreen: "true",
} as const;

function getTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function BookingLink() {
  const calApiRef = useRef<Awaited<ReturnType<typeof getCalApi>> | null>(null);

  useEffect(() => {
    let active = true;

    const configureCal = async () => {
      const cal = await getCalApi({ namespace: bookingContent.namespace });
      if (!active) return;

      const syncTheme = () => {
        cal("ui", {
          hideEventTypeDetails: false,
          layout: bookingConfig.layout,
          theme: getTheme(),
        });
      };

      syncTheme();

      const themeObserver = new MutationObserver(syncTheme);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });

      const markEmbedReady = () => {
        if (active) calApiRef.current = cal;
      };
      const embedScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://app.cal.com/embed/embed.js"]',
      );

      if (cal.instance || window.Cal?.version) {
        markEmbedReady();
      } else {
        embedScript?.addEventListener("load", markEmbedReady, { once: true });
      }

      return () => {
        themeObserver.disconnect();
        embedScript?.removeEventListener("load", markEmbedReady);
      };
    };

    let dispose: (() => void) | undefined;
    void configureCal().then((configuredDispose) => {
      if (active) dispose = configuredDispose;
      else configuredDispose?.();
    }).catch(() => {
      // The anchor remains a working direct-link fallback if the embed cannot load.
    });

    return () => {
      active = false;
      calApiRef.current = null;
      dispose?.();
    };
  }, []);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const cal = calApiRef.current;
    const modifiedClick = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

    if (!cal || modifiedClick) return;

    event.preventDefault();
    cal("modal", {
      calLink: bookingContent.calLink,
      config: bookingConfig,
    });
  };

  return (
    <a
      className="button button-primary booking-button"
      href={siteContent.links.booking.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      <CalendarDays aria-hidden="true" size={18} />
      {siteContent.links.booking.label}
      <span className="sr-only"> (opens the scheduling dialog or Cal.com in a new tab)</span>
    </a>
  );
}

# Core portfolio release checklist

Use this checklist for a reviewed preview and again before a production release. The three project demos are outside the current release scope and must remain labelled as prototypes. Evaluate generated Ask answers in preview before enabling them in production.

## Automated gates

- [ ] `npm ci` succeeds from a clean checkout.
- [ ] `npm run quality` succeeds without waived lint, coverage, duplication, type, build, or production-audit failures.
- [ ] GitHub Actions CI and CodeQL checks are green.
- [ ] No secret, `.env.local`, `.dev.vars`, generated bundle, coverage output, or local tool state appears in `git status`.

## Deployment readiness

- [ ] The GitHub `production` environment permits only `main` and contains both Cloudflare environment secrets and all three documented public variables.
- [ ] The Cloudflare Pages Direct Upload project is named `branden-farmer-portfolio`; Cloudflare Pages Git integration is not also enabled.
- [ ] `main` requires a pull request plus the `Quality gates` and `Analyze JavaScript and TypeScript` checks, with force pushes and direct pushes blocked.
- [ ] The Pages custom domain is `brandenfarmer.com`, `www` redirects to it, and the Worker custom domain is `api.brandenfarmer.com`.
- [ ] Production Resend and Turnstile secrets exist in the Cloudflare Worker secret store, not GitHub.
- [ ] Each environment's Turnstile secret matches the widget whose public site key is built into that environment's Pages frontend; complete a real browser challenge and confirm the API accepts it.
- [ ] Production and preview D1 databases exist, their IDs are in `wrangler.toml`, and the deploy token has D1 Edit.
- [ ] `ASK_SIGNING_SECRET`, `CAL_WEBHOOK_SECRET`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, and `CAL_EVENT_TYPE_ID` are set per environment.
- [ ] The production Cal.com event webhook is enabled for created, rescheduled, and canceled bookings, points to the production API, and uses the production Worker's `CAL_WEBHOOK_SECRET`.
- [ ] Cloudflare Access protects only `/owner` and `/api/owner`, allows only the owner, and bypasses OPTIONS.
- [ ] The [owner Access guide](owner-access-setup.md) is complete: each environment's page and API share an application, its AUD matches the Worker, and Eager redirect cookie is enabled.
- [ ] Preview Pages has a successful `preview` branch upload and a proxied `preview` CNAME pointing to its branch alias, not the production Pages hostname.
- [ ] The manual preview workflow can be dispatched from GitHub; the default-branch workflow prerequisite is resolved before relying on the Run workflow button.

## Content and links

- [ ] About and digital résumé facts match the approved résumé and design source.
- [ ] GitHub profile, portfolio source, LinkedIn, email, PDF, and Cal.com destinations are correct.
- [ ] Project cards still say `Prototype - in development` and do not imply shipped outcomes.
- [ ] Ask Branden returns source-linked generated answers for supported questions, declines unsupported claims, and falls back to evidence-only results if generation is unavailable or paused.
- [ ] Each Ask evidence link opens the exact résumé or About passage, highlights it, and moves focus to it; Back restores the previous answer.
- [ ] The privacy notice matches the retention periods (12 months, 7 days, 90 days).
- [ ] Canonical URL, sitemap, and metadata use `https://brandenfarmer.com`.

## Core browser flows

- [ ] Keyboard and pointer navigation work at desktop and mobile widths in light, dark, and system themes.
- [ ] The menu closes with Escape and focus returns to its toggle.
- [ ] Route changes announce a clear page heading and move keyboard focus to main content.
- [ ] The PDF download returns `Branden_Farmer_Resume.pdf`.
- [ ] The Cal.com dialog opens once; the direct URL remains available when the embed cannot load.
- [ ] The contact form requires name, email, company, position, message, and a current Turnstile token.
- [ ] A preview contact submission sends the owner notification and visitor confirmation once and appears on `/owner`.
- [ ] With answers enabled in preview, the Ask counter shows 0 of 5 on first load and increments per answer; the sixth question from one browser is declined, the button is disabled with its reset time, and the evaluation set is reviewed for citation accuracy and phone-connection latency.
- [ ] A Cal.com test booking creates, reschedules, and cancels one history record; duplicate deliveries are ignored.
- [ ] Loading `/owner` or `/api/owner/contacts` directly while signed out is blocked by Access.
- [ ] After owner login in a normal browser session, page-to-API reads and mutations succeed; public homepage and health routes still work while signed out.

## Security and operations

- [ ] Pages response headers are present, including frame, content-type, referrer, permissions, and CSP restrictions.
- [ ] Worker responses are `no-store`, include a request ID, and expose CORS only to the configured exact origin.
- [ ] Turnstile validates the `contact_form` action and exact expected hostname server-side.
- [ ] Rate limiting, body-size limits, validation failures, provider failures, and timeouts return safe errors.
- [ ] Worker logs contain no names, addresses, messages, tokens, or secrets.
- [ ] Cloudflare and Resend secrets exist only in their production or preview secret stores.

## Performance and recovery

- [ ] Home does not eagerly load the Contact/Cal.com route chunk.
- [ ] Profile photo and hashed assets retain their intended cache headers.
- [ ] No browser console error appears during the core flows.
- [ ] The previous Pages and Worker versions are identifiable for rollback before publishing.
- [ ] After merge, the `Deploy production` job follows `Quality gates` and its Worker, Pages deployment, and public-domain health checks all pass.

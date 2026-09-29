# Core portfolio release checklist

Use this checklist for a reviewed preview and again before a production release. The three project demos and Ask Branden are outside the current release scope and must remain explicitly unavailable.

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

## Content and links

- [ ] About and digital résumé facts match the approved résumé and design source.
- [ ] GitHub profile, portfolio source, LinkedIn, email, PDF, and Cal.com destinations are correct.
- [ ] Project cards still say `Prototype - in development` and do not imply shipped outcomes.
- [ ] Ask Branden still says it is not configured and cannot accept a prompt.
- [ ] Canonical URL, sitemap, and metadata use `https://brandenfarmer.com`.

## Core browser flows

- [ ] Keyboard and pointer navigation work at desktop and mobile widths in light and dark themes.
- [ ] The menu closes with Escape and focus returns to its toggle.
- [ ] Route changes announce a clear page heading and move keyboard focus to main content.
- [ ] The PDF download returns `Branden_Farmer_Resume.pdf`.
- [ ] The Cal.com dialog opens once; the direct URL remains available when the embed cannot load.
- [ ] The contact form requires name, email, company, position, message, and a current Turnstile token.
- [ ] A preview contact submission sends the owner notification and visitor confirmation once.

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

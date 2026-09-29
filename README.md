# Branden Farmer Portfolio

A React and Cloudflare portfolio scaffold for work spanning operations, data, automation, and application development. The public project descriptions are intentionally marked as prototypes and do not contain invented accomplishments or metrics.

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- A Cloudflare account only when deployment work begins

## Local setup

From the repository root:

```powershell
npm install
Copy-Item app/frontend/.env.example app/frontend/.env.local
Copy-Item app/backend/.env.example app/backend/.dev.vars
npm run dev
```

Open `http://localhost:5173` for the portfolio. The Worker runs at `http://localhost:8787`; its health endpoint is `http://localhost:8787/api/health`.

To run either process separately:

```powershell
npm run dev:frontend
npm run dev:backend
```

## Validation

```powershell
npm run quality
```

`npm run quality` runs linting, coverage-enforced tests, maintained-code duplication detection, TypeScript checks, production builds, and a production-dependency audit. The current coverage floors are 85% for lines, statements, and functions and 80% for branches. The backend build uses Wrangler's dry-run mode and does not deploy anything.

Individual commands are also available:

```powershell
npm run lint
npm run test
npm run test:coverage
npm run duplication
npm run typecheck
npm run build
npm run audit
npm run audit:production
```

## Folder map

```text
app/
	frontend/             React, TypeScript, and Vite application
		public/              Cloudflare Pages static files and SPA redirect
		src/
			assets/            Reviewed images, screenshots, and document assets
			components/        Shared interface components
			content/           Editable biography, links, and project copy
			lib/               Browser-side API helpers
			pages/             Home, Work, About, Résumé, Contact, Ask Branden
			styles/            CSS tokens and responsive global styles
	backend/              TypeScript Cloudflare Worker API
		src/
			routes/            Health, contact, and Ask Branden route handlers
			services/          Integration boundaries and future service clients
			index.ts           Request router and CORS policy
packages/
	shared/               Frontend/backend TypeScript contracts
docs/                   Architecture and deployment notes
.github/                CI, CodeQL, and Dependabot configuration
```

## Editable content

- Biography, introduction, working principles, and external links: `app/frontend/src/content/site.ts`
- Project descriptions, status, technologies, and role language: `app/frontend/src/content/projects.ts`
- Digital résumé experience, skills, education, training, and recognition: `app/frontend/src/content/resume.ts`
- Profile photo: `app/frontend/src/assets/profile-photo.webp`
- Downloadable résumé: `app/frontend/public/Branden_Farmer_Resume.pdf`
- Design direction and product scope: `Branden_Farmer_Portfolio_and_Project_Design.md`

Email, GitHub, LinkedIn, the downloadable résumé, and interview booking are configured from reviewed source material. Update those destinations only in the content file.

The Contact page opens Cal.com in an on-page scheduling dialog and keeps the same booking URL as a direct new-tab fallback. The embed is initialized only when the Contact page is rendered. It uses public booking configuration and does not store Cal.com credentials or API keys in the frontend.

The GitHub profile is available from the global navigation, About page, Work page, and footer. The public portfolio repository is linked as reviewable source; the three planned application repositories remain intentionally unlinked until their demos are ready.

The contact form requires the sender's company and position, validates on both sides of the API boundary, verifies Cloudflare Turnstile, applies a Worker rate limit, and delivers an owner notification plus a sender confirmation through Resend only when its server-side secrets are configured. See [contact form setup](docs/contact-form-setup.md) for the required DNS, Turnstile, Worker, and Pages configuration.

## Intended Cloudflare layout

- Cloudflare Pages serves `app/frontend/dist` at the portfolio domain.
- A separately deployed Cloudflare Worker serves `/api/*` from its own domain or routed API subdomain.
- Future stateful projects receive separate Workers and D1 databases; they do not share private records with the public portfolio.
- API keys and service credentials are Worker secrets. Variables prefixed with `VITE_` are public browser configuration and must never contain secrets.

See [architecture notes](docs/architecture.md) and [deployment notes](docs/deployment.md) for the package boundaries and future Cloudflare settings.

## Repository automation

- `.github/workflows/ci.yml` runs the full quality suite, including development and production dependency auditing, on pull requests, `main`, and development branches. After a reviewed merge reaches `main`, its production job deploys the Worker and Pages site only if those quality gates pass.
- `.github/workflows/codeql.yml` scans JavaScript and TypeScript on pull requests, `main`, and a weekly schedule.
- `.github/dependabot.yml` proposes weekly npm and GitHub Actions updates.
- `app/frontend/public/_headers` applies Pages security and cache headers without blocking Turnstile or the Cal.com dialog.

Complete the one-time [Cloudflare and GitHub deployment setup](docs/deployment.md) before merging the first release. Then use the [release checklist](docs/release-checklist.md) before each merge to `main`.

## Current API routes

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/api/health` | Returns Worker status and timestamp |
| `POST` | `/api/contact` | Validates, verifies, rate-limits, and delivers configured contact submissions |
| `POST` | `/api/ask` | Returns `501` until retrieval, evaluation, and model controls are configured |

No AI responses are simulated in this version. Contact delivery fails closed until the required Worker bindings and secrets are present.

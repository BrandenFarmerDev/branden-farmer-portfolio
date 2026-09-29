# Portfolio and Project Application Design

Branden Farmer \| Product and technical design \| 23 September 2026

Build a public portfolio that explains my experience in analytics, operations, and software development, then back it up with three applications I can demonstrate. The portfolio must be useful to a recruiter in less than a minute and detailed enough for an engineering or analytics interview. The job search application will use my real data privately; all public demos will use synthetic or explicitly approved data.

Recommended implementation: React and TypeScript for all four interfaces, Cloudflare Pages for static hosting, and Cloudflare Workers for APIs. Give each application its own deployment and database where needed. This keeps the public site inexpensive and lets each project stand on its own.

## Goals and audience

- Recruiters can understand my role fit, open my résumé, and contact or schedule time with me without completing a lengthy workflow.

- Hiring managers can inspect my decisions, architecture, code, and outcomes through case studies and working demos.

- The site supports application developer, data and BI, operations analyst, and automation roles through one consistent identity. Project filters can aid browsing without changing my core introduction.

Primary message: “I turn complex operations and data into software people can use.” The copy should describe work I can substantiate. Proposed projects remain marked “prototype” until built, and employer work is described only at an approved level.

## Portfolio site

### Information architecture

| **Page or area** | **Core content and action**                                                                                                               |
|------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| Home             | Name, role statement, short biography, three selected projects, technology in context, résumé, contact, and a clear link to Ask Branden.  |
| Work             | Filterable project cards for applications, analytics, data integration, and AI; each card states the problem, my role, status, and links. |
| Project detail   | Problem, users, data flow, key decisions, screenshots or live demo, technology, lessons, and repository when public.                      |
| About            | Career narrative, ways of working, experience timeline, and skills supported by specific work.                                            |
| Contact          | Email link, short message form, LinkedIn, GitHub, and a scheduling link.                                                                  |

The header remains simple: Work, About, Résumé, Contact. “Ask Branden” appears as a secondary action. Every project page has a short summary above the fold and deeper technical material below it.

### Visual and interaction design

Use a quiet enterprise style: warm white or slate surfaces, muted navy and blue accents, generous spacing, readable type, restrained motion, and precise diagrams or screenshots. Provide dark mode using the same tokens. Avoid a dashboard-like homepage. Layout must work on mobile and with keyboard navigation, clear focus states, alt text, and reduced-motion preferences. Reserve animations for feedback and transitions that explain a change.

The three project demos use a shared design system but distinct accent colors. Each has a visible “Demo data” label and a reset control so reviewers cannot confuse sample records with real employer or personal data.

### GitHub LinkedIn and email

GitHub links from the header and project cards. Select featured repositories manually, then refresh public metadata such as language and last update through GitHub’s API at build time or on a cache interval. Project descriptions and status stay editorial, not auto-generated. LinkedIn is a normal outbound profile link; no LinkedIn scraping or automated profile sync is required. Email is a direct mailto link as well as a form.

The form collects name, email, company or organization, purpose, and message. A server endpoint validates input and a Turnstile token, applies rate limits, and sends a notification by Resend. Send a brief receipt only if it improves the visitor experience. Do not store messages by default; email already serves as the record. Provide a simple success state and a direct email fallback. Phone push starts with normal mail notifications; a separate Pushover notification is optional.

Scheduling uses a dedicated 20 or 30 minute “Career conversation” event through Calendly or Cal.com. Display open slots, a time zone label, lead time, and buffers. Hide event titles and private calendar details. Keep the booking link available without forcing every contact to book. A recruiter may prefer email.

## Ask Branden AI assistant

The assistant answers questions about my experience and can map a pasted job description to evidence in the portfolio. It retrieves from an approved corpus of résumé facts, project case studies, selected writing, and public repositories. Answers link to their source sections. It does not claim a qualification, metric, degree, employer result, or availability that the corpus cannot support.

| **Stage**  | **Proposed implementation**                                                                                                                             |
|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Content    | Maintain versioned Markdown or JSON content with source URL, document type, publication status, and last reviewed date.                                 |
| Retrieval  | Start with a small hybrid index over approved passages. Precompute vectors when useful; a managed vector database is unnecessary at this scale.         |
| Generation | A Worker sends retrieved passages and the question to a small model. Cap context and output length, and return passage references alongside the answer. |
| Evaluation | Keep example questions, expected sources, refusal cases, and job-description match tests in the repository.                                             |
| Controls   | Rate limit by client, cap daily spend and input length, moderate abuse, and degrade to normal search or project links when the model is unavailable.    |

The comparison mode should state supported matches, evidence links, and gaps separately. It should never score a pasted job description as a hiring prediction. Do not retain visitor-provided descriptions beyond the request unless the visitor explicitly opts in. A “How it works” page exposes the retrieval flow, evaluation results, and failure cases as part of the project.

## Shared technical architecture

| **Component** | **Default choice**                                                      | **Reason**                                                                                        |
|---------------|-------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------|
| Frontend      | React, TypeScript, Vite, CSS variables, lightweight SVG charts          | One code family and reusable Quiet Enterprise components; static deployment.                      |
| Backend       | Cloudflare Workers in TypeScript                                        | Small APIs, scheduled sync, contact delivery, and AI calls without a continuously running server. |
| Data          | Separate Cloudflare D1 SQLite databases for each stateful app           | Clear isolation and inexpensive prototypes; public portfolio content remains in version control.  |
| Identity      | Microsoft delegated OAuth for the private job tracker; no public signup | A personal mailbox connection and a narrow access boundary.                                       |
| CI and code   | GitHub repositories with Actions for build, lint, tests, and deploy     | Reviewable code and repeatable deployment.                                                        |
| Observability | Structured error logs and aggregate usage counters                      | Diagnose failures and model cost without collecting unnecessary personal content.                 |

Suggested routes: portfolio at the root domain, with projects on subdomains such as jobs, municipal, and review. A single monorepo can share UI tokens and types while deploying each app independently. Use separate production and preview environments and separate API secrets.

## Project 1 Job Search Intelligence

Purpose: turn application confirmations and recruiter conversations in a personal mailbox into a reliable timeline and dashboard. The real app is private. A public demo uses seeded fictional employers, messages, and outcomes.

### User flows and features

- Connect a personal Outlook or Live mailbox through Microsoft delegated OAuth. Select a start date; ingest Inbox and Sent folders, then use incremental sync for changes.

- Create an application from email evidence or manually. Group related messages into one application and attach source links, role, employer, source, dates, and current status.

- Classify events such as applied, confirmation, recruiter outreach, assessment, interview request, interview completed, rejection, offer, and follow-up. Route low-confidence events to a review queue.

- Show the application list, timeline, follow-up candidates, and a dashboard for response rate, interview conversion, time to first response, and outcomes by source or role family.

- Allow edits, exclusions, merges, export, and delete. Never send recruiter replies automatically.

### Data and AI design

Core entities: Application, Organization, Role, MessageReference, ApplicationEvent, ClassificationDecision, FollowUpTask, and SyncCursor. Store a stable provider message ID, mailbox folder, web link, timestamps, sender domain, normalized subject, extracted fields, and confidence. Keep only the message text needed for classification and audit; define a retention period for raw snippets. Separate manually verified fields from model suggestions.

Use rules for clear application confirmations and common sender patterns. Use AI to extract company and role, classify ambiguous messages, summarize a timeline, and propose a link to an existing application. Preserve the message ID and supporting text span for every model decision. “No response found” means only that no qualifying email has been linked; it must not imply a rejection or that an application was received.

### Technology hosting and completion

React and TypeScript frontend on Cloudflare Pages; TypeScript Workers for OAuth callback, API, and scheduled Microsoft Graph synchronization; private D1 database for normalized records. A Python package in the repository supports historical imports, classification experiments, labeled evaluation, and export. The production scheduled path stays in Workers for low hosting cost. If richer Python processing becomes essential, move only that worker to a small paid compute service after measuring demand.

The first release is complete when a new application can be ingested or entered manually, follow-up email joins the right record, an ambiguous message can be corrected, and the dashboard updates without duplicate events. Test authorization boundaries with a second session and verify that deleting an application removes its derived data. Outlook web links require a real-account integration check.

## Project 2 Municipal Capital Project Tracker

Purpose: demonstrate how a small city or county could track capital projects from request through construction and closeout. It is a product prototype, not a claim about any municipality’s actual process. The public demo uses synthetic projects; later research and customer interviews should validate workflow differences between agencies.

### User flows and features

- A project manager creates a project with scope, location, funding source, budget, milestones, owner, vendors, and public status.

- Staff record updates, risks, decisions, change requests, expenditures, and supporting documents with an audit trail.

- Leaders view the portfolio by phase, budget variance, schedule variance, and issues needing a decision.

- A public-facing view displays approved summaries without internal notes, documents, or personnel information.

Core entities: Project, Milestone, BudgetRevision, ExpenditureSummary, Issue, Decision, Update, and DocumentReference. MVP data is authored inside the demo; a real deployment would integrate finance and permitting systems only after a customer identifies the authoritative sources. An optional AI feature drafts a project update from recorded changes and provides links to the records used. A human must approve publication.

React and TypeScript on Pages, Worker API, and a separate D1 database. Use custom SVG timeline and status views. Add a map only when location comparison clearly helps; tile hosting and data licensing would be evaluated before deployment. The MVP is complete when users can move a project through phases, record a budget or milestone change, review its history, and see the correct public summary.

## Project 3 Operational Review Workspace

Purpose: replace spreadsheet and slide compilation with a monthly operating review workflow. The prototype shows accountability for KPIs, decisions, actions, and commentary. It uses sample data and does not imply access to a former employer’s certified models.

### User flows and features

- A KPI owner reviews the latest value, target, trend, definition, and data freshness, then adds commentary with a month and owner.

- A functional leader records risks, wins, resource requests, and decisions for the review period.

- An executive opens an enterprise summary and functional views, assigns or reviews actions, and uses a clean presentation mode.

- An action owner updates status and due date; the next review shows unresolved decisions and overdue actions.

Core entities: ReviewPeriod, Function, KPI, KPIObservation, Commentary, Risk, Decision, Action, and DataSource. Each KPI carries a definition, owner, unit, target rule, source, and refresh timestamp. Use deliberately small charts: target versus actual, multi-month trend, and an exception view. No embedded Power BI module is required.

An optional AI assistant drafts a review brief from the current KPI values and approved commentary. It cites the underlying records and never changes status, creates decisions, or publishes text without user confirmation. React and TypeScript on Pages, Worker API, and a separate D1 database. A future authenticated edition can use Microsoft identity; the portfolio demo uses synthetic personas and resettable data. The MVP is complete when one review cycle can be prepared, presented, and carried forward with a clear action history.

## Privacy security and operating rules

- The public portfolio and demos never receive private mailbox records, OAuth tokens, contact submissions, or employer-owned data. Isolate databases and environment secrets by application.

- The job tracker authenticates only the owner. Use delegated read permissions needed for message content, encrypted token storage, secure HTTP-only session cookies, CSRF protection on mutations, and an explicit disconnect and data deletion path.

- Minimize email storage. Exclude attachments in the first release, strip HTML safely, and keep a short retention window for raw snippets once the event record is verified.

- Protect public contact and AI endpoints with input limits, Turnstile where appropriate, rate limits, daily model budget, and monitoring. Never put model or mail API secrets in browser code.

- Use synthetic data for all demos. Case studies about employer work need individually reviewed wording, screenshots, metrics, and repository content before publication.

## Hosting and cost plan

| **Service**      | **Use**                                     | **Current planning basis**                                                                                                                              |
|------------------|---------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| Cloudflare Pages | Portfolio and three static React apps       | Static asset requests are free; custom domains are supported.                                                                                           |
| Workers and D1   | APIs, scheduled sync, separate databases    | Workers Free includes 100,000 requests per day; D1 offers a free prototype tier. Paid Workers starts at \$5 per month if limits or features require it. |
| Model provider   | Portfolio assistant and optional project AI | Workers AI includes 10,000 free Neurons per day, subject to model access and limits. A separate API can be metered instead.                             |
| Resend           | Contact notifications                       | Free allowance is 3,000 emails per month and 100 per day.                                                                                               |
| Calendly         | Recruiter booking link                      | Free plan supports one event type and one connected calendar.                                                                                           |
| Pushover         | Optional separate phone alerts              | Current individual iOS price is a \$4.99 one-time purchase.                                                                                             |
| Domain           | Personal branded web address                | Annual price varies by registrar and extension; select and budget separately.                                                                           |

The practical launch target is free hosting plus the domain and any metered model use. Set budget alerts and daily request ceilings before enabling public AI. Free tiers and pricing can change; recheck the linked provider pages before deployment or purchase. A continuously running Python server, a vector database, and a paid scheduler are unnecessary for the first release.

## Build sequence and release checks

| **Release** | **Deliverable**                                                      | **Exit check**                                                           |
|-------------|----------------------------------------------------------------------|--------------------------------------------------------------------------|
| 1           | Portfolio design system, content, résumé, links, three project pages | Mobile and keyboard review; every public claim is verified.              |
| 2           | Contact form, notifications, booking, and Ask Branden                | Messages arrive; abuse controls work; answers link to approved evidence. |
| 3           | Job tracker private MVP and public synthetic demo                    | Mail sync, correction flow, dashboard, deletion, and access checks work. |
| 4           | Municipal capital project demo                                       | Create, update, review, and public summary workflows work end to end.    |
| 5           | Operational review demo                                              | One monthly cycle carries KPIs, decisions, and actions forward.          |

Before publishing, confirm the exact public project descriptions, the preferred résumé version, GitHub and LinkedIn URLs, domain, booking calendar, and whether any past employer work can be described. These are content and account choices, not blockers to building the design system and synthetic demos.

## Source notes

Platform facts and prices checked on 23 September 2026. The architecture and feature choices above are design recommendations; provider limits below are external facts to recheck when deploying.

[Cloudflare Pages and Workers pricing](https://developers.cloudflare.com/pages/functions/pricing/)

[Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

[Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

[Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

[Microsoft Graph list messages and permissions](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)

[Microsoft Graph message delta sync](https://learn.microsoft.com/en-us/graph/delta-query-messages)

[Microsoft Graph message web link](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)

[LinkedIn developer access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)

[Resend pricing](https://resend.com/pricing)

[Calendly free plan](https://calendly.com/help/choose-the-right-calendly-plan-for-your-team)

[Pushover pricing](https://pushover.net/pricing)

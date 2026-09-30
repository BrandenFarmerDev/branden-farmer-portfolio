# Automated Cloudflare deployment

For the current dashboard's owner login setup, start with [Set up the private portfolio owner area](owner-access-setup.md). That guide follows the owner's screenshots and documentation checked on 29 September 2026. Access configuration can be prepared before deploying preview.

Production deployment is part of `.github/workflows/ci.yml`. A pull request never receives deployment credentials and never deploys. After a reviewed pull request is merged, the resulting push to `main` runs the quality gates again. The production job starts only when those gates succeed.

The production job performs this sequence:

1. Install the locked dependencies with `npm ci`.
2. Validate the required production configuration, including a real production D1 `database_id` and the Worker's required secrets.
3. Dry-run the production Worker bundle and build the frontend with production public variables.
4. Apply pending D1 migrations to the production database, then sync the approved Ask evidence (the new version is activated and older versions are removed).
5. Deploy the Worker with `wrangler deploy --env production`.
6. Verify `https://api.brandenfarmer.com/api/health` and the Ask route's configuration.
7. Upload `app/frontend/dist` to Cloudflare Pages.
8. Verify both the immutable Pages deployment URL and `https://brandenfarmer.com`.

Migrations must be additive (expand, then contract in a later release) because they run before the new Worker is live. `AI_ENABLED` is versioned in `wrangler.toml`; the owner setting in D1 can pause generated answers without a deployment. Evidence-only responses remain available when generation is paused or fails.

The production job does not run on pull requests or `bfarmer/**` branches. The separate, manually dispatched preview job uses its own GitHub `preview` environment and credentials.

## One-time Cloudflare setup

### 1. Create a Direct Upload Pages project

Use a **Direct Upload** project named `branden-farmer-portfolio`, with `main` as its production branch. The GitHub Action builds and uploads the frontend, so do not also enable Cloudflare's Pages Git integration; using both would create duplicate deployments.

You can create the empty project from an authenticated terminal:

```powershell
npx.cmd wrangler login
npx.cmd wrangler pages project create branden-farmer-portfolio --production-branch=main
```

The workflow uploads the already-built `app/frontend/dist` directory. There is no Pages-side build command or root directory to configure.

In the Pages project, add `brandenfarmer.com` as the production custom domain. Configure `www.brandenfarmer.com` to redirect to `https://brandenfarmer.com` so the Worker's exact CORS origin and Turnstile hostname remain unambiguous.

### 2. Confirm the production Worker configuration

The production Worker configuration is versioned in `app/backend/wrangler.toml`:

- Worker name: `branden-farmer-portfolio-api`
- Custom domain: `api.brandenfarmer.com`
- Allowed browser origin: `https://brandenfarmer.com`
- Expected Turnstile hostname: `brandenfarmer.com`
- Production rate-limit namespace: `1002`

The production Worker already exists according to the handoff. Do not redeploy the unfinished feature branch to production as a setup step. The production workflow applies migrations, syncs knowledge, and deploys after a reviewed merge, once the configuration below is complete.

The production Worker requires `ASK_SIGNING_SECRET`, `CAL_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `TURNSTILE_SECRET_KEY`. Wrangler rejects a deployment if any are absent. Use the commands below only when intentionally adding or replacing them. Wrangler prompts for each value and stores it in Cloudflare; never put a value in GitHub or this repository. `wrangler secret put` creates a new deployed version of the remote Worker, so this is a live configuration change, not a read-only check.

```powershell
npx.cmd wrangler secret put RESEND_API_KEY --env production --config app/backend/wrangler.toml
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY --env production --config app/backend/wrangler.toml
npx.cmd wrangler secret put ASK_SIGNING_SECRET --env production --config app/backend/wrangler.toml
npx.cmd wrangler secret put CAL_WEBHOOK_SECRET --env production --config app/backend/wrangler.toml
```

Follow the [contact form setup guide](contact-form-setup.md) for Resend DNS and Turnstile configuration.

### 3. Create a least-privilege Cloudflare API token

Create a dedicated token for this repository. Start with Cloudflare's **Edit Cloudflare Workers** token template, add **Account → Cloudflare Pages → Edit** and **Account → D1 → Edit**, and restrict the account and zone resources to the account that owns this portfolio and the `brandenfarmer.com` zone. Do not reuse the Global API Key.

Copy the token once. You will store it as a protected GitHub environment secret in the next section.

### 4. Create the portfolio D1 databases

Create one database per environment and paste each printed `database_id` into `app/backend/wrangler.toml` in place of `REPLACE_WITH_PRODUCTION_D1_ID` and `REPLACE_WITH_PREVIEW_D1_ID`. Database IDs are not secrets.

```powershell
npx.cmd wrangler d1 create branden-farmer-portfolio-production
npx.cmd wrangler d1 create branden-farmer-portfolio-preview
```

### 5. Add the new Worker secrets and identifiers

`ASK_SIGNING_SECRET` is an application-generated random value, not a key obtained from an AI provider. The Worker uses it to sign the anonymous Ask visitor cookie and hash quota identifiers. `CAL_WEBHOOK_SECRET` is a different random value shared only by the Worker and its matching Cal.com webhook.

Generate each value independently on your own computer. This command uses the project's Node installation and also works from Windows PowerShell 5.1:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save the result in a password manager. Repeat for each secret and environment; use four different random values for the two purposes across preview and production. The earlier `RandomNumberGenerator.Fill` PowerShell example is not portable to older Windows PowerShell. [Node documents `randomBytes`](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback) as a cryptographic random generator.

Once the preview Worker exists, add its secrets in **Workers & Pages → branden-farmer-portfolio-api-preview → Settings → Variables and Secrets → Add**. Choose **Secret**, enter the name and value, then **Deploy**. This updates the remote Worker configuration. The equivalent interactive commands from the repository root are:

```powershell
npx.cmd wrangler secret put ASK_SIGNING_SECRET --env preview --config app/backend/wrangler.toml
npx.cmd wrangler secret put CAL_WEBHOOK_SECRET --env preview --config app/backend/wrangler.toml
npx.cmd wrangler secret put RESEND_API_KEY --env preview --config app/backend/wrangler.toml
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY --env preview --config app/backend/wrangler.toml
```

Paste each secret only into its prompt. `npx.cmd wrangler secret list --env preview --config app/backend/wrangler.toml` lists names without revealing values. For an entirely new Worker, use `wrangler deploy --secrets-file <ignored-local-file>` to upload all required secrets with its first version; afterward, use `wrangler secret put` for individual updates. For production, target `branden-farmer-portfolio-api` / `--env production` and use the production values during release preparation; preserve existing Resend and Turnstile secrets. See [Cloudflare's secret storage instructions](https://developers.cloudflare.com/workers/configuration/secrets/).

`TURNSTILE_SECRET_KEY` must be the secret key of the widget whose public site key is built into that environment's frontend. If preview and production use the same widget, they must use that widget's same Turnstile secret; do not generate an unrelated random value. Keep the Ask signing and Cal webhook secrets distinct per environment.

Preview sends owner notifications to Resend's `delivered@resend.dev` test inbox. Visitor confirmations still go to the submitted address, so use an address you control for testing.

The Cal.com event type ID, Access team domain, and Access audience tag are identifiers rather than secrets. Replace their environment-specific `REPLACE_WITH_*` values under `[env.preview.vars]` and `[env.production.vars]` in `app/backend/wrangler.toml`. CI blocks deployment while any placeholder remains.

### 6. Protect the owner tools with Cloudflare Access

Follow the complete [owner Access setup guide](owner-access-setup.md). The current route is **Zero Trust → Access controls → Applications**. Create one application per environment, each containing both the page and API destinations, with the exact-email owner policy attached:

| Environment | Owner page destination | Owner API destination |
| --- | --- | --- |
| Preview | `preview.brandenfarmer.com/owner` | `api-preview.brandenfarmer.com/api/owner` |
| Production | `brandenfarmer.com/owner` | `api.brandenfarmer.com/api/owner` |

Plain paths inherit protection to child paths. Check **Bypass OPTIONS requests to origin** and **Eager redirect cookie** in Advanced settings. The Worker validates the Origin on OPTIONS; actual owner requests require a valid Access JWT. Copy each application's AUD to its matching `ACCESS_AUD`, and the existing team domain without scheme or trailing slash to `ACCESS_TEAM_DOMAIN`.

### 7. Connect Cal.com booking history

Open the existing recruiter-conversation event in Cal.com's **Event Types** editor. If the edit URL has the form `/event-types/123456`, the numeric segment is the event type ID; the public booking slug and individual booking UID are different identifiers. Confirm the event is the one linked from the portfolio. If the editor does not expose an ID in its URL, inspect `eventTypeId` in a genuine test webhook payload rather than guessing from the public link.

For event-scoped webhooks, open the event's **Webhooks** tab. Cal.com describes this option in its [webhook feature guide](https://cal.com/blog/discovering-cal-com-s-webhooks-feature). Account-level webhooks may also be available under **Settings → Developer → Webhooks**. Begin with a separate test event for preview if available, so real recruiter bookings are not copied into the preview database.

Add a webhook with:

- Preview subscriber URL: `https://api-preview.brandenfarmer.com/api/webhooks/cal`
- Production subscriber URL, when ready: `https://api.brandenfarmer.com/api/webhooks/cal`
- Triggers: **Booking Created**, **Booking Rescheduled**, **Booking Cancelled**
- Secret: the same value stored as `CAL_WEBHOOK_SECRET` in the matching Worker environment
- Payload: keep the default structure; the receiver expects `triggerEvent`, `createdAt`, and `payload`

Put the selected event type's numeric ID in that environment's `CAL_EVENT_TYPE_ID`. A separate preview event has a different ID. Activate the webhook after the matching receiver is deployed and configured. Test a real booking create/reschedule/cancel sequence; a generic sample may have an event ID the receiver deliberately ignores. An HTTP 202 can mean an ignored event, not a persisted booking.

If the account cannot create webhooks, keep the public booking link and use manual booking entry in `/owner`. The current CI still requires a real `CAL_EVENT_TYPE_ID`; use the actual event's ID, and record automated synchronization as deferred. A fully webhook-optional release would require an explicit configuration/checklist change; do not substitute a made-up ID to pass CI.

### 8. Set up the isolated preview

1. Create preview D1, record its ID, complete the preview Access application, and fill the preview identifiers in `wrangler.toml`. Add `preview.brandenfarmer.com` to the Turnstile widget's allowed hostnames and obtain its site key and matching secret.
2. In GitHub, create a `preview` environment limited to the intended `bfarmer/*` branch, with a required reviewer where supported, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, and a `VITE_TURNSTILE_SITE_KEY` variable. These are separate environment entries even if the account/token values are reused.
3. If recreating a missing preview Worker, perform its initial deployment with all four required secrets using `wrangler deploy --env preview --secrets-file <ignored-local-file> --config app/backend/wrangler.toml`. For an existing Worker, confirm the four names with `wrangler secret list` before dispatch. Required-secret validation blocks deployment when any is missing. Then push the reviewed development branch and select it in **Actions → Continuous integration → Run workflow**. GitHub documents the default-branch requirement in [manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
4. The preview workflow applies D1 migrations, syncs knowledge, deploys the preview Worker, and uploads Pages with `--branch=preview`. Confirm secrets before testing or activating the webhook.
5. After a successful Pages `preview` deployment exists, open **Workers & Pages → branden-farmer-portfolio → Custom domains → Set up a custom domain**. Add and activate `preview.brandenfarmer.com`. In the `brandenfarmer.com` zone's **DNS → Records**, edit only its `preview` CNAME to target `preview.branden-farmer-portfolio.pages.dev`, with proxy status **Proxied**. Confirm the Pages branch alias in the deployment details if the actual project hostname differs. Merely adding the custom domain can leave it pointing at production. See [Cloudflare's branch-domain instructions](https://developers.cloudflare.com/pages/how-to/custom-branch-aliases/).
6. Test using `https://preview.brandenfarmer.com`, which matches the configured CORS origin and Turnstile hostname. Follow the Access guide's login/API checks, then test Ask retrieval, contact persistence, Cal events, and retention/retry operations. The first bootstrap is not a completed acceptance test.

The preview resources and manual workflow dispatch have already been bootstrapped. These steps document recovery or recreation of the environment. Pull requests never deploy.

### 9. Turn on generated answers

The approved configuration sets `AI_ENABLED = "true"` for preview and production. Validate generated answers in preview before merging a change that enables production. The owner page switch can pause answers at any time without a deployment. Workers Free stops inference when the daily Neuron allowance is used; do not enable paid Workers AI without an explicit monthly budget.

## One-time GitHub setup

### 1. Create the production environment

In the GitHub repository, open **Settings → Environments → New environment** and create `production`.

Set its deployment branch rule to **Selected branches and tags**, then allow only `main`. Do not add a required reviewer if deployment should begin automatically after a successful merge.

Add these **environment secrets**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | The dedicated least-privilege Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID that owns the Worker and Pages project |

Add these **environment variables**:

| Name | Value |
| --- | --- |
| `CLOUDFLARE_PAGES_PROJECT` | `branden-farmer-portfolio` |
| `VITE_API_BASE_URL` | `https://api.brandenfarmer.com` |
| `VITE_TURNSTILE_SITE_KEY` | The public production Turnstile site key |

`VITE_*` values are shipped to browsers and must contain public configuration only. Keep `RESEND_API_KEY` and `TURNSTILE_SECRET_KEY` exclusively in Cloudflare Worker secrets.

### 2. Protect `main`

Create a branch ruleset for `main` in **Settings → Rules → Rulesets**:

1. Require a pull request before merging.
2. Require the `Quality gates` and `Analyze JavaScript and TypeScript` status checks.
3. Require branches to be up to date before merging.
4. Block force pushes and branch deletion.
5. Do not allow routine bypasses or direct pushes.

The workflow triggers on every push to `main`; this ruleset is what ensures those pushes come from reviewed merges. The production job also declares `needs: quality`, so it cannot run when the merged commit fails the repository's quality gates.

## Release flow

1. Open a pull request into `main` and wait for CI and CodeQL.
2. Complete the [release checklist](release-checklist.md) against a reviewed preview or local build.
3. Merge the pull request after approval.
4. Open the merge commit's **Continuous integration** workflow run in GitHub Actions.
5. Confirm `Quality gates` succeeds, followed by `Deploy production`.
6. Confirm the Worker health endpoint, home page, contact form, resume download, and Cal.com fallback in production.

No one needs to run a production deploy command for routine releases. A failed quality job prevents deployment; a failed deployment remains visible in GitHub Actions and does not retry by itself.

## Rollback and recovery

Cloudflare retains deployment history for both Pages and Workers. Before the first public release, verify that the team can identify the previous successful Pages deployment and Worker version in the Cloudflare dashboard.

If a release must be reversed, use Cloudflare's rollback controls for the affected service, then revert the faulty commit through a reviewed pull request. The merge of that revert creates a new, fully validated production deployment and restores source control as the deployment source of truth.

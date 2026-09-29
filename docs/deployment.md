# Automated Cloudflare deployment

Production deployment is part of `.github/workflows/ci.yml`. A pull request never receives deployment credentials and never deploys. After a reviewed pull request is merged, the resulting push to `main` runs the quality gates again. The production job starts only when those gates succeed.

The production job performs this sequence:

1. Install the locked dependencies with `npm ci`.
2. Validate the required production configuration.
3. Dry-run the production Worker bundle and build the frontend with production public variables.
4. Deploy the Worker with `wrangler deploy --env production`.
5. Verify `https://api.brandenfarmer.com/api/health`.
6. Upload `app/frontend/dist` to Cloudflare Pages.
7. Verify both the immutable Pages deployment URL and `https://brandenfarmer.com`.

The job does not run on pull requests or `bfarmer/**` branches. Its `production` environment is the only GitHub environment that receives Cloudflare deployment credentials.

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

Create the production Worker once from a trusted local terminal:

```powershell
npm.cmd run build:production --workspace @portfolio/backend
npx.cmd wrangler deploy --env production --config app/backend/wrangler.toml
```

Then bootstrap the two application secrets. Wrangler prompts for each value and stores it in Cloudflare; never put either value in GitHub or this repository. `wrangler secret put` creates a new deployed Worker version, so perform this setup deliberately.

```powershell
npx.cmd wrangler secret put RESEND_API_KEY --env production --config app/backend/wrangler.toml
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY --env production --config app/backend/wrangler.toml
```

Follow the [contact form setup guide](contact-form-setup.md) for Resend DNS and Turnstile configuration.

### 3. Create a least-privilege Cloudflare API token

Create a dedicated token for this repository. Start with Cloudflare's **Edit Cloudflare Workers** token template, add **Account → Cloudflare Pages → Edit**, and restrict the account and zone resources to the account that owns this portfolio and the `brandenfarmer.com` zone. Do not reuse the Global API Key.

Copy the token once. You will store it as a protected GitHub environment secret in the next section.

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

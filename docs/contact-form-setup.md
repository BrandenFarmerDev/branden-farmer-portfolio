# Contact form setup

The form stores each validated message in the portfolio D1 database before sending it through Resend, so a delivery failure does not lose the message. Production delivery requires Resend, Turnstile, the D1 database, Worker secrets, and the public domains. Do not paste production secrets into source files, frontend variables, GitHub issues, or chat.

## 1. Verify a sending subdomain in Resend

1. Sign in to Resend and open **Domains**.
2. Add `mail.brandenfarmer.com` as a sending domain. Using a subdomain keeps the portfolio's mail reputation separate from the root domain.
3. Resend will provide DNS records for SPF and DKIM. In Cloudflare, open **Websites → brandenfarmer.com → DNS → Records** and add the records exactly as Resend displays them.
4. If any record type presents a proxy toggle, use **DNS only**. Mail-authentication records must resolve directly.
5. Return to Resend and select **Verify DNS Records**. DNS propagation can take time; continue only after the domain reports `Verified`.
6. In Resend, create an API key named `portfolio-contact-production`. Give it only the sending access the form requires, and restrict it to `mail.brandenfarmer.com` if that option is available.
7. Copy the key once and store it in a password manager. Do not put it in the repository.

The configured sender will be `Branden Farmer Portfolio <contact@mail.brandenfarmer.com>`, and messages will be delivered to `branden_farmer@live.com`.

## 2. Create the Turnstile widget

1. In the Cloudflare dashboard, open **Turnstile** and choose **Add widget**.
2. Name it `Branden Farmer portfolio contact`.
3. Choose the **Managed** widget mode.
4. Add `brandenfarmer.com` as the allowed hostname. The production configuration treats this as the canonical site; redirect `www.brandenfarmer.com` to it.
5. Create the widget and save both values:
   - The **site key** is public and belongs in the Cloudflare Pages environment.
   - The **secret key** is private and belongs only in the Worker secret store.

## 3. Configure local development

Copy the environment templates:

```powershell
Copy-Item app/frontend/.env.example app/frontend/.env.local
Copy-Item app/backend/.env.example app/backend/.dev.vars
```

For local frontend testing, set `VITE_TURNSTILE_SITE_KEY` in `app/frontend/.env.local` to Cloudflare's public always-pass test site key:

```text
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

Set `TURNSTILE_SECRET_KEY` in `app/backend/.dev.vars` to the matching always-pass test secret:

```text
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Use the test site key and test secret **together**. A production site key restricted to `brandenfarmer.com` will show Turnstile error `110200` on `localhost`, before the form reaches the Worker. A production secret will also reject tokens from the test site key. Cloudflare's dummy token has synthetic hostname and action metadata, so the Worker accepts it only with the matching test secret and `TURNSTILE_EXPECTED_HOSTNAME=localhost`, after Siteverify reports success. Production tokens still require the expected action and actual hostname. Keep the real site key in the GitHub `production` environment and the real secret in the production Worker, not in local development. Restart both development servers after changing these files.

To test actual local email delivery, also place the real Resend API key in `.dev.vars`. The file is ignored by Git. Automated tests mock both providers and never send email.

Run the site at `http://localhost:5173`; the local Worker expects that exact origin and Turnstile hostname.

## 4. Bootstrap and configure the Worker

From the repository root, authenticate Wrangler if necessary:

```powershell
npx.cmd wrangler login
```

Validate and bootstrap the production Worker when you are ready. The production Wrangler environment creates the `api.brandenfarmer.com` custom domain. The endpoint fails closed until its secrets are present. Routine releases after this one-time setup are handled by the protected GitHub production workflow described in the [deployment guide](deployment.md).

```powershell
npm.cmd run build:production --workspace @portfolio/backend
npx.cmd wrangler deploy --env production --config app/backend/wrangler.toml
```

Store each production secret. Wrangler prompts for the value without writing it to source control. Be aware that `wrangler secret put` creates and immediately deploys a new Worker version:

```powershell
npx.cmd wrangler secret put RESEND_API_KEY --env production --config app/backend/wrangler.toml
npx.cmd wrangler secret put TURNSTILE_SECRET_KEY --env production --config app/backend/wrangler.toml
```

The non-secret production settings already live under `[env.production.vars]` in `app/backend/wrangler.toml`. Review them before deployment:

- `ALLOWED_ORIGIN=https://brandenfarmer.com`
- `TURNSTILE_EXPECTED_HOSTNAME=brandenfarmer.com`
- `CONTACT_FROM_EMAIL=Branden Farmer Portfolio <contact@mail.brandenfarmer.com>`
- `CONTACT_TO_EMAIL=branden_farmer@live.com`

## 5. Configure the public domains

1. Configure the Pages project to serve the frontend at `brandenfarmer.com`.
2. Redirect `www.brandenfarmer.com` to `https://brandenfarmer.com` so the allowed origin and Turnstile hostname stay unambiguous.
3. Confirm the Worker deployment created and activated the `api.brandenfarmer.com` custom domain.
4. Add these public build variables to the GitHub `production` environment used by the deployment workflow:
   - `VITE_API_BASE_URL=https://api.brandenfarmer.com`
   - `VITE_TURNSTILE_SITE_KEY=<the production Turnstile site key>`
5. Add `CLOUDFLARE_PAGES_PROJECT=branden-farmer-portfolio` to that environment and follow the remaining one-time steps in the [deployment guide](deployment.md).

## 6. Validate before enabling traffic

1. Run `npm run quality` locally.
2. Deploy to the preview environment first and submit one test message. Preview delivers the owner notification to Resend's `delivered@resend.dev` test inbox; use that address as the visitor email too.
3. Confirm the message appears on `/owner`, and that the owner notification includes the required company and position, has the correct sender, and replies to the visitor's address.
4. Confirm the visitor acknowledgement is sent separately from the portfolio address and replies to `branden_farmer@live.com`.
5. Test invalid fields, an expired Turnstile challenge, repeated submissions, oversized requests, and an unavailable provider. A provider failure after storage must show "saved" and leave a retry on the owner page.
6. Review Worker logs without logging names, email addresses, message bodies, tokens, or secrets.
7. Only then merge to `main`; the post-merge workflow reruns quality gates, applies D1 migrations, deploys the Worker and Pages site, and verifies both production endpoints.

# Set up the private portfolio owner area

Verified against Cloudflare documentation and the owner's dashboard screenshots on 29 September 2026. This guide configures Access; it does not deploy the portfolio. Preview is the first environment to configure.

An Access **application** identifies the URLs to protect. A **policy** identifies who may enter. An **identity provider** verifies the person's login. Creating this application adds a login gate to the existing portfolio; it does not create another website or Worker.

## 1. Start from the screen in the screenshots

The screenshots already show the Zero Trust dashboard, an existing **Cloudflare** identity provider, and **Access controls → Applications** with no applications yet. No additional Zero Trust enrollment is needed for these steps.

The current navigation is **Access controls → Policies** and **Access controls → Applications**. The Applications page's **Create new application** button is the correct entry point. Its prerequisites describe several application types; a private IP, Tunnel, WARP client, SaaS entity ID, and SAML endpoint are not needed for this portfolio's public Cloudflare hostnames.

Cloudflare calls the relevant application type **Self-hosted and private**. Choose **Add public hostname** within that type. See [Cloudflare's application creation instructions](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/).

## 2. Check the existing login method

1. Select **Integrations → Identity providers**.
2. In the existing **Cloudflare** row, select **Test**.
3. Complete sign-in and confirm the test succeeds. Check that your login email is `branden_farmer@live.com`.

The Worker checks this exact owner email, ignoring capitalization. An email mismatch must be resolved before owner login can work. The displayed provider row confirms configuration exists, not that authentication has been tested. Cloudflare documents [testing an identity provider](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/#test-idps-in-cloudflare-one) and its [Cloudflare login method](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/cloudflare/).

Use the existing Cloudflare provider if the test succeeds. If you need to sign in through the owner's email inbox instead, add **One-time PIN** under **Add an identity provider**, then explicitly select that method for the application. Do not rely on the generic page text promising automatic PIN login: the current [OTP documentation](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) says new organizations do not receive OTP automatically.

## 3. Create the owner policy first

1. Open **Access controls → Policies**.
2. Select **Add a policy**.
3. Set **Policy name** to `Portfolio owner only`.
4. Set **Action** to `Allow`.
5. Choose an **8-hour** session duration if offered (a project preference, not a provider requirement).
6. Under the rules, add **Include → Emails → branden_farmer@live.com**.
7. Save the policy.

Select **Emails**, not **Emails ending in**. Do not add an Everyone Include rule: Include alternatives can broaden who is admitted. No separate Access rule group is needed. Creating the policy alone does not protect any URL; the next step attaches it to an application. See [policy management](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/) and [rule behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

## 4. Create the preview application

1. Open **Access controls → Applications**.
2. Select **Create new application**.
3. Select **Self-hosted and private** (or **Self-hosted** if that shorter label is shown).
4. Set **Application name** to `Portfolio owner - preview`.
5. Select **Add public hostname** and add the owner page. Add a second public hostname for its API, in the same application.

If the form splits the address into Subdomain, Domain, and Path, use these values:

| Destination | Subdomain | Domain | Path |
| --- | --- | --- | --- |
| Owner page | `preview` | `brandenfarmer.com` | `owner` |
| Owner API | `api-preview` | `brandenfarmer.com` | `api/owner` |

The resulting destinations must read `preview.brandenfarmer.com/owner` and `api-preview.brandenfarmer.com/api/owner`. If the Path control already displays a `/` prefix, do not type a second slash. If it accepts a full path, use `/owner` and `/api/owner`. Do not put a scheme or an entire URL into a Subdomain field.

Use the plain paths above. Cloudflare's [path inheritance rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) cover their child paths unless a more-specific application overrides them. `/owner*` is unnecessary and broadens matching; `/owner/*` alone does not cover `/owner` itself. Keep the public homepage, Ask, contact, health, and Cal webhook endpoints outside the protected destinations.

6. Under **Access policies**, select the existing `Portfolio owner only` policy and attach it. If the wizard offers a policy picker, confirm the selection before proceeding.
7. Under **Identity providers** or login methods, select **Cloudflare**, or the explicitly configured OTP method from step 2.
8. Leave unrelated optional settings at their defaults and complete **Create** or **Save**.

This application can be configured before the preview deployment is ready. It does not create DNS records or make an undeployed owner page available. Do not add another identical application if one was already saved; configure the existing one.

## 5. Configure browser access to the API

Open the saved preview application using **Configure**, then **Advanced settings**:

1. Under **Cross-Origin Resource Sharing (CORS) settings**, enable **Bypass OPTIONS requests to origin**. The Worker answers allowed preflights with HTTP 204 and checks the Origin. Actual owner requests still require the Access token. The earlier claim that preflight requests themselves require a token was incorrect. See [Cloudflare's CORS instructions](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/).
2. Under **Cookie settings**, confirm **Eager redirect cookie** is enabled. It prepares the authentication cookie for both concrete hostnames, allowing the owner page to call the API after login. Keep HttpOnly enabled and leave other cookie settings at their defaults initially. This setting is documented as enabled by default for new applications; checking it makes the required behavior explicit. See [multi-domain cookies](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/#multi-domain-applications).
3. Save changes.

## 6. Copy the two Access identifiers

These are identifiers, not passwords. Neither is your account ID or an API token.

**Application audience:** In **Access controls → Applications**, configure the preview application. Under **Additional settings**, copy **Application Audience (AUD) Tag**. It identifies this application; creating a separate production application produces a separate AUD. See [finding an AUD tag](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag).

**Team domain:** In Zero Trust **Settings**, look for **Team name and domain**. Cloudflare's documentation also places this information under **Custom pages**, which may be nested under **Reusable components**. Copy the existing `something.cloudflareaccess.com` domain; do not rename the team. The [Zero Trust FAQ](https://developers.cloudflare.com/cloudflare-one/faq/getting-started-faq/) documents both locations, so the field label is a better guide than assuming one menu location.

In [wrangler.toml](../app/backend/wrangler.toml), replace only the corresponding two values under `[env.preview.vars]`:

```toml
ACCESS_TEAM_DOMAIN = "your-actual-team.cloudflareaccess.com"
ACCESS_AUD = "your-actual-preview-application-audience-tag"
```

This repository expects the team domain without `https://` and without a trailing slash. Its verifier adds the scheme itself. `AI_ENABLED` is controlled separately in the deployment configuration and does not affect Access protection.

## 7. Test after preview deployment

Access configuration and a working deployed preview are separate milestones. Follow [preview deployment prerequisites](deployment.md#8-set-up-the-isolated-preview) before treating a missing page as an Access failure.

1. In a signed-out browser session, open `https://preview.brandenfarmer.com/owner` and `https://api-preview.brandenfarmer.com/api/owner/settings`. Both must require Access authentication. A private window can check this signed-out gate; use your normal browser session to diagnose authenticated cross-domain requests.
2. Sign in as `branden_farmer@live.com`. The owner page should load; the API settings endpoint should return JSON after deployment and configuration are complete.
3. If the page loads but API calls fail, follow its **Sign in to the owner API** link, complete the top-level navigation, then return and reload. Check Eager redirect and OPTIONS settings if the problem persists.
4. An authenticated API 403 can mean an incorrect team domain, AUD, or email. A 503 saying owner tools are unavailable can indicate a missing database binding. A DNS error or 404 before deployment is not proof of a bad policy.
5. Confirm the public homepage and `/api/health` remain available without an Access login. Confirm an identity outside the Allow policy cannot enter the private routes.

## 8. Production mapping

After preview validation, create `Portfolio owner - production` with the same policy and these two destinations in one application:

| Destination | Subdomain | Domain | Path |
| --- | --- | --- | --- |
| Owner page | Leave empty | `brandenfarmer.com` | `owner` |
| Owner API | `api` | `brandenfarmer.com` | `api/owner` |

Repeat the CORS and cookie checks. Put this application's AUD in `[env.production.vars]`; the team domain normally stays the same. Production code deployment still follows the reviewed merge workflow.

## What changed from the earlier instructions

- Replaced the unsupported claim about a menu reorganization with navigation visible in the screenshots and current documentation.
- Added policy-first setup, provider testing, and exact Subdomain/Domain/Path fields.
- Removed the claim that a path wildcard is required.
- Added multi-domain cookie configuration and corrected the explanation of OPTIONS handling.
- Distinguished creating Access configuration from deploying the preview site.

Research also included public discussions such as [application versus App Launcher confusion](https://www.reddit.com/r/CloudFlare/comments/120849f/) and [preview custom domains](https://www.reddit.com/r/CloudFlare/comments/1j35b0e/). Those surfaced common stumbling blocks; the technical instructions above rely on the linked official documentation and this repository's implementation.

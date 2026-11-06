# Maintain the private portfolio owner area

This is the current owner configuration procedure for the visitor-access rollout. The September owner-only bootstrap instructions are superseded: do not add OTP, change the shared provider/policy, create replacement owner applications, or replace their audience tags. Follow [visitor access setup](visitor-access-setup.md) for prerequisites, release authorization, visitor applications and live validation. This document does not deploy or activate configuration.

## Preserve existing application identity

| Environment | Existing owner application | Required destinations |
| --- | --- | --- |
| Production | `db977420-b11d-4c07-8340-42271473755c` | `brandenfarmer.com/owner`, `api.brandenfarmer.com/api/owner` |
| Preview | `447184cc-a644-491d-a763-c63ef65ce833` | `preview.brandenfarmer.com/owner`, `api-preview.brandenfarmer.com/api/owner` |

Export current configuration before changes and update these applications in place. Preserve their AUDs, destinations and existing session durations (production 24h, preview 12h). Compare each AUD to the existing corresponding `ACCESS_AUD` in [wrangler.toml](../app/backend/wrangler.toml); the team domain stays `cold-union-464d.cloudflareaccess.com`. The Worker separately verifies issuer, audience, signature, expiry and exact owner email. Do not change those values to conceal a failed login.

## Pin the provider and isolate the policy

1. Test the existing Cloudflare provider `a4b44d0e-654a-44f8-9caa-f6cadc52520f` as `branden_farmer@live.com`. Preserve `restrict_to_account_members: true`. If it fails, stop and diagnose; OTP or another IdP is not an authorized fallback.
2. Create the new portfolio-only Allow policy described in [the manifest](visitor-access-config.json): **Include Emails `branden_farmer@live.com`** and **Require Country US**. Include alternatives are OR, so do not add Everyone or another identity alternative. Do not edit shared policy `2f08f97a-f619-47d4-abd1-dbe6ca15a943`, which other applications use.
3. Pin both existing portfolio owner apps' `allowed_idps` explicitly to the original provider UUID, then attach the new portfolio owner+US policy in place of the shared policy. Preserve other unrelated application settings. Review the exported diff before applying within the authorized release.
4. Set HttpOnly, eager redirect cookie and path-scoped cookies (`http_only_cookie_attribute`, `eager_redirect_cookie_setting`, `path_cookie_attribute`) to true. Set `options_preflight_bypass: true`; do not also set `cors_headers`. The Worker answers exact-origin preflights without returning business data; actual owner requests still require authentication.

Owner destinations use plain `/owner` and `/api/owner`, whose children inherit the policy. They remain more specific than the visitor apps. Do not use `/owner*` or add visitor/Cal destinations to the owner apps. Do not create a duplicate app when the saved one already exists.

## Bootstrap versus activated visitor access

During the explicitly finite supporting-code bootstrap, owner routes remain protected while visitor routes may still be public. This is not activated visitor protection. Once the visitor gate is activated, homepage, demo, assets, PDF and ordinary APIs require approved visitor login plus US geography; owner routes still require the original provider and exact owner+US policy. Cal uses the narrow signed transport bypass and remains subject to geography. Default and wildcard Pages URLs are owner+US protected as specified in the visitor manifest.

## Validation and recovery

Test preview first, then production under the existing release/approved-merge procedure. Signed-out owner page and direct owner API requests must challenge. The exact US owner must read and mutate records; an ordinary visitor and a non-US owner must be denied. In one browser test visitor to owner to visitor with functioning API calls, then expired/missing API cookies, separate API sign-in and return/reload recovery. Inspect effective cookie paths and exact-origin OPTIONS behavior rather than assuming eager-cookie configuration worked.

An authenticated 403 can indicate wrong issuer, AUD or email; a 503 can indicate unavailable bindings. Diagnose with safe request IDs and Access events, never log tokens. Preserve a signed-in operator session and the pre-change export. Use the visitor runbook's scoped recovery procedure; do not broaden providers, mutate the shared policy or delete the gate to recover. Actual live validation and recovery exercises remain release blockers until evidenced.

Official references: [application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [policy rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/), [cookie configuration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/), [CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/).

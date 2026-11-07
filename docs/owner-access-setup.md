# Owner email-PIN access

Follow [the all-application OTP rollout](visitor-access-setup.md). This guide concerns owner data authorization; it does not authorize deployment, production migration or PR merge. Historical owner-only bootstrap and Google/Microsoft visitor plans are superseded.

The prepared owner policy is `beae4181-813c-4c75-8b38-5e4d079de6d4`: Include exact `branden_farmer@live.com`, Require OTP provider `866c6dd8-12c1-47a5-9c95-dab5abfea0d7` and US, human session 24h. It is currently unbound. Jobs and Municipal remain private to that email; the public portfolio's distinct visitor policy does not grant owner privileges.

Update existing apps in place. Portfolio production `db977420-b11d-4c07-8340-42271473755c` protects `brandenfarmer.com/owner` and `api.brandenfarmer.com/api/owner`; preview `447184cc-a644-491d-a763-c63ef65ce833` protects the corresponding preview hosts/paths. Preserve their AUDs and team domain `cold-union-464d.cloudflareaccess.com` and compare with [wrangler.toml](../app/backend/wrangler.toml). The Worker still verifies JWT issuer, audience, signature, expiry and exact owner email; do not change those checks for the login-method migration.

Desired application options are OTP-only, 24h and WARP authentication false. HttpOnly/eager cookies remain enabled; portfolio owner cookies are path-scoped. Preserve the existing mixed-app CORS configuration unless real preview behavior justifies a narrow reviewed change. Pages-only owner protection has no OPTIONS bypass. Apply the concrete manifest only with the runbook's guards and pilot authorization, retaining reusable policy references and destination order.

The old account-member-restricted Cloudflare provider and shared owner policy remain unchanged for guarded rollback, not as final login options. Do not bind the new policy until an independent control-plane recovery session and secure human OTP-entry path are established. Preview first: actual owner delivery/login, exact preview API GET, observed frontend request target and non-owner denial are required. Codes stay in the trusted browser; a code-sent page or 302 is not success. Record only safe metadata.

A PIN expires in 10 minutes and is single-use. Global/app/human-policy sessions are configured for 24h, with independent token renewal timing; this does not promise an exact universal new-code prompt every 24 hours. Per-app old-token revocation and successful owner recovery must follow a proven pilot. Otherwise pending old-token expiry blocks full activation. Do not revoke account users or rotate service credentials.

Exercise owner/visitor cookie coexistence, missing API cookies and separate-tab sign-in followed by return/reload. Actual foreign denial and recovery remain live checks. Use the main runbook's exact known-state rollback; never restore an inherited empty IdP list after OTP creation, broaden the owner email rule or delete the boundary as an automatic recovery step.

# Ask Branden model migration

Status: **source/code-review milestone.** Preview and production are unchanged. Production deployment is authorized by the owner after the release gates, but merging still needs approval of the specific pull request. A live smoke test, alerting and recovery verification remain release blockers. If this change is not deployed, production becomes evidence-only on 2026-11-20, when the retiring `@cf/qwen/qwen3-30b-a3b-fp8` returns 410/5028.

## Selected model

`@cf/meta/llama-3.3-70b-instruct-fp8-fast` replaces the retiring Qwen model.

- Cloudflare's official November 20 retirement list does not include it, and the live catalog shows no deprecation date.
- It is not a reasoning model, so no thinking flag or `/no_think` hint is sent. The payload keys are exactly `messages`, `max_tokens: 280`, `temperature: 0`, identical to the natively tested payloads.
- Its context is 24,000 tokens against a prompt of at most 7,200 characters.
- Responses report the served model `@cf/meta/llama-3.3-70b-instruct-sd`; usage is recorded under the requested id.
- Prompt, output and response budgets (7,200 characters, 280 tokens, 20 seconds) are unchanged. No automatic model fallback or inference retry exists.

## Native evaluation

- The current candidate's 34 generated-eligible cases are 21 supported, 10 job-description and 3 hostile/boundary. All passed review against the evidence actually transmitted. The 10 unsupported fixtures are retrieval-only, with no inference.
- Provenance: 29 payloads are byte-identical to the evaluated v7 sweep, and their results are reused. The 5 payloads changed by the career correction (supported-0, supported-9, supported-16, jd-2, jd-6) were run fresh as attempts 73–77, and each was independently reviewed. The evidence is in `reports/native/v7/llama33-p11/`.
- Current 34-case latency, Worker-timed: median 1,937 ms, nearest-rank p90 5,096 ms, maximum 8,649 ms, against the unchanged 20 s limit. Maximum completion was 139 of 280 tokens, and the maximum prompt was 7,002 of 7,200 characters. Timings came from a local `wrangler dev` dispatcher using the real remote AI binding, so they include local-to-Cloudflare transport and are not production latency. The original v7 sweep (p50 1,827 ms, p90 3,066 ms, max 5,228 ms, 150 tokens) is historical and does not describe this candidate.
- This is a finite sample, not a guarantee. Observations: one answer added a truthful item that the job description did not request ("Current employment status"; see the output contract below), one relevant point slightly stretched its evidence, and one answer used generic present-tense occupation wording.
- Rejected earlier candidates: Gemma 4 26B (invented status), Qwen3.8 27B (one request took 49.3 s), GLM 4.7 Flash (false SQL Server gap and false current employment).
- Rejected prompt repairs: rewording the `gaps` field description, and asking for gaps copied word for word from the job description with deterministic validation, each removed the extra item but made the model list the evidenced "Strong SQL Server skills" requirement as a gap. Both were stopped after their first probe; the prompt is unchanged from the evaluated version.

## Output contract (approved 2026-11-14)

The owner approved showing job-description `gaps` under the heading **"Not verified by the portfolio evidence"** (previously "Unverified or missing requirements"). The list may contain:

- requirements from the pasted job description that the transmitted evidence does not support (these must still appear), and
- other truthful profile items the evidence does not verify, such as current employment status.

It must not contain a requirement the transmitted evidence supports, an invented fact, or a hiring judgment. Question answers still show no gaps. This is a display and acceptance change only: the prompt, parser, model, limits and payloads are unchanged.

## Cost

`estimated_cost` is an uncached list-price estimate, not billing: $0.293 per million input tokens and $2.253 per million output tokens. A nominal 1,800-input/280-output ceiling is about $0.00116 per call, versus about $0.000185 for the retiring model (roughly 6 times). The measured sweep averaged about $0.00041 per call. The retiring model's rate is kept only for explicit overrides.

### Workers Free Neurons

Per docs/deployment.md section 9, the free plan has a shared 10,000-Neuron daily allowance. Measured usage was 22-58 Neurons per call (mean 37); the retiring model used about 17. Preview and production each allow up to 100 global calls per day (`DAILY_LIMITS` in `app/backend/src/services/quota.ts`) against that one allowance. That is about 267 calls at the measured mean and about 172 at the measured maximum, so full quota with max-size requests can exhaust it. After that, inference errors fall back to evidence-only answers (covered by the 410/5028 and provider-error tests). Do not enable paid Workers AI without an explicit budget.

## AI failure alerts

A failed generation still returns the HTTP 200 evidence-only fallback, which the existing API 503 alert cannot see. The Worker therefore emails the owner about AI failures itself, using the existing Resend configuration and `app_settings` table (`app/backend/src/services/ai-alerts.ts`). There is no schema, service, credential or cron change.

- **What counts.** Four fixed categories:
  - `provider_error`: any Workers AI error, including 410/5028 retirement and 3040 capacity errors.
  - `invalid_output`: unusable format or citations.
  - `timeout`: no answer within 20 s.
  - `quota_exhaustion`: only Workers AI code 3036, "daily free allocation".

  Intentional evidence-only answers never alert: generation paused, no matching evidence, visitor or network allowance used, or invalid input.
- **What is stored.** All of it is in `app_settings`, with no schema change. No prompt, answer, visitor identifier or raw error is stored or emailed.
  - `ai_failure_alert:<category>:<day>` is one fixed-shape incident record per category and UTC day. It holds the status, attempts, claim and lease, first-attempt time, a sticky `possiblyAccepted` flag, the payload captured on the first attempt, and the provider email id. A new day never overwrites an unsent record.
  - `ai_failure_count:<category>:<day>` is the aggregate occurrence count. It is updated together with the record in one atomic batch, so simultaneous failures are all counted exactly once.
  - `ai_failure_alert_slot:<category>:<day>` records which incident owns that category's email for a UTC dispatch day.
  - `ai_failure_alert_verification` is the one-shot verification marker. It is not tied to any date.
- **Validation before any send.** Every record is checked against its key: exact fields, category, day, status, and consistent attempt, claim and payload state. A record that fails is never sent, and maintenance reports it.
  - The only payload an incident may send is the one built from current configuration for its own category and day. The recipient is always `CONTACT_TO_EMAIL`.
  - If a captured payload no longer matches, because the recipient, sender, environment or template changed since the first attempt, the incident is closed as `failed` or `unknown` and reported. The old envelope is never sent or rewritten.
- **Sending.** The first failure of a category each day sends at once in the background with `ctx.waitUntil`, inside the 30-second post-response allowance. Each send is capped at 12 s, and 4 s are kept back to record the outcome. That allows at most two immediate attempts.
  - The daily 07:00 UTC maintenance makes at most one more attempt, while the original 24-hour Resend idempotency window (less one hour) is still open. That is three attempts at most, all with the same idempotency key.
  - Every attempt is claimed with a lease before sending. After the asynchronous claim, the dispatch day's slot and the remaining time are re-checked immediately before the request.
  - If the slot belongs to another incident, or too little time remains, nothing is sent. The record is restored unchanged, and any slot this attempt itself created is freed in the same atomic step, so a no-send never blocks a new incident's alert. A slot is never freed if an earlier same-incident submission (accepted or possibly accepted) already holds it, or if a newer claimant has replaced the claim.
  - At most one alert is sent per category per UTC dispatch day, so four per day per environment at most. Later occurrences are only counted.
- **Outcomes.**
  - `sent`: Resend accepted the email and returned an id. That is acceptance, not proof of inbox delivery.
  - `unknown`: an attempt may have been accepted but was never confirmed. This covers network errors, timeouts, 5xx responses, a 2xx without an id, a concurrent-request 409, and an abandoned in-flight claim (for example, a lost outcome write). The `possiblyAccepted` flag is sticky, and an abandoned claim's uncertainty carries into every later outcome: later 429s, rejections, exhausted attempts, expiry, or a fail-closed routing change all leave the incident `unknown`. Only a later positive acknowledgement under the same key can resolve it. It is never resent with a new key.
  - `failed`: nothing was possibly accepted, and the email was rejected or retries ran out.
  - `expired`: never attempted within 48 hours. An expired incident is never sent.
- **Daily maintenance bounds.** Expiry and 90-day retention run as one set-based batch. Terminal records, slots and counts are deleted; the verification marker never is.
  - One bounded selection then fetches at most five due records, verification first. Each costs at most four D1 calls: claim, slot, re-slot after midnight, and outcome.
  - The alert task therefore uses at most 22 D1 calls and five Resend requests. The contact task uses at most 22 D1 calls and 20 Resend requests. Together that fits the Workers Free limits of 50 D1 queries and 50 external subrequests for the cron invocation.
  - Due records beyond five wait for the next day.
- **Failures are visible.** Maintenance rejects in these cases, which marks the scheduled run as failed:
  - the expiry batch fails (nothing is sent after that);
  - a due record is invalid or no longer authorized;
  - due work cannot be delivered because Resend or recipient configuration is missing.

  No work and no email configuration is not an error.
- **Storage failure.** If the failure itself cannot be recorded, the visitor gets an HTTP 503 evidence-only response that still lists the evidence links, so the existing API 503 alert can see the outage. That alert needs three or more estimated 503s in one minute, so a single occurrence may not alert.
- **Scheduled failure.** Contact/retention maintenance and alert recovery run concurrently, so slow contact retries cannot delay alert recovery. Either failing makes the scheduled run fail visibly, rather than disappearing into disabled logs.
- **Recipients.** Ordinary incidents go only to `CONTACT_TO_EMAIL`, which is the Resend sandbox address in preview. Only the verification marker sends to `OWNER_EMAIL`, and no incident record can select that address.

### One-shot delivery verification (preview only, needs release authorization)

Do these steps only with the owner's authorization. Exactly one labelled test email is allowed per environment.

1. **Preflight.** Confirm all of the following with read-only checks before arming anything:
   - the preview D1 database id;
   - that the active preview Worker version includes this change;
   - that the preview cron is `0 7 * * *`;
   - the sender configuration;
   - a read-only Resend lookup for the same account;
   - that the preview contact outbox and maintenance counts are zero.
2. **Arm.** Insert the single permission into the **preview** database through the authenticated control plane. Replace `<ISO time>` with the current time:

   ```sql
   INSERT INTO app_settings (key, value, updated_at) VALUES ('ai_failure_alert_verification', '{"status":"armed"}', '<ISO time>') ON CONFLICT (key) DO NOTHING;
   ```

3. **Send.** The next deployed preview maintenance run consumes the permission atomically, before its single attempt. The marker then moves to `consumed` and finally to `sent`, `failed`, `unknown` or `not_sent`.
   - It is never re-armed by code, by retention, by a new day or by a repeat of this statement, which does nothing once the marker exists.
   - Concurrent runs cannot both send.
   - If the outcome write is lost, the marker stays `consumed` and nothing is resent.
   - Re-arming would need an explicit, owner-authorized `DELETE` of the marker.
4. **Record.** Record the provider id from the marker, plus a delivered event or the owner's confirmation of receipt. A status of `sent` alone is not proof of delivery.

## Rollback and recovery

Before 2026-11-20, an `AI_MODEL` override to the retiring Qwen id works (its rate and `/no_think` hint are retained). After that date, use the owner page switch or `AI_ENABLED="false"` for evidence-only answers. Do not restore the old career wording.

## Known debt (out of scope)

- A long job description consumes the prompt budget, so truncated evidence can produce gaps the full corpus supports.
- Graceful degradation, not fixed: worst-case traffic can exhaust the Workers Free Neuron allowance. Answers then fall back to evidence-only, and a `quota_exhaustion` alert is raised.

The About career entry "Business intelligence and application development" now reads 2022–2026 in the past tense, matching the résumé. It previously said "2022–Present".

Existing quota, Turnstile, evidence fallback, aggregate-only persistence and disabled logs/traces remain in place.

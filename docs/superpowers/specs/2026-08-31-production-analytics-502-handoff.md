# Production analytics 502 credential rotation - Handoff (2026-08-31)

## Mission

Restore live production analytics at `tkaflowarts.com`. The admin analytics route returned 502 because its PostHog personal API key was no longer accepted. The credential was rotated, saved locally and in Cloudflare, deployed, and verified live on 2026-08-31.

## Done - verified

- Diagnosed the upstream failure (commit: not applicable, external runtime evidence). On 2026-08-31, direct PostHog API checks using the previous local `POSTHOG_PERSONAL_API_KEY` returned HTTP 403 with `authentication_failed` from both `https://us.i.posthog.com/api` and `https://us.posthog.com/api`. PostHog US status reported the query API operational.
- Rolled the PostHog personal API key named `TKA production app admin` (commit: not applicable, PostHog account state). Browser evidence on 2026-08-31 showed a newly generated `phx_` key with length 52. The previous key stopped working immediately.
- Replaced `POSTHOG_PERSONAL_API_KEY` in `C:\tka-platform\.env` (commit: not applicable, gitignored local secret). A read-back check on 2026-08-31 found exactly one matching entry, length 52, equal to the newly rolled key.
- Replaced the Cloudflare Pages production secret `POSTHOG_PERSONAL_API_KEY` for project `tka-platform` (commit: not applicable, Cloudflare account state). After Save, the production Variables and secrets row returned to `Value encrypted` and no editable value field remained.
- Verified the replacement credential directly against PostHog (commit: not applicable, external runtime evidence). A minimal `SELECT 1` query returned HTTP 200 with result `1`; the key was read from local `.env` and never printed.
- Redeployed the existing production commit `b9a927bee2` without changing application source (commit: not applicable, Cloudflare deployment state). Deployment `cde1bc59-cfe2-431e-9b79-6a7c99dbc518` finished with status `success` in 15m59s; the build stage took 12m46s and deployment took 31s.
- Verified the authenticated live production UI (commit: not applicable, production browser evidence). Before deployment, `https://tkaflowarts.com/admin/pulse` showed `Analytics proxy 502`. After deployment and Retry, that error was absent and Pulse rendered 17 visitors today, 72 over 7 days, and 226 over 30 days. The dedicated `https://tkaflowarts.com/admin/analytics` page also loaded without `502` or `Analytics request failed`, showed PostHog updated `just now`, and rendered 91 total users, 20 active over 7 days, and 41 active over 30 days.

## Believed done - unverified

- None. The credential, deployment, and authenticated production path all have runtime proof.

## In flight

- Branch: `codex/fix-prod-analytics-502`
- Worktree: `C:\tka-platform-analytics-502`
- The branch owns only this handoff document. No application source files were changed, and no operational repair work remains.
- The valid replacement key is intentionally absent from Git. On this machine it is stored only in the gitignored `C:\tka-platform\.env` and in the Cloudflare encrypted production secret.

## Loose ends (ranked)

1. No operational loose ends remain. Preserve this branch until the documentation is merged or intentionally closed; the production repair itself is complete.

## Decisions already made

- On 2026-08-31, Austen explicitly approved rolling the existing `TKA production app admin` key and putting the replacement into the Cloudflare encrypted production secret.
- On 2026-08-31, Austen confirmed the replacement should also go into local `.env`, not production only.
- Keep credentials out of Git and chat. The repository receives only this security-safe handoff.
- Treat this as an operational credential repair unless runtime evidence proves a source change is also required.

## Gotchas

- Do not roll the PostHog key again while `C:\tka-platform\.env` is available. Another rotation would immediately invalidate both the local value and the Cloudflare value just saved.
- Never print, log, commit, or paste the key into this document. Read it from the local gitignored `.env` only at the point of use.
- Cloudflare project: `tka-platform`; account ID: `0c0fb89b9dd972a61c30f0d43dd02b18`; production domains: `tkaflowarts.com` and `tka-landing.pages.dev`.
- The successful credential-binding deployment is `cde1bc59-cfe2-431e-9b79-6a7c99dbc518` for commit `b9a927bee2`.
- Production automatic deployments are paused. Future secret changes still need an explicit deployment and fresh authenticated runtime proof.
- The browser tabs used for PostHog and Cloudflare are session-owned and may not be reclaimable by another agent. The local `.env` is the durable same-machine recovery point.

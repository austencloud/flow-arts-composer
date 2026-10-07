---
status: active
value: 5
effort: M
remaining: "Verify whether the app-side analytics changes and PostHog Worker are live in production. If not, use the approved production release process; after release, capture a smoke event through the Worker and validate the next real production lifecycle event in PostHog before closeout."
depends_on: "external: production release state and authorized release of app-side analytics changes and PostHog Worker"
plan_path: "docs/superpowers/plans/active/2026-08-21-first-session-analytics-reliability-plan.md"
tags: [analytics, auth, posthog, reliability]
last_triaged: 2026-10-07
work_state: blocked
---

# First-session analytics reliability design

**Queue evidence (2026-10-07):** The recorded remainder requires a production release and next real lifecycle event, while this spec's verification contract requires a production Worker smoke event visible in PostHog. Current deployment state has not been established in this audit, so local source verification alone cannot unblock closeout.

**Date:** 2026-08-21  
**Original status (historical):** Approved and in implementation.
**Source:** Production session review of the Krysten Ryan shared account

## Problem

The reviewed guest-to-account session proved that the product preserved the
visitor's work, but it also exposed four silent reliability gaps:

1. A same-UID anonymous-account link does not fire Firebase's auth-state
   listener, so the upgraded user was not guaranteed to be identified to
   PostHog before the conversion event.
2. A display-name edit updated Firebase Auth but not the public `users/{uid}`
   profile shown on sequences, comments, and creator pages.
3. Tunnel saves were protected only while one write was in flight. The same
   reproducible Tunnel state could be saved again immediately after the first
   write completed.
4. PostHog traffic went directly to a known analytics domain. A browser or
   network blocker could leave a valid local session id while delivering no
   events or replay. The highest-value completion events were client-only.

The absent PostHog payload is not recoverable after the fact. This work makes
future sessions observable and keeps the product state honest.

## Goals

- Identify the upgraded Firebase UID before emitting the linked-account
  conversion event.
- Make a successful display-name edit mean Firebase Auth and the public profile
  hold the same normalized value.
- Collapse overlapping and rapid identical Tunnel saves without blocking a
  changed save or a retry after failure.
- Route browser PostHog traffic through a neutral first-party Cloudflare Worker
  that supports events, feature flags, SDK assets, and replay chunks.
- Emit authoritative `guest_upgraded_to_account`, `sequence_save`, and
  `tunnel_save` completion events through an authenticated first-party endpoint.
- Preserve the verified Firebase UID as the PostHog `distinct_id` and attach
  the initiating browser's replay session id.
- Avoid double-counting client and server completion events.
- Distinguish tutorial eligibility, actual prompt visibility, acceptance,
  decline, completion, and leaving without a choice in future session reviews.

## Non-goals

- Reconstructing events, exceptions, clicks, or replay data that PostHog never
  received for the reviewed session.
- Moving all product analytics to the server. Page views, interaction detail,
  replay, and failure/request stages remain browser-owned.
- Applying generic collection deduplication. Tunnel equality is feature-specific;
  scenes and mandalas retain their existing collection semantics.
- Changing the visible UI or the five-second duplicate-save policy into a
  permanent uniqueness constraint.

## Decisions

### Identity convergence

One auth-owned mapping converts a Firebase `User` plus the resolved role/admin
state into PostHog person properties. The normal auth listener and
`refreshUser()` both call it. This keeps the same-UID link path and ordinary
sign-in path identical, including the `hasIdentifiedToPostHog` logout guard.

The existing PostHog readiness queue remains the analytics-owned boundary for
sign-ins that race SDK initialization. `resetUser()` cancels a queued identify
when sign-out wins that race.

### Display-name convergence

`profile-field-updater.ts` remains the operation owner. It normalizes once,
writes Firebase Auth first, then merges the same value into `users/{uid}` using
the existing authenticated Firestore retry boundary. It reports success only
after both writes complete. A retry is safe because both writes are idempotent.

### Tunnel repeat-save policy

`ArtPane` remains the save owner. A small domain helper fingerprints canonical
sequence render content plus the complete Tunnel snapshot. Poster bytes,
generated ids, and timestamps are outside equality. It rejects overlap and a
matching successful save for five seconds, records success only after
persistence resolves, and clears failed attempts for immediate retry.

### First-party PostHog delivery

A dedicated Cloudflare Worker owns `rune.tkaflowarts.com`. The neutral hostname
is deliberately unrelated to analytics terminology. Following PostHog's
Cloudflare reference:

- `/static/*` and `/array/*` go to `us-assets.i.posthog.com` and may use the
  Cloudflare Cache API.
- Every other path goes to `us.i.posthog.com`.
- POST bodies are buffered before forwarding.
- Cookies are stripped and `CF-Connecting-IP` is forwarded as
  `X-Forwarded-For`.
- CORS covers the Capacitor origin as well as web builds.
- No PostHog secret is present in the Worker; browser ingestion uses the public
  project token already shipped to clients.

The app uses the Worker by default in production even when an old environment
still names the direct US ingestion host. A genuinely custom configured host
still wins. `ui_host` remains `https://us.posthog.com` for toolbar/replay links.

The proxy is separate from the SvelteKit Pages Worker. That avoids adding replay
bandwidth and invocation load to application requests, works for native builds,
and is not affected by Cloudflare Pages advanced mode ignoring `/functions`.

### Authoritative lifecycle events

The product operation remains the durable completion boundary, then reports to
`POST /api/rune/lifecycle`:

| Product boundary                                                                             | PostHog event               | Completion meaning                                         |
| -------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------- |
| Same-UID link token refresh, auth-state convergence, and public-profile write have completed | `guest_upgraded_to_account` | The guest transition has finalized                         |
| `LibrarySaveService` has completed its required local/cloud persistence                      | `sequence_save`             | The canonical library save succeeded                       |
| `CollectionState.add()` has resolved                                                         | `tunnel_save`               | The Tunnel exists in its selected account/local collection |

One client reporter creates the event UUID and original timestamp before
calling `authedFetch`. Its possible 401/token-refresh retry therefore reuses the
same body, and PostHog can deduplicate it. The reporter also sends the exact
browser replay session through `X-PostHog-Session-ID`.

The SvelteKit endpoint verifies the Firebase bearer token, rate limits by the
verified UID, strictly validates the event-specific schema, and ignores any
caller-supplied identity. `posthog-node` sends immediately with that UID as
`distinct_id`, the original UUID/timestamp, and `$session_id`. The public
PostHog project token is sufficient for ingestion; no personal API key is used.

Lifecycle delivery errors are caught after the product operation has already
succeeded, logged for operators, and never turned into a false save or signup
failure. The old client-owned `sequence_save` completion is removed. Tunnel's
existing `qr_action` request/completed/failed breadcrumbs remain because they
serve scan diagnostics rather than duplicating the lifecycle event.

### Tutorial decision observability

The existing app-entry funnel already owns `onboarding_tutorial_offered`,
`accepted`, `declined`, and `completed`. These rare events use the PostHog-ready
queue rather than the ordinary best-effort capture path, so a first interaction
that races analytics startup is retained.

Eligibility is not treated as proof of visibility. `ConstructGuideEntry` emits
`onboarding_tutorial_prompt_viewed` from the actual rendered offer. If that
offer unmounts or the page is hidden without either button resolving it, it emits
`onboarding_tutorial_ignored` with `visible_ms` and reason
`offer_unmounted`. Session review can therefore report the exact branch rather
than guessing from the absence of clicks.

## Deployment configuration

- Deploy the Worker on the `rune.tkaflowarts.com` custom domain.
- Keep `PUBLIC_POSTHOG_KEY` available to the Pages build and runtime Worker.
  It is the public ingestion token already shipped to browsers; a personal API
  key is neither needed nor allowed for capture.
- Production Pages may explicitly set `PUBLIC_POSTHOG_HOST` to the Worker, but
  the client migration also recognizes and replaces the legacy direct US host.
- Native release jobs receive the same Worker hostname whenever analytics is
  enabled.

## Verification

- Focused unit coverage for queued identity, same-UID refresh identification,
  display-name partial failure, Tunnel overlap/window/change/failure behavior,
  Worker routing/body/header/CORS behavior, and lifecycle event construction.
- Root focused Vitest suites, formatting, and diff checks.
- Wrangler dry-run, then a live health/flags request through the custom domain.
- A production smoke event must return success through the Worker and appear in
  PostHog before this spec is marked shipped.

## Risks and mitigations

- **Authentication retry duplicates:** the client reuses one event UUID,
  timestamp, and body across `authedFetch`'s forced-token retry.
- **Analytics outage affecting user writes:** capture runs only after product
  persistence and errors stay inside the analytics boundary.
- **Wrong replay session on a server event:** only the session id captured at
  the initiating request is attached; the UID always comes from the verified
  Firebase token.
- **Proxy abuse:** the Worker forwards only to two fixed PostHog US hosts,
  strips cookies, exposes no credential, and does not accept a caller-selected
  upstream.
- **Replay payload size/cost:** the dedicated Worker isolates bandwidth from the
  app Worker; Cloudflare request limits and Worker usage remain observable.

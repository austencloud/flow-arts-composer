---
status: active
value: 5
effort: M
remaining: "Verify First-Session Activation — Design against src/lib/shared/library/services/library-repository.ts before resuming implementation. Prior recorded remainder: 'Says \"awaiting re-review\"; SP1/SP2/SP3 substantially built and tested. Remaining: retro-login anonymous guard; 3 SP3 ledger items unverified'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# First-Session Activation — Design

**Queue evidence (2026-10-07):** SP1-SP3 are substantially built; retro-login guard and three ledger items remain. See frontmatter for the remaining work.

> **DRIFT WARNING — 2026-08-02.** Says "awaiting re-review"; SP1/SP2/SP3 substantially built and tested. Remaining: retro-login anonymous guard; 3 SP3 ledger items unverified
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-07-22
**Original status (historical):** Revision 3 — full-scope (Austen, 2026-07-22), decomposed into three
sequenced sub-projects. Awaiting re-review before per-sub-project plans.
**Author:** Claude (Opus 4.8), with Austen; reviewed by GPT-5.6 (Codex) ×2

## Why this revision

Rev 1 was a plan-ready design; Rev 2 reconciled a first review. A second review
(5.6, on the Rev-2 plan) plus three grounding investigations found that the two
funnel leaks sit on **broken infrastructure**, not just missing UI:

- **Guest saves through four "keep" paths never reach the guest's library.**
  `LibraryRepository.saveSequence` is Firestore-only and fire-and-forget
  (`src/lib/shared/library/services/library-repository.ts:492-501` — no Dexie
  write anywhere in the class). Guests read their library from Dexie, not
  Firestore (`create-browse-engine.svelte.ts:467-474`). So saves via the viewer
  (`library-action-handler.svelte.ts:126`), printed-card import
  (`ScanCardSheet.svelte:195`), video-record (`VideoRecordCoordinator.svelte:105`),
  and retro shell (`notation-adapter.ts:154`) are invisible in "My Library."
  Only `LibrarySaveService.saveSequence` awaits the Dexie write
  (`library-save-service.ts:181`).
- **Conversion can strand the just-saved sequence.** In-place anonymous linking
  exists and captures drafts on collision
  (`anonymous-upgrade.ts` `captureAnonymousDrafts`/`promptAnonymousImport`), but
  (a) it reads drafts from **Firestore** (`library-repository.ts:854-859`), so a
  fresh Dexie-only save is missed, and (b) several modal routes bypass linking
  entirely: Google One Tap (`authenticator.ts:115`, no `isAnonymous` check),
  email/password **sign-in mode** (`EmailPasswordAuth.svelte:136-140`, the
  most-reached route, zero mitigation), cross-browser magic link
  (`email-link-completion.ts:152-154`), and the retro login dialog.
- **The existing guest nudge can't even open its modal.** The save-cap trigger
  calls `openAuthDialog()` (`library-save-service.ts:143`) from
  `auth-ui-state.svelte.ts`, which has **zero consumers** — `AuthModal` is driven
  by `authDrawerState.open`. The toast fires; the modal may not open.

Because 1 and 2 are pre-existing bugs affecting **all** guests (not just
first-session), and 3 depends on both being solid, this ships as three
sub-projects in dependency order. Full scope, sequenced — not descoped.

## Sub-project graph

```
SP1 Durable-save unification ──┐
                               ├──▶ SP3 First-session activation
SP2 Anonymous-account preserve ┘
```

Build order: **SP1 → SP2 → SP3.** Each gets its own plan
(`docs/superpowers/plans/…`) and ships independently. SP1 and SP2 are correctness
fixes valuable on their own; SP3 is the activation feature that relies on them.
The prior single plan
(`docs/superpowers/plans/2026-07-22-first-session-activation.md`) is **superseded**
by this decomposition.

---

# SP1 — Durable-Save Unification

## Problem

Four user-initiated "keep" paths call `LibraryRepository.saveSequence` directly
and never write Dexie, so guest saves through them don't appear in the guest's
library. `LibrarySaveService.saveSequence` is the only durable path.

## Verified seams

| Path | Site | Layer today |
|---|---|---|
| Create Save panel | `save-panel-state.svelte.ts:259` | `LibrarySaveService` ✓ durable |
| Viewer save | `library-action-handler.svelte.ts:126` | `LibraryRepository` — no Dexie |
| Printed-card import | `ScanCardSheet.svelte:195` | `LibraryRepository` — no Dexie |
| Video-record save | `VideoRecordCoordinator.svelte:105` | `LibraryRepository` — no Dexie |
| Retro save | `notation-adapter.ts:154` | `LibraryRepository` — no Dexie |
| Sync retry / draft import | `library-sync-retry.ts:70`, `anonymous-upgrade.ts:260` | `LibraryRepository` — **stays** (operate on already-Dexie rows) |

- Durable write: `library-save-service.ts:181` `await db.sequences.put(cloneable)`.
- Firestore sync is detached: `library-save-service.ts:208-212` fires
  `syncToFirestore` un-awaited; `library-repository.ts:492-501` is fire-and-forget.
- Dexie `db.sequences` is a **flat, non-uid-scoped** table
  (`database_constants.ts:62-63`) — hence guest-only reads and the shared-device
  caveat in `create-browse-engine.svelte.ts:467-474`.
- Making a Dexie-write failure **fail the save** has a narrow blast radius: two
  callers of `LibrarySaveService.saveSequence` (`library-state.svelte.ts:485`,
  `save-panel-state.svelte.ts:259`). The save-panel catch is currently near-silent
  (`logger.error`, no toast) — a throw needs an error toast added there.
- The scan path depends on a **synchronous** `ALREADY_EXISTS` rejection
  (`ScanCardSheet.svelte:201-211`), which today comes from
  `LibraryRepository.saveSequenceWithMetadata`. `LibrarySaveService` currently
  swallows that inside the fire-and-forget `syncToFirestore`
  (`library-save-service.ts:317-327`) — it must surface it to the caller.

## Design

1. **`SaveOutcome`.** Extend `SaveResult`
   (`library-contract-types.ts:72-77`) with `persisted: boolean` and
   `isGuest: boolean` — both already computed inside `saveSequence`
   (`library-save-service.ts:131-134`, `:181`). No new lookups.
2. **Fail on non-persistence.** In `saveSequence`, if the awaited Dexie write
   throws (`:178-200`), reject with a `LibraryError("PERSIST_FAILED")` instead of
   warn-and-continue, so no caller shows "Saved!" for a sequence that isn't in the
   guest's library. Add a user-facing error toast at the save-panel catch
   (`save-panel-state.svelte.ts:253-330`).
3. **One canonical keep.** Route the four bypass paths through
   `LibrarySaveService.saveSequence`, each assembling `SaveToLibraryOptions` from
   its own context (viewer builds `creatorIntent`/`intendedProp` onto the
   `SequenceData` as today; scan supplies `visibility:"private"`; video-record and
   retro their names). Surface `ALREADY_EXISTS` synchronously from the service so
   the scan path's dedupe keeps working.
4. The service instance is obtained via the existing
   `getLibrarySaveService()` (`$lib/features/library/get-library-save-service`,
   used at `SaveToLibraryPanel.svelte:25`) — **do not** construct a second one and
   **do not** invent `CreateModuleState.getLibrarySaveService()` (it doesn't exist).

## Files (SP1)

- `library-contract-types.ts` — `SaveResult` gains `persisted`, `isGuest`.
- `library-save-service.ts` — set the flags; reject on Dexie failure; surface
  `ALREADY_EXISTS` synchronously.
- `save-panel-state.svelte.ts` — error toast on save failure.
- `library-action-handler.svelte.ts`, `ScanCardSheet.svelte`,
  `VideoRecordCoordinator.svelte`, `notation-adapter.ts` — route through
  `LibrarySaveService`.

## Tests (SP1)

- A guest save via each of the four migrated paths produces a Dexie row (reads
  back through the guest library read).
- Dexie-write rejection ⇒ `saveSequence` rejects; no success toast; caller shows
  an error.
- Scan path still rejects synchronously with `ALREADY_EXISTS`.
- `SaveResult.persisted`/`isGuest` correct for guest vs full account.

---

# SP2 — Anonymous-Account Preservation

## Problem

Converting a guest to a full account can abandon the anonymous uid (and the
just-saved sequence) on several modal routes, and the draft-capture that would
rescue it reads Firestore, missing fresh Dexie-only saves.

## Verified route matrix (from the signup modal)

| Route | Site | Anon-safe today | Fix class |
|---|---|---|---|
| Google button | `SocialAuthCompact.svelte:161-168` | ✓ links + import | — |
| Facebook / Instagram | `authenticator.ts:123-172` | ✓ links + import | — |
| Email/password **signup** | `EmailPasswordAuth.svelte:108-124` | ✓ links + import | — |
| **Google One Tap** | `authenticator.ts:115` (`GoogleOneTap.svelte:105`) | ✗ strands | LINK-FIX |
| **Email/password sign-in** | `EmailPasswordAuth.svelte:136-140` | ✗ strands (most-reached) | IMPORT-FIX |
| **Cross-browser magic link** | `email-link-completion.ts:152-154` | ✗ strands | IMPORT-FIX (server) |
| **Retro login** | `RetroLoginDialog.svelte:55-92` | ✗ strands | GUARD-FIX |

Plus two infra facts:
- `captureAnonymousDrafts` reads **Firestore**
  (`library-repository.ts:854-859`), so a fresh save must be captured from **Dexie**
  for guests (or SP1's durable write must have completed and synced) — the capture
  source is the load-bearing fix, not just the routes.
- `library-save-service.ts:143` calls the dead `openAuthDialog()`; replace with
  `authDrawerState.show("signup", "save")` so the save-cap nudge actually opens the
  modal that contains these fixes.

## Design (SP2)

1. **One Tap link-fix.** `signInWithGoogleCredential` (`authenticator.ts:115`):
   if `currentUser.isAnonymous`, link the credential (extract the native-branch
   link/collision shape from `anonymous-upgrade.ts:135-156`), then
   `promptAnonymousImport` on collision.
2. **Sign-in-mode capture.** `EmailPasswordAuth.svelte:136-140`: capture anon
   drafts before `signInWithEmailAndPassword`, `promptAnonymousImport` after.
3. **Capture from Dexie for guests.** `captureAnonymousDrafts` (or a new
   guest-aware wrapper) reads local Dexie sequences (which SP1 guarantees exist)
   rather than Firestore-only, so a just-saved sequence is always importable.
4. **Dead-modal fix.** `library-save-service.ts:143` →
   `authDrawerState.show("signup", "save")`.
5. **Retro guard.** `RetroLoginDialog.svelte` gains the `isAnonymous` branch
   `AccountPopover.svelte:110-134` already uses.
6. **Magic-link carry (largest).** Thread `anonUid` through `sendMagicLink`
   (`EmailLinkAuth.svelte:115-119` → `firebase-functions/src/sendMagicLink.ts`),
   persist server-side, resolve + Admin-SDK import on completion
   (`email-link-completion.ts:152-154`). The codebase deliberately deferred this
   (`EmailLinkAuth.svelte:71-73`) pending exposure data — keep it last; it may be
   split to a follow-up if telemetry shows the cross-browser case is rare.

## Tests (SP2)

- One Tap / sign-in-mode / retro: an anonymous guest with a local save keeps the
  uid or imports the sequence; assert the saved id survives.
- `captureAnonymousDrafts` returns a Dexie-only (un-synced) sequence for a guest.
- Save-cap nudge opens the real `authDrawerState` modal.
- Magic-link: same-browser links; cross-browser imports (or is explicitly
  deferred with telemetry).

---

# SP3 — First-Session Activation

Depends on SP1 (durable keep) and SP2 (safe conversion). The original two-leak
feature, with every Rev-2 review fix folded in.

## Part A — one-tap generate-and-keep

- **Command** (`start-first-sequence.ts`, headless, TDD-tested as before):
  generate → load into the real tab `SequenceState.setCurrentSequence(seq)` →
  keep via `getLibrarySaveService().saveSequence(...)` → hand off to the coordinator
  only on a **persisted** guest keep. Named `generate-failed`/`persist-failed`.
- **Prop:** `PropType.STAFF` — the domain default (`tka-domain.md`, and every
  default-prop site: `viewer-3d-state.svelte.ts:80`, `performer-settings-types.ts:50`,
  `start-position-utils.ts:196`). The Rev-1 `PropType.FAN` was wrong.
- **Generation config:** a fixed, product-approved starter preset (not
  `createGenerationConfigState()`, which loads the device-global saved config and
  can inherit another account's settings, `generate-config.svelte.ts:203`). Lazy
  import the orchestrator on button click, not at module load.
- **Surface:** extend `GenerateEmptyState.svelte` (a >60% match — same collapsed
  slot, Crossfade, offer-card pattern) to also render the first-run starter, and
  **generalize its tab gating to cover empty Construct** (today it's generator-only,
  `StandardWorkspaceLayout.svelte:224`). Migrate its hand-rolled `.offer-btn` to
  `PanelButton` (`panel/PanelButton.svelte` — primary/secondary/disabled/44px;
  add a `busy` state or put a spinner in `children`). No new hand-rolled buttons.
- **Eligibility (three-state, account-aware, no flash):** `unknown` until resolved;
  `true` only for empty Construct + resolved-zero-library + not-dismissed. Guest →
  Dexie count; full account → Firestore `limit(1)`; **never the global Dexie count
  for a full account**. Gate to Construct explicitly.
- **No-uid local resolution:** a signed-out visitor never triggers the boot sync
  (`initializeChildServices` is `if(user)`-gated, `auth-state.svelte.ts:556`), so
  the starter state must resolve locally when `effectiveUserId` is null (mirror
  `appEntryState`'s no-uid `resolveCloudSync()`, `app-entry-state.svelte.ts:331-335`
  — not `firstRunState`'s no-resolve branch).
- **Tutorial arbitration + flag:** while the activation flag is on and the starter
  is eligible, suppress `offerCreateTutorial()` (`CreateModule.svelte:433`); with
  the flag off, legacy behavior and the library CTA are inert.
- **Library dead-end CTA:** host-supplied `emptyAction` prop on `BrowsePanel`
  (non-filter empty only), passed from `AllLibraryView`, navigating
  `setCurrentModule("create", "construct")` and volatile-re-arming the starter.

## Part B — proactive keep-on-first-save

- **Coordinator** (`postSaveActivation`, module singleton — consistent with
  `authDrawerState`/`firstRunState` precedent, **not** refactored to factory/context):
  fed a `SaveOutcome` by SP1's canonical save. Gates to still-guest + once-per-guest-UID.
- **Two-phase guard (fixes premature consumption):** the coordinator **queues** an
  eligible prompt; the root host (`PostSaveActivationHost` in `MainApplication`)
  calls `markPresented()` **after** the `AuthNudge` actually mounts; only then is
  the guard consumed and `_shown` emitted. A blocked/failed mount never burns the
  guest's one chance. The localStorage guard has an **in-memory per-uid fallback**
  so a throwing store doesn't make it prompt every save.
- **Fire after the surface closes:** the create path fires the coordinator after
  `handleClose()` (`save-panel-state.svelte.ts`); viewer/scan/video/retro paths
  fire at root (no panel).
- **Convert:** `authDrawerState.show("signup", "guest-first-save")` → the SP2-hardened
  modal → uid + sequence preserved. New `AUTH_NUDGE_TEXTS["guest-first-save"]`:
  "Create a free account to keep your sequences and find them on any device."
  (contains the canonical phrase; passes the 11→12 trigger-map test).

## Invalidation & flag (SP3 cross-cutting)

- **Signout/account-switch reset:** add `firstSequenceStarterState.resetCloudSync()`
  and a `postSaveActivation` reset to the signout cascade
  (`auth-state.svelte.ts:640-668`, alongside the existing
  `appEntryState.resetCloudSync()`), so account B never inherits account A in-session.
- **Rollout flag:** a **PostHog capability flag**
  `capability:onboarding:first-session-activation`, defaulted **off**
  (registered in the `FeatureId` domain + `DEFAULT_FEATURE_FLAGS`, read via
  `canAccess(...)` + `flagsVersion` in a `$derived`,
  `post-hog-feature-flag-service.svelte.ts`), not a compile-time constant — so it
  ships dark and rolls back without a deploy.
- **Session re-arm is consumed** by both `markDismissed()` and a successful keep,
  so "I'll build my own" after the library CTA actually dismisses.
- **Files & dir:** new onboarding components live under
  `src/lib/shared/onboarding/components/` (the existing dir); `src/lib/features/onboarding`
  does not exist. Every new file carries a one-line reuse justification per
  `never-hand-roll.md`.

## Tests (SP3)

Per the Rev-2 list plus the review's additions: no-uid signed-out boot resolves
locally; A→B account switch resets and rejects stale in-flight reads; Firestore
eligibility failure stays `unknown` (never "empty"); prompt guard consumed only
after mount; storage failure falls back to once-per-session; flag off emits
nothing, writes no guards, hides the CTA, preserves the legacy tutorial; re-arm
consumed by either action; starter gated to Construct; eligibility + tutorial
arbitration share one pure predicate.

---

## Operational corrections (all sub-projects)

- **One check per turn, machine-wide.** Use `check:watch`/`check:fast` while
  iterating and **one** `npm run check` at the end (`fast-iteration-loop.md`,
  `resource-budget.md`) — not a full `svelte-check` per task.
- **PowerShell-first commands.** No bash `/tmp`, `grep` pipelines, or line
  continuations in plan steps; use the scratchpad dir and PowerShell/Bash-tool
  syntax explicitly.
- **Manual verification** uses an **isolated test profile/origin**, never clears
  site data on Austen's `:5173` primary profile, and requires explicit browser
  permission. Prove uid/data preservation by recording the uid before/after and
  querying the saved sequence by id — not a screenshot.

## Success metrics (PostHog)

- SP1: guest saves via all paths appear in the guest library (funnel: save →
  library-view non-empty).
- SP3 Leak A: new-signup first-session `sequence_save` rate rises from ~0.
- SP3 Leak B: `onboarding_guest_first_save_prompt_shown → guest_upgraded_to_account`
  measurable and non-trivial, reaching existing 1-save guests.
- SP2 guardrail: post-conversion sequence-retention (saved id present after
  upgrade) at ~100% across routes.

## Requirements ledgers

**SP1:** [ ] `SaveResult.persisted`+`isGuest` · [ ] Dexie-failure rejects + panel
error toast · [ ] four paths routed through `LibrarySaveService` · [ ]
`ALREADY_EXISTS` surfaced synchronously · [ ] tests (4 paths persist, failure
rejects, dedupe) · [ ] one full check green.

**SP2:** [ ] One Tap link-fix · [ ] sign-in-mode capture+import · [ ] capture from
Dexie for guests · [ ] dead-modal `openAuthDialog`→`authDrawerState.show` · [ ]
retro guard · [ ] magic-link carry (or deferred w/ telemetry) · [ ] tests (id
survives per route).

**SP3:** [ ] headless generate-then-keep (STAFF, fixed preset, lazy import) · [ ]
extend `GenerateEmptyState` + `PanelButton`, Construct gating · [ ] three-state
account-aware eligibility + no-uid local resolution · [ ] tutorial arbitration ·
[ ] starter dismissal state (local+cloud+missing-doc reset+boot sync) · [ ]
library `emptyAction` CTA · [ ] `guest-first-save` key+copy (12-trigger test) · [ ]
coordinator + two-phase `markPresented` guard + in-memory fallback · [ ] fire from
all paths post-close/root · [ ] signout/switch invalidation · [ ] PostHog
capability flag (off) · [ ] session re-arm consumed both ways · [ ] tests per list
· [ ] one full check green.

## Related

- `project_onboarding_remediation`, `project_guest_access_tier`
- `.claude/rules/never-hand-roll.md`, `primitive-discovery.md`,
  `no-layout-shift.md`, `clickables-look-like-buttons.md`, `no-checkboxes.md`,
  `simplified-word-display.md`, `fast-iteration-loop.md`, `resource-budget.md`
- Superseded plan: `docs/superpowers/plans/2026-07-22-first-session-activation.md`
- `docs/superpowers/specs/shipped/2026-07-18-onboarding-remediation-index.md`

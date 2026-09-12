# Guest-Save → Sign-In Continuity Audit

**Status:** IN PROGRESS (progress publish 1 — findings confirmed by static trace,
repro tests pending)
**Date:** 2026-09-12
**Scope:** READ-ONLY audit. No application code changed.
**Branch:** `claude/guest-save-audit-iyayl1`
**Session:** `session_01XKgrpvpxBttgxeaNzPKsJC`
**Baseline commit:** `8f6eeaf0`
**Starting spec:** `docs/superpowers/specs/active/2026-07-22-first-session-activation-design.md`

> Branch note: the task brief proposed `codex/opus-guest-save-audit`. The cloud
> session's push policy pins this session to the task-specific branch
> `claude/guest-save-audit-iyayl1`, so the artifacts land there instead. No
> worktree was created: this container is an isolated ephemeral clone with no
> parallel agents in it, so the primary checkout *is* a task-owned tree here.
> The two concurrent agents named in the brief (quick-viewer prop selection,
> gallery carousel wrapping) touch no file listed below.

---

## Verification limits (stated up front)

- No production credentials, no Firebase emulator, and no browser in this
  container. Every finding below is a **static trace** through current source,
  plus **isolated unit repros** using the project's existing mock harness
  (`tests/unit/library-save-service-persisted.test.ts` pattern).
- Firestore **rules** behavior is read from `firestore.rules` as source, not
  exercised against the emulator (`tests/config/vitest.rules.config.ts` needs
  `npm run test:rules` + emulators, unavailable here).
- Claims about what the user *sees* are derived from the read paths named in
  each finding, not from a rendered surface.

---

## Findings (ranked by severity)

### F1 — CRITICAL. The guest save cap counts the whole unscoped Dexie table, so any device that has ever held 3 saves permanently refuses guest saves while showing an empty library

**Locations**
- Cap check: `src/lib/features/library/services/library-save-service.ts:144-158`
  (`db.sequences.count()`)
- Guest library read: `src/lib/shared/browse/engine/create-browse-engine.svelte.ts:645-665`
  (ledger-scoped: `getSavedSequenceIds(requestedUserId)`)
- Cap value: `src/lib/shared/auth/domain/guest-access-config.ts:11` (`GUEST_SAVE_CAP = 3`)
- Ledger: `src/lib/shared/library/services/saved-sequence-ledger.ts`

**Trigger.** Sign in, save 3+ sequences, sign out. Then try to save as a guest.

**Cause.** Two different definitions of "the guest's sequences" sit on either
side of the same feature:

- The **read** side was correctly scoped to the per-uid ledger — the browse
  engine explicitly refuses to fall back to the whole device cache
  ("The device cache survives sign-out and includes other sessions' work").
- The **cap** side was not. `db.sequences.count()` counts every row in a table
  that is flat, not uid-scoped, and never cleared on sign-out
  (`clearAllData` has no auth-change caller — verified by grep across `src/`).

A full-account save also writes Dexie (`library-save-service.ts:230`, the write
is unconditional), so a signed-in user's own saves inflate the counter that
later gates them as a guest. After sign-out `effectiveUserId` becomes a fresh
anonymous uid with an empty ledger, so the library renders **0 sequences** while
the cap reports **full**. The save throws `GUEST_CAP` and opens the signup modal
with "Guest save limit reached (3)".

**Impact.** Work is refused outright, not merely hidden — and the error is
unfalsifiable from the UI, since the library the message refers to looks empty.
Also hits any genuinely new guest on a shared/kiosk/family device.

**Fix direction.** Count the same set the read counts:
`getSavedSequenceIds(authState.effectiveUserId).length`, or a Dexie count
filtered to that ledger. One predicate, one owner.

---

### F2 — HIGH. Upgrade-import discards the guest's chosen visibility and republishes private guest work to the community gallery

**Locations**
- `src/lib/shared/auth/services/anonymous-upgrade.ts:359-373` (`importDrafts` →
  `repo.saveSequence(draft)`, **no overrides argument**)
- `src/lib/shared/library/services/library-repository.ts:510-519`
  (new-sequence branch: `visibility: overrides?.visibility ?? "public"`)
- `src/lib/shared/library/domain/models/library-sequence.ts:169`
  (`createLibrarySequence`: `visibility: options.visibility ?? "public"` — the
  input sequence's own field is never consulted)
- `src/lib/features/library/services/library-save-service.ts:204-225` (the Dexie
  row carries visibility **only** under `pendingSyncMetadata.visibility`; there
  is no top-level `visibility` key on `SequenceData`)

**Trigger.** As a guest, save a sequence **private** (≥ `MIN_COMMUNITY_STEPS`
steps). Sign up with an email/Google credential that already belongs to an
existing account → collision → "Keep what you just made?" → Import.

**Cause.** The captured draft is a raw Dexie row. Its visibility lives in
`pendingSyncMetadata.visibility`, which `importDrafts` never reads and
`createLibrarySequence` never inspects. With no `overrides.visibility`, the
`?? "public"` default wins. The importing session is now a **full** account, so
the `isFullUser()` gate no longer suppresses the mirror and
`publicIndexSyncer.syncToPublicIndex` (`library-repository.ts:704-706`) publishes
it to the community gallery.

The sub-minimum community gate (`meetsCommunityMinimum`) is the only thing
limiting blast radius — it silently downgrades short sequences, so the bug is
invisible in tests that use 1-step fixtures and fires only on real-length work.

**Impact.** The user's explicit privacy choice is inverted by an action labelled
"Import", at the exact moment they were promised their work would be preserved.
This is the one finding here that is worse than losing the sequence.

**Fix direction.** `repo.saveSequence(draft, { visibility: draft.pendingSyncMetadata?.visibility ?? "private", notes: draft.pendingSyncMetadata?.notes })`.
Defaulting to `private` on import is the safe direction: an import is not a
publication decision.

---

### F3 — HIGH. Confirming the import drops every captured draft before the import runs, and no caller can observe a failure

**Locations**
- `src/lib/shared/auth/state/anonymous-import-prompt.svelte.ts:31-37`
  (`confirmAnonymousImport`: `state.drafts = []` **before** `await importDrafts(drafts)`, no `try`/`catch`)
- `src/lib/shared/foundation/ui/ConfirmDialog.svelte:40,117`
  (`onConfirm: () => void`; called as `onConfirm();` — the returned promise is
  neither awaited nor caught)
- `src/lib/shared/application/components/MainApplication.svelte:815`
  (`onConfirm={confirmAnonymousImport}` — the async function is passed straight in)
- `src/lib/shared/auth/services/anonymous-upgrade.ts:359-373` (`importDrafts`
  **rethrows** anything that is not `ALREADY_EXISTS`/`INVALID_DATA`, abandoning
  the rest of the loop and discarding the running `imported` count)

**Trigger.** Collision sign-in with captured drafts → click **Import** while
offline, or with any Firestore rejection on the first draft (permission-denied,
transient unavailable, a moderation/normalization rejection).

**Cause.** Three failures compose:
1. The prompt state is cleared *before* the await, so the drafts are
   unrecoverable the moment Import is clicked.
2. `importDrafts` rethrows mid-loop, so drafts after the failing one are never
   attempted, and the count of ones that *did* import is thrown away with the
   stack — no success toast either.
3. `ConfirmDialog` discards the promise, so the rejection becomes an unhandled
   rejection. The dialog has already closed itself (`isOpen = false`,
   `ConfirmDialog.svelte:118`). No toast, no error, no retry, no re-offer.

**Impact.** The user clicks the button that says "Import", sees the dialog close
cleanly, and their guest sequences are in neither account. The drafts still sit
in Dexie, but under the **old anon uid's** ledger, which nothing will ever read
again (the new uid's ledger is empty, and a full account reads Firestore).
Silent, total, permanent.

**Fix direction.** Clear `state.drafts` only after a settled import; catch and
surface a failure with the drafts restored so Import can be retried; make
`importDrafts` accumulate per-draft failures rather than rethrowing out of the
loop; type `ConfirmDialog`'s `onConfirm` as `() => void | Promise<void>` and
attach a `.catch`.

---

### F4 — MEDIUM-HIGH. The retro shell's sign-in abandons an anonymous guest — the spec's GUARD-FIX is genuinely still open

**Locations**
- `src/lib/features/retro/win95/components/shell/RetroLoginDialog.svelte:51`
  (`signInWithEmail`) and `:73` (`signInWithGoogle`) — no `isAnonymous` branch,
  no `captureAnonymousDrafts`
- `src/lib/shared/auth/services/authenticator.ts:192-198` (`signInWithEmail` is a
  bare `signInWithEmailAndPassword`)
- `src/lib/shared/auth/services/authenticator.ts:75-110` (`signInWithGoogle`:
  the desktop, native and popup branches all sign in plainly; only
  `signInWithGoogleCredential` at `:118-137` has the guest branch)
- `src/lib/features/retro/dos/services/command-parser.ts:500` — same bare
  `signInWithEmail` from the DOS shell
- Guest saves genuinely reach this shell:
  `src/lib/features/retro/win95/adapters/notation-adapter.ts:159` routes through
  `LibrarySaveService` (SP1 migrated it)

**Trigger.** Save a sequence inside the retro shell as a guest, then log on
through the retro login dialog (or `LOGIN` in the DOS shell).

**Cause.** Every *other* surface routes a guest through `anonymous-upgrade`;
these two call the plain authenticator entry points directly. The anonymous uid
is replaced with no link attempt and no draft capture.

**Impact.** The anon uid is abandoned. Its Dexie rows survive but are keyed to a
ledger uid that is never read again, and its Firestore docs (anonymous owners
*can* write `users/{uid}/sequences` — `firestore.rules:599` `allow create: if isOwner(userId)`)
are orphaned under a uid nobody can sign into. Unlike F3 the user is never even
offered the import.

**Fix direction.** Both retro entry points should call the same
`upgradeAnonymousWithEmail` / `upgradeAnonymousWithGoogle` +
`promptAnonymousImport` pair that `EmailPasswordAuth.svelte` and
`SocialAuthCompact.svelte` already use. This is one shared capability with two
call sites bypassing its owner.

---

### F5 — MEDIUM. Nothing reconciles a failed guest sync at the moment of upgrade, so cloud-unsynced guest work disappears from the library until the next page load

**Locations**
- `src/lib/features/library/services/library-sync-retry.ts:187-205`
  (`initLibrarySyncRetry`: one pass at boot + a reconnect listener — **no
  auth-change trigger**)
- `src/routes/+layout.svelte:701-702` (the only caller, at layout mount)
- `src/lib/shared/auth/services/anonymous-upgrade.ts:140-209`
  (`notifyUpgradeSignup`, the single convergence point of every in-place link —
  refreshes auth state and the user doc, but never kicks a sync pass)
- Read switch: `src/lib/shared/browse/engine/create-browse-engine.svelte.ts:645`
  — `!authState.isFullAccount` selects Dexie, otherwise Firestore

**Trigger.** Guest saves a sequence while offline or while any Firestore write
fails (row lands as `syncStatus: "failed"`), then signs up in-place (link,
uid preserved) in the same session.

**Cause.** An in-place link flips `isFullAccount` true, which correctly
invalidates the browse cache (`create-browse-engine.svelte.ts:504-528` watches
`isFullAccount`, not just `effectiveUserId` — that part is fixed). The read then
goes to Firestore. But the Dexie rows that never reached Firestore have no
mechanism to get there: the retry pass only fires at boot and on reconnect, and
the upgrade path does not call it.

**Impact.** Recoverable, not permanent — a reload runs `initLibrarySyncRetry`
and the row syncs. But at the moment of conversion, which is precisely when the
product promises "Account created. Your sequences are saved."
(`anonymous-upgrade.ts:194`), the library can render without them. The toast
asserts a state the read path cannot yet show.

**Fix direction.** Call `retryPendingSyncs()` from `notifyUpgradeSignup` after
`refreshUser()`, and after a collision import. It is already idempotent and
guarded by `retryInFlight`.

---

## Old spec claims now RESOLVED

Verified against current source; the spec's Rev-3 problem statement is
substantially stale.

| Spec claim (2026-07-22) | Current state |
|---|---|
| "Guest saves through four 'keep' paths never reach the guest's library" (viewer / scan / video-record / retro call `LibraryRepository` directly) | **RESOLVED.** All four route through `getLibrarySaveService().saveSequence`: `ScanCardSheet.svelte:214`, `VideoRecordCoordinator.svelte:112`, `notation-adapter.ts:159`, and the viewer via `library-state.svelte.ts:474`. |
| "`LibrarySaveService` swallows `ALREADY_EXISTS` inside fire-and-forget sync" | **RESOLVED.** Synchronous `hasMatchingContent` pre-check rejects before the Dexie write (`library-save-service.ts:169-188`); covered by an existing test. |
| "A Dexie-write failure warns and continues" | **RESOLVED.** Rejects with `LibraryError("PERSIST_FAILED")` (`library-save-service.ts:256-260`). |
| "`SaveResult` needs `persisted`/`isGuest`" | **RESOLVED.** Returned at `library-save-service.ts:385`. |
| "`captureAnonymousDrafts` reads Firestore, so a fresh Dexie-only save is missed" | **RESOLVED, and better than specified.** It now reads Dexie *filtered by the per-uid `saved-sequence-ledger`* (`anonymous-upgrade.ts:108-119`), which also closes the shared-device leak the spec did not anticipate. |
| "Google One Tap strands the guest (`authenticator.ts:115`, no `isAnonymous` check)" | **RESOLVED.** `signInWithGoogleCredential` links then prompts on collision (`authenticator.ts:118-137`). |
| "Email/password **sign-in** mode strands the guest (most-reached route, zero mitigation)" | **RESOLVED.** Captures before the swap and prompts after (`EmailPasswordAuth.svelte:143-156`). |
| "Cross-browser magic link strands the guest" | **RESOLVED for the same-browser case** — anon link, collision → `upgradeMagicLinkCollision` + prompt (`email-link-completion.ts:235-264`). The *cross-browser* server carry (SP2 item 6) remains deliberately deferred, as the spec allowed. |
| "`library-save-service.ts:143` calls the dead `openAuthDialog()`" | **RESOLVED.** Now `authDrawerState.show("signup", "save-limit")` (`library-save-service.ts:150`). |
| "Account A's state can bleed into account B in-session" | **RESOLVED.** The signout cascade resets `firstRunState`, `appEntryState` and `postSaveActivation` (`auth-state.svelte.ts:762-786`), and the browse engine keys its cache on **both** `effectiveUserId` and `isFullAccount` (`create-browse-engine.svelte.ts:504-528`) — so an in-place link, which does not change the uid, still invalidates. |
| SP3 coordinator / two-phase guard | **SHIPPED.** `post-save-activation-state.svelte.ts` exists and is reset on signout; `saved.persisted` gates the fire at `ScanCardSheet.svelte:229`. |

**Still open from the spec's own ledger:** the SP2 retro GUARD-FIX (**F4** above)
and the cross-browser magic-link carry (deferred by design).

---

## Status of this document

Progress publish 1. Repro tests and the final ranked fix plan follow in the
next update on this branch.

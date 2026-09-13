# Guest-Save → Sign-In Continuity Audit

**Status:** COMPLETE (publish 3 — revised after review of `0e78563258`: F5
re-scoped to cross-account replay, F1/F3 severity corrected, F2 evidence
separated from inference; F1/F2/F3/F5 reproduced by failing tests)
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
> parallel agents in it, so the primary checkout _is_ a task-owned tree here.
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
- Claims about what the user _sees_ are derived from the read paths named in
  each finding, not from a rendered surface.

---

## Severity ranking (revised after review)

F-numbers are stable IDs, not ranks. This is the order to fix in.

| Rank | ID     | Severity                                  | One line                                                                                                           |
| ---- | ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1    | **F5** | **HIGH — crosses an account boundary**    | A background retry replays one account's unsynced rows into whichever account is signed in next                    |
| 2    | **F2** | HIGH                                      | Upgrade-import discards the guest's recorded visibility; the repository then defaults to public                    |
| 3    | **F1** | HIGH (availability, bounded, recoverable) | The guest save cap counts the whole unscoped Dexie table, so guest saves are refused while the library reads empty |
| 4    | **F3** | MEDIUM-HIGH                               | A failed import puts the pending drafts out of reach with no error and no retry                                    |
| 5    | **F4** | MEDIUM-HIGH                               | The retro shells sign in without the guest-upgrade branch                                                          |

**F5 was re-scoped during review.** It previously read "nothing kicks a sync
pass at upgrade." Investigating the reviewer's evidence showed the missing
trigger is the lesser half: the retry that _does_ run is itself unscoped. The
old framing is retained as F5b below because the fix must address both, but the
replay is the finding.

---

## Findings

### F5 — HIGH. `retryPendingSyncs` replays every unsynced Dexie row into whichever account is signed in when it runs

**Locations**

- `src/lib/features/library/services/library-sync-retry.ts:121-131` — the sweep
  filters **only** on `syncStatus` and `pendingSyncMetadata.blockedReason`. No
  uid, no ledger.
- `src/lib/features/library/services/library-sync-retry.ts:137-145` — each row is
  handed to `repo.saveSequenceWithMetadata`, with
  `visibility: sequence.pendingSyncMetadata?.visibility ?? "public"`.
- `src/lib/shared/library/services/library-repository.ts:397` —
  `getWritableUserId()` → `getUserId()` (`:234-240`) → `authState.effectiveUserId`,
  i.e. **the current session**, not the row's author.
- `src/lib/shared/library/domain/models/library-sequence.ts:157-167` —
  `createLibrarySequence(sequenceData, ownerId, …)` stamps `ownerId` from that
  uid.
- Triggers, both unprompted: `src/routes/+layout.svelte:701-702` (app boot,
  **not** gated on auth) and `library-sync-retry.ts:214-215` (every reconnect).

**Trigger.** Account A saves on this device while offline or during any
Firestore failure → the row lands in Dexie with `syncStatus: "failed"`. A signs
out. B signs in on the same device (or a guest does). Dexie is flat, not
uid-scoped, and never cleared on sign-out. The next boot or reconnect sweeps A's
row and writes it under B.

**Cause.** The retry treats "rows in this browser" as "rows belonging to whoever
is signed in". The `saved-sequence-ledger` exists precisely to distinguish those
two sets, and the guest library read and `captureAnonymousDrafts` both consult
it — this path does not.

**Impact.** A's sequence appears in B's library attributed to B
(`ownerId: B`). A row that never recorded metadata is replayed as
`visibility: "public"`, which for a full-account B also mirrors it to the
community gallery. This is one user's work crossing into another user's account
without either of them acting — worse than losing it.

**Evidence vs. inference — stated explicitly, as for F2.** The repro mocks the
repository, so it proves the _handover_, not the write.

| Step                                                                     | Status                                                                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| The sweep selects a row the signed-in account does not own               | **Tested** — `tests/unit/audit/guest-save-cross-account-replay.test.ts`                                         |
| It passes that row to the current account's `saveSequenceWithMetadata`   | **Tested** (mocked repository records the call)                                                                 |
| A row with no recorded metadata is handed over as `visibility: "public"` | **Tested** (fixture clears `MIN_COMMUNITY_STEPS`, so the value is not pre-empted by the community downgrade)    |
| The repository stamps `ownerId` from `authState.effectiveUserId`         | **Inference from source, NOT tested** — `library-repository.ts:397` → `:234-240`, `library-sequence.ts:157-167` |
| The resulting public sequence is mirrored to the community gallery       | **Inference from source, NOT tested** — `library-repository.ts:704-706`; needs the emulator                     |

So "a foreign row is selected and handed to the wrong account's repository with
a public visibility" is demonstrated. "It is therefore stored under B's
`ownerId` and appears in the gallery" is read from the call sites above, not
observed. The fixture uses a **4-step** sequence deliberately:
`MIN_COMMUNITY_STEPS` is 4 (`sequence-min-length.ts:7`) and
`meetsCommunityMinimum` downgrades anything shorter to private inside
`saveSequence`, so a 1-step row could not reach the gallery whatever the retry
passed — the first draft of this test used one, which made the public assertion
true but inconsequential.

**F5b (the original framing, still true and still worth fixing).** Nothing kicks
a reconciliation pass at the moment of upgrade —
`initLibrarySyncRetry` runs only at boot and on reconnect, and
`anonymous-upgrade.ts:140-209` (`notifyUpgradeSignup`, the convergence point of
every in-place link) does not call it. So a guest's unsynced row can be missing
from the library at the exact moment the product says "Account created. Your
sequences are saved." (`anonymous-upgrade.ts:194`). Recoverable on reload.

> **Correction to this audit's own first draft.** Progress publish 1 recommended
> calling `retryPendingSyncs()` from `notifyUpgradeSignup` **and after a
> collision import**. The collision half of that is wrong and the reviewer was
> right to stop it: on a collision the signed-in uid is a _different_ account,
> so the blanket sweep is exactly the replay described above. Scoping, not
> triggering, is the load-bearing fix. The revised plan below reflects that.

---

### F2 — HIGH. Upgrade-import discards the guest's recorded visibility, and the repository defaults the result to public

**Locations**

- `src/lib/shared/auth/services/anonymous-upgrade.ts:364` — `repo.saveSequence(draft)`,
  **no overrides argument**.
- `src/lib/shared/library/services/library-repository.ts:510-519` — new-sequence
  branch: `visibility: overrides?.visibility ?? "public"`.
- `src/lib/shared/library/domain/models/library-sequence.ts:169` —
  `createLibrarySequence`: `visibility: options.visibility ?? "public"`. The
  input sequence's own fields are spread first and then **overwritten**, so a
  draft cannot carry its own visibility through.
- `src/lib/features/library/services/library-save-service.ts:224` — the Dexie row
  records the choice **only** under `pendingSyncMetadata.visibility`;
  `SequenceData` has no top-level `visibility`.

**Reachability — verified.** Private is not an edge case, it is the default.
`save-panel-state.svelte.ts:84` initialises `publishToCommunity = $state(false)`,
and `:400` maps it to `visibility: publishToCommunity && !isFlagged ? "public" : "private"`.
A guest who saves without opting into the community toggle saves **private**.

**Metadata lifetime — verified.** `pendingSyncMetadata` is written once at save
and never cleared from the Dexie row afterwards: `markSequenceSyncStatus` updates
only `syncStatus`, and the `pendingSyncMetadata: undefined` assignments at
`library-repository.ts:604` and `sequence-persistence-normalizer.ts:348` strip it
from the **cloud write payload**, not from Dexie. So the guest's recorded
visibility is still present and readable at import time — it is a sound source
for the fix, whether or not the row ever synced.

**Evidence vs. inference — stated explicitly, per review.**

| Step                                                                                                                                                   | Status                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `importDrafts` passes no visibility override                                                                                                           | **Tested** (mocked repository records a single-argument call)                                         |
| `createLibrarySequence` turns that into `visibility: "public"`                                                                                         | **Tested against real unmocked source** — the failing `createLibrarySequence` case in the audit suite |
| A public, full-account-owned sequence is mirrored to the community gallery via `publicIndexSyncer.syncToPublicIndex` (`library-repository.ts:704-706`) | **Inference from source, NOT tested.** Needs the Firebase emulator, unavailable here.                 |

So "the metadata is dropped and the result is public" is demonstrated; "and it
therefore appears in the community gallery" is read from the mirror call site
and its `isFullUser()` gate, not observed.

**Reproduced:** `tests/unit/audit/guest-save-continuity-audit.test.ts`, `describe("F2 …")`.

---

### F1 — HIGH (availability). The guest save cap counts the whole unscoped Dexie table, so guest saves are refused while the guest's library reads empty

**Locations**

- Cap: `src/lib/features/library/services/library-save-service.ts:144-158`
  (`db.sequences.count()`)
- Read: `src/lib/shared/browse/engine/create-browse-engine.svelte.ts:645-665`
  (ledger-scoped via `getSavedSequenceIds(requestedUserId)`)
- `src/lib/shared/auth/domain/guest-access-config.ts:11` (`GUEST_SAVE_CAP = 3`)

**Trigger.** Sign in, save 3+ sequences, sign out, try to save as a guest.

**Cause.** The read side was scoped to the per-uid ledger; the cap side was not.
A full-account save also writes Dexie unconditionally
(`library-save-service.ts:230`), and `clearAllData` has no auth-change caller, so
a signed-in user's own rows inflate the counter that later gates them as a guest.

**Impact — bounded and recoverable, revised down from the first draft.** New
guest saves are refused with "Guest save limit reached (3)" while the library
shows nothing, which makes the message unfalsifiable from the UI. But **no data
is lost or destroyed**, and the state is exit-able by ordinary means:

- signing into any full account removes the cap entirely (`isFullAccount` skips
  the check);
- re-saving a sequence already in Dexie is an update and is always allowed
  (`alreadySavedLocally`);
- clearing site data, or a different browser/profile, resets it.

It is an availability bug at the guest tier — the one moment the product most
needs the save to work — not permanent damage. The first draft of this audit
labelled it CRITICAL and used permanent language; that was overstated.

**Reproduced:** audit suite, `describe("F1 …")`, with a companion guard asserting
the cap must still fire once the guest genuinely owns three.

---

### F3 — MEDIUM-HIGH. A failed import puts the pending drafts out of reach, with no error and no retry

**Locations**

- `src/lib/shared/auth/state/anonymous-import-prompt.svelte.ts:31-37` —
  `state.drafts = []` runs **before** `await importDrafts(drafts)`; no `try`/`catch`.
- `src/lib/shared/foundation/ui/ConfirmDialog.svelte:40,117-118` —
  `onConfirm: () => void`, invoked as `onConfirm();` (promise neither awaited nor
  caught) and `isOpen = false` regardless.
- `src/lib/shared/application/components/MainApplication.svelte:815` — the async
  `confirmAnonymousImport` is passed straight in.
- `src/lib/shared/auth/services/anonymous-upgrade.ts:359-373` — `importDrafts`
  rethrows anything but `ALREADY_EXISTS`/`INVALID_DATA`.

**Trigger.** Collision sign-in with captured drafts → click **Import** while
offline or with any Firestore rejection.

**Impact — scoped correctly, revised from the first draft.** This is **not**
permanent data destruction:

- the Dexie rows themselves are untouched and survive;
- drafts that imported before the failure stay imported in the new account.

What is lost is **access**: the in-memory prompt state is cleared before the
await, the dialog has already closed itself, and the rejection goes unhandled —
`ConfirmDialog` neither awaits nor catches the promise, so no code path reacts to
the failure. Nothing tells the user the import failed and there is no surface
left to retry from. The remaining drafts stay in Dexie under the **old
anon uid's** ledger, which no read path consults afterwards (the new uid's ledger
is empty; a full account reads Firestore). Recovering them needs a code change or
manual DB work, not a user action. The first draft called this "silent, total,
permanent"; "silent and not retryable in-session" is accurate.

**Reproduced:** the contract test asserts the drafts remain offerable after a
failed import (fails: count drops 1 → 0). A second test is marked
**characterization** and passes — it records that `importDrafts` abandons the
remaining drafts mid-loop. Per review, the contract test deliberately does **not**
mandate continue-on-error batching; either retaining-for-retry or
continue-on-error satisfies F3.

---

### F4 — MEDIUM-HIGH. The retro shells sign in without the guest-upgrade branch

**Locations**

- `src/lib/features/retro/win95/components/shell/RetroLoginDialog.svelte:51`
  (`signInWithEmail`), `:71` (`signInWithGoogle`) — no `isAnonymous` branch, no capture
- `src/lib/shared/auth/services/authenticator.ts:192-198` — `signInWithEmail` is a
  bare `signInWithEmailAndPassword`
- `src/lib/shared/auth/services/authenticator.ts:75-110` — `signInWithGoogle`'s
  desktop/native/popup branches all sign in plainly; only
  `signInWithGoogleCredential` (`:118-137`) has the guest branch
- `src/lib/features/retro/dos/services/command-parser.ts:500` — same bare call
- Guest saves do reach this shell:
  `src/lib/features/retro/win95/adapters/notation-adapter.ts:159` routes through
  `LibrarySaveService`

**Impact.** The anon uid is replaced with no link attempt and no draft capture,
so unlike F3 the user is never even offered the import. Dexie rows survive but
under a ledger uid nothing reads again; the anon's Firestore docs (anonymous
owners _can_ write `users/{uid}/sequences` — `firestore.rules:599`) are orphaned
under a uid nobody can sign into.

**Not reproduced by test.** This is an _absence_ of a branch at two call sites;
an honest test needs the emulator. Static trace only.

## Old spec claims now RESOLVED

Verified against current source; the spec's Rev-3 problem statement is
substantially stale.

| Spec claim (2026-07-22)                                                                                                                          | Current state                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Guest saves through four 'keep' paths never reach the guest's library" (viewer / scan / video-record / retro call `LibraryRepository` directly) | **RESOLVED.** All four route through `getLibrarySaveService().saveSequence`: `ScanCardSheet.svelte:214`, `VideoRecordCoordinator.svelte:112`, `notation-adapter.ts:159`, and the viewer via `library-state.svelte.ts:474`.                                                                                                                      |
| "`LibrarySaveService` swallows `ALREADY_EXISTS` inside fire-and-forget sync"                                                                     | **RESOLVED.** Synchronous `hasMatchingContent` pre-check rejects before the Dexie write (`library-save-service.ts:169-188`); covered by an existing test.                                                                                                                                                                                       |
| "A Dexie-write failure warns and continues"                                                                                                      | **RESOLVED.** Rejects with `LibraryError("PERSIST_FAILED")` (`library-save-service.ts:256-260`).                                                                                                                                                                                                                                                |
| "`SaveResult` needs `persisted`/`isGuest`"                                                                                                       | **RESOLVED.** Returned at `library-save-service.ts:385`.                                                                                                                                                                                                                                                                                        |
| "`captureAnonymousDrafts` reads Firestore, so a fresh Dexie-only save is missed"                                                                 | **RESOLVED, and better than specified.** It now reads Dexie _filtered by the per-uid `saved-sequence-ledger`_ (`anonymous-upgrade.ts:108-119`), which also closes the shared-device leak the spec did not anticipate.                                                                                                                           |
| "Google One Tap strands the guest (`authenticator.ts:115`, no `isAnonymous` check)"                                                              | **RESOLVED.** `signInWithGoogleCredential` links then prompts on collision (`authenticator.ts:118-137`).                                                                                                                                                                                                                                        |
| "Email/password **sign-in** mode strands the guest (most-reached route, zero mitigation)"                                                        | **RESOLVED.** Captures before the swap and prompts after (`EmailPasswordAuth.svelte:143-156`).                                                                                                                                                                                                                                                  |
| "Cross-browser magic link strands the guest"                                                                                                     | **RESOLVED for the same-browser case** — anon link, collision → `upgradeMagicLinkCollision` + prompt (`email-link-completion.ts:235-264`). The _cross-browser_ server carry (SP2 item 6) remains deliberately deferred, as the spec allowed.                                                                                                    |
| "`library-save-service.ts:143` calls the dead `openAuthDialog()`"                                                                                | **RESOLVED.** Now `authDrawerState.show("signup", "save-limit")` (`library-save-service.ts:150`).                                                                                                                                                                                                                                               |
| "Account A's state can bleed into account B in-session"                                                                                          | **RESOLVED.** The signout cascade resets `firstRunState`, `appEntryState` and `postSaveActivation` (`auth-state.svelte.ts:762-786`), and the browse engine keys its cache on **both** `effectiveUserId` and `isFullAccount` (`create-browse-engine.svelte.ts:504-528`) — so an in-place link, which does not change the uid, still invalidates. |
| SP3 coordinator / two-phase guard                                                                                                                | **SHIPPED.** `post-save-activation-state.svelte.ts` exists and is reset on signout; `saved.persisted` gates the fire at `ScanCardSheet.svelte:229`.                                                                                                                                                                                             |

**Still open from the spec's own ledger:** the SP2 retro GUARD-FIX (**F4** above)
and the cross-browser magic-link carry (deferred by design).

---

## Reproduction evidence

**Artifacts — FAILING BY DESIGN, NOT MERGE-READY.** They encode the intended
contracts and fail against `main`; that failure is the reproduction. Do not
"fix" the tests — fix the source, or delete these files with this report.

- `tests/unit/audit/guest-save-continuity-audit.test.ts` (F1, F2, F3)
- `tests/unit/audit/guest-save-cross-account-replay.test.ts` (F5) — separate
  file because the first one mocks `library-sync-retry`, which is the module
  under test here

```
pnpm install --frozen-lockfile
pnpm run build:packages          # required: @tka/tka-types must be built first
pnpm exec vitest run --config tests/config/vitest.config.ts tests/unit/audit/
```

Result — **6 failed | 3 passed (9)**:

| ID  | Test                                                         | Outcome  | Observed                                                                       |
| --- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------ |
| F5  | account A's unsynced row is not written while B is signed in | **FAIL** | `saveSequenceWithMetadata` called once — A's row replayed under B              |
| F5  | a metadata-less foreign row is not published public          | **FAIL** | replayed with `visibility: "public"`                                           |
| F5  | a row the signed-in account owns still replays               | pass     | guard: the fix must not disable the retry                                      |
| F2  | the draft's saved visibility reaches the repository          | **FAIL** | `overrides === undefined` — single-argument call                               |
| F2  | `createLibrarySequence` does not publish a private draft     | **FAIL** | returns `visibility: "public"` — **real unmocked source**                      |
| F1  | fresh guest saves on a device holding another session's rows | **FAIL** | `LibraryError: Guest save limit reached (3).` at `library-save-service.ts:151` |
| F1  | cap still enforced once this guest owns 3                    | pass     | guard                                                                          |
| F3  | drafts stay offerable after a failed import                  | **FAIL** | `anonymousImportPrompt.count` 1 → 0; retry state gone                          |
| F3  | (characterization) remaining drafts abandoned mid-loop       | pass     | records current behavior; not a contract                                       |

**Baseline control**, same commit, unchanged suites —
`tests/unit/library-save-service-persisted.test.ts`, `tests/unit/auth/`,
`tests/unit/library/`, `tests/unit/browse-engine-identity-switch.test.ts`:

```
Test Files  64 passed (64)
     Tests  367 passed (367)
```

**F4 has no test, deliberately.** It is a missing branch at two call sites; the
honest test is an emulator integration test (`tests/config/vitest.e2e.config.ts`,
`npm run test:e2e`), unavailable here. A grep-the-source assertion would pass or
fail for reasons unrelated to user-visible behavior.

---

## Ranked fix plan

1. **F5 — scope the retry to the current account** (`library-sync-retry.ts:122-131`).
   Filter the sweep to rows the signed-in uid owns, using the same
   `getSavedSequenceIds(authState.effectiveUserId)` predicate the browse engine
   and `captureAnonymousDrafts` already use. A row with no ledger entry for the
   current uid must be skipped, not replayed. Also replace
   `?? "public"` at `:141` with a private default — a row whose recorded
   visibility was lost should never be published by a background pass.
   **Do not** simply add an upgrade-time trigger: triggering an unscoped sweep
   from the collision path makes this worse, which is what the first draft of
   this audit wrongly proposed.
2. **F2 — pass visibility through the import** (`anonymous-upgrade.ts:364`):
   `repo.saveSequence(draft, { visibility: draft.pendingSyncMetadata?.visibility ?? "private", notes: draft.pendingSyncMetadata?.notes })`.
   The metadata is verified present on the Dexie row at import time. Ship with
   F3 — same function, same review.
3. **F1 — scope the cap to the ledger** (`library-save-service.ts:144-158`).
   Replace `db.sequences.count()` with the guest's own count. One line plus an
   import; makes the cap and the library read share one definition of "the
   guest's sequences". Both F1 tests pin it (one must go green, one must stay
   green).
4. **F3 — make a failed import survivable**
   (`anonymous-import-prompt.svelte.ts:31-37`, `ConfirmDialog.svelte:40,117`).
   Clear `state.drafts` only after the import settles; restore them and surface
   an error on failure so Import can be retried; widen `onConfirm` to
   `() => void | Promise<void>` and `.catch` it. Whether `importDrafts` also
   continues past a failing draft is a separate, optional call. `ConfirmDialog`
   is shared surface — check its other call sites in the same pass.
5. **F4 — route the retro shells through the upgrade owner**
   (`RetroLoginDialog.svelte:51,71`, `dos/services/command-parser.ts:500`), reusing
   `upgradeAnonymousWithEmail` / `upgradeAnonymousWithGoogle` +
   `promptAnonymousImport` as `EmailPasswordAuth.svelte` already does. Closes the
   last open SP2 ledger item that is not the deferred magic-link carry.

**Sequencing.** F5 first — it is the only one that moves data across an account
boundary, and it fires unprompted at every boot and reconnect. F2+F3 together.
F1 and F4 are independent.

**Shared root cause worth one design decision.** F5, F1 and F3 are all the same
underlying fact: `db.sequences` is flat, not uid-scoped, and never cleared on
sign-out, while `saved-sequence-ledger` is the only thing that knows who owns
what — and only some readers consult it. Every fix above is "make this reader
use the ledger too." A single owned helper (`sequencesOwnedBy(uid)`) would be
cheaper than four independent patches and would stop the next reader from
getting it wrong.

---

## Uncertainties

- **F2's final step is inference, not evidence.** That a public, full-account
  sequence reaches the community gallery is read from
  `publicIndexSyncer.syncToPublicIndex` (`library-repository.ts:704-706`) and its
  `isFullUser()` gate. The dropped metadata and the resulting `"public"` value
  are both tested against real source; the mirror write is not.
- **F5's real-world frequency is unmeasured.** It needs a row to be left
  `pending`/`failed` and a second account on the same device. How often guest
  saves fail their sync depends on rules behavior I read but did not exercise —
  note that a guest save resolving to `visibility: "public"` also attempts the
  `publicSequences` mirror, which `isFullUser()` denies and
  `library-repository.ts:704-710` **rethrows**, failing the whole
  `saveSequenceWithMetadata`. If that is the common guest path, failed rows are
  routine rather than offline-only. Flagged, not claimed.
- **F1's severity rests on the read path, not observation.** That the library
  renders empty while the cap reports full follows from
  `create-browse-engine.svelte.ts:645-665`; I did not see it in a browser.
- **F4 assumes the retro shell is reachable by a guest who has saved.** The save
  path is confirmed (`notation-adapter.ts:159`); the shell's own entry gating was
  not checked in a browser.
- No runtime observation of any kind was possible here — no credentials, no
  emulator, no browser. Every "the user sees" statement is derived from the read
  paths cited.

---

## Status of this document

Complete, revised after reviewer feedback on `0e78563258`. Artifacts on
`claude/guest-save-audit-iyayl1`:

- `docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md`
- `tests/unit/audit/guest-save-continuity-audit.test.ts`
- `tests/unit/audit/guest-save-cross-account-replay.test.ts`

No application code was modified.

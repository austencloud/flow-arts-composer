# Guest/Library Account Isolation and Upgrade Persistence

**Domain:** guest/library account isolation, upgrade persistence
**Branch:** `claude/guest-save-audit-iyayl1` (cloud policy pins this session to
its assigned `claude/*` branch; `codex/*` was not available)
**Session:** `session_01XKgrpvpxBttgxeaNzPKsJC`
**Base SHA:** `0945738f` (merge of `origin/main` `c4be1619` into the task branch)
**Final SHA:** `a988b8aa` + this correction commit. Chain: implementation
`f48d9877` → identity fence `928b77ce` → offer-binding + visibility `58012fe5`
→ collision-result binding and unowned/thumbnail fences `06d144cc` → save
side-effect chain + unowned adoption `a988b8aa` → shared-surface note
`a6a318c3` → tag lookups, lifecycle attribution and adoption durability (this
commit).
**Source audit:** `docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md`
(reviewed at `7fabc7d9`)

---

## Drift check before touching anything

`origin/main` had moved two commits past the audit baseline (`8f6eeaf0` →
`c4be1619`, the Hand Tunnel toy). Neither touches this domain:

```
git diff --name-only 8f6eeaf0..origin/main | rg "anonymous-upgrade|library-sync-retry|library-save-service|saved-sequence-ledger|anonymous-import-prompt|RetroLoginDialog|authenticator|command-parser|create-browse-engine|library-repository"
→ (no matches)
```

`origin/main` was merged into the task branch before any edit. No other agent's
files were touched; the quick-viewer and gallery-carousel work named in the
brief does not intersect these paths.

---

## The one thing they all are

`db.sequences` is a flat table: not uid-scoped, and never cleared on sign-out
(`clearAllData` has no auth-change caller). So **"rows in this browser" is not
"rows belonging to whoever is signed in."** `saved-sequence-ledger` is the
existing owner of that distinction, and the guest library read and
`captureAnonymousDrafts` already consulted it. The guest save cap and the
background sync retry did not. Every fix below is "make this reader use the
ledger too," plus a fence where a ledger check alone cannot hold.

Per `never-hand-roll.md`: **extending `saved-sequence-ledger`** with
`getOwnedSequenceIdSet(uid)`. Searched `getSavedSequenceIds` (array-returning),
`create-browse-engine.svelte.ts:645-665` and `captureAnonymousDrafts` — both
already built `new Set(getSavedSequenceIds(uid))` inline. The cap and the retry
would have been a third and fourth copy, so the predicate moved to its owner.
`getOwnedSequenceIdSet` returns an EMPTY set for an unknown uid, a null uid, or
unreadable storage, and every caller treats empty as "owns nothing" — never as
"owns everything", which is the conflation that caused F5.

---

## What changed

### F5 — the background retry replayed one account's rows into another

`retryPendingSyncs` filtered only on `syncStatus`/`blockedReason`, then wrote
through `repo.saveSequenceWithMetadata`, which resolves its uid from
`authState.effectiveUserId` and stamps it as `ownerId`. Account A saves offline,
signs out, B signs in on the same device → the next boot
(`routes/+layout.svelte:701-702`, not auth-gated) or reconnect
(`library-sync-retry.ts:214-215`) wrote A's sequence into B's library under B's
name, unprompted.

- The sweep is scoped to `getOwnedSequenceIdSet(authState.effectiveUserId)`.
- A row with no ledger entry for the current uid is **skipped, not adopted** —
  another account's rows and pre-ledger legacy rows alike. Neither was visible
  in this account's library anyway (a guest reads Dexie through the same
  ledger; a full account reads Firestore), so skipping hides nothing that was
  showing.
- The uid is resolved once per pass before any await, and the pass aborts if
  the account changes between rows.
- Every write carries `expectedOwnerId` (see the fence below).

**Visibility fallback — I got this wrong twice before landing it.** I first
changed the metadata-less fallback from `?? "public"` to `?? "private"`. The
full suite caught `tests/unit/public-collection-live-choreo-contract.test.ts`,
whose "public-by-default save contract" names `library-sync-retry.ts` in a
regex file list, and I reverted on that basis. That deference was misplaced:
the regex asserts the literal **absence of the string** `?? "private"`, which
is not the same claim as "a user's public save stays public" — and only the
second is a product contract.

Final state: the fallback is `private`, and the source-only requirement is
replaced by behavioural tests.

- `library-sync-retry.ts` is removed from that regex list, with the reason in
  place. It is not a user save surface; it is an unattended background pass
  that re-sends rows a user saved earlier. The other five surfaces stay pinned.
- **Compatibility:** a save through `LibrarySaveService` has always stamped
  `pendingSyncMetadata`, so every row a real user created since that field
  existed carries its recorded visibility and is replayed **unchanged, public
  included**. No expressed public intent is downgraded. Only a row that
  recorded nothing behaves differently — those predate the field, so no user
  ever chose, and publishing them manufactures an intent that cannot be
  evidenced.
- Pinned by three live tests in `library-sync-retry-ownership.test.ts`:
  recorded public replays public, recorded private replays private, and a row
  with no recorded intent is not published.

### Identity fence at the write boundary (review follow-up)

The call-site guard above is a time-of-check/time-of-use gap, and the reviewer
was right to reject it as sufficient. `LibraryRepository.saveSequence` resolves
the uid it stamps **after** `await getFirestoreInstance()`. Any caller that
selected a row for a specific account has already released the event loop by
then.

- `saveSequence` takes `overrides.expectedOwnerId`; `saveSequenceWithMetadata`
  forwards it. Immediately after `getWritableUserId()` — on the far side of the
  await, against the uid actually about to be written — a mismatch throws
  `LibraryError("UNAUTHORIZED")`.
- Fenced writes, each to the account that actually owns the work:
  - the **background retry**, to the uid it selected rows for;
  - the **collision import**, to the uid the offer was made about (below);
  - the **initial cloud sync**, to the uid that made the save. It is
    fire-and-forget, so it can land after the guest has signed in — and if that
    sign-in is a collision, an unfenced sync would deposit their work into the
    existing account _before_ the consent prompt, making the prompt moot.
  - the **thumbnail patch** (`attachThumbnail`), to the same saving uid. This
    is the slowest write in a save — a render plus an upload have completed
    since the user acted — and sequence ids are not account-scoped, so an
    unfenced patch would land on whatever the current account holds under that
    id. `attachThumbnail` gained the same post-`getWritableUserId()` check.
    **An earlier revision of this report claimed this was already fenced when
    it was not.** It is now, with tests against the real repository method and
    against the real thumbnail write.
- **No uid means no cloud write at all.** `ensureGuestIdentity()` swallows its
  failures, so a save can legitimately run with no identity. Passing
  `undefined` as the expected owner made the fence inert, and a uid arriving
  later — a late guest provision, a sign-in — would simply be adopted as the
  owner of work that account never made. The Dexie row is already durable, so
  the sync is not attempted.

### The whole side-effect chain, not just the sequence write

A save fans out well past the primary document, and **every** downstream write
resolved its own uid from live auth after its own awaits. Each of those uids is
a Firestore **path**, so an unfenced one does not merely mislabel a document —
it puts it in someone else's subtree. Audited end to end:

| Step                                                                           | Before                                                                               | Now                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Dexie row                                                                      | no auth                                                                              | unchanged                                                                          |
| ledger record                                                                  | snapshot uid                                                                         | snapshot uid; parks when unowned (below)                                           |
| `createNewTags` → `createUserTag`                                              | re-read live auth after `await getFirestoreInstance()`                               | takes the saving uid, fenced after the uid resolve; skipped entirely when unowned  |
| initial cloud sync                                                             | fenced                                                                               | fenced; not attempted when unowned                                                 |
| thumbnail `attachThumbnail`                                                    | re-read live auth                                                                    | fenced                                                                             |
| artifact extraction                                                            | `authState.effectiveUserId` **re-read**, not the snapshot                            | snapshot uid; skipped when unowned                                                 |
| 4 artifact writes (`HandPathRepository.save` ×2, `SoloPropRepository.save` ×2) | `await getFirestoreInstance()` then `requireAuth()` — the uid is the collection path | `expectedOwnerId` threaded through the extractor, fenced after the uid resolve     |
| `createNewTags` → `findTagByName` (lookup, and again inside `createUserTag`)   | re-read live auth after `await getFirestoreInstance()`; the uid is the READ path     | both lookups take the saving uid, fenced after the uid resolves                    |
| `sequence_save` lifecycle event                                                | **NOT** owner-free: awaits `authStateReady()` then stamps the LIVE uid as `ownerUid` | takes the acting account; a mismatch drops the event rather than misattributing it |
| `warmSequenceCells`, library refresh, nudge                                    | no per-account write                                                                 | unchanged                                                                          |

### An unowned save is parked, not orphaned — and only a guest may claim it

**I reported this wrongly before.** I wrote that an unowned row "belongs to the
ownership-scoped retry once an owner exists". It did not:
`recordSavedSequenceId(null, …)` no-ops, and both the guest library read and the
background retry filter by ledger — so the row was durable in Dexie and
reachable by **nothing**. Invisible and unsyncable, not adopted.

The fix is an explicit unowned state rather than a silent one:

- `saved-sequence-ledger` gains `recordUnownedSequenceId` /
  `getUnownedSequenceIds` / `adoptUnownedSequenceIds`. A save with no identity
  parks its id there instead of dropping it.
- `ensureGuestIdentity` adopts the parked ids **when it provisions a new
  anonymous identity** — the same person continuing the same guest session.
  After adoption the row satisfies the same `getOwnedSequenceIdSet` predicate
  the library read and the retry use, so it is visible and syncable.
- **A full account never adopts.** The boundary is structural: adoption lives
  inside the anonymous-provisioning branch, which a full-account sign-in never
  enters. Auto-adopting across an account boundary is the exact class of bug
  this work removes, so it is not done "helpfully" for a signed-in user.
- Adoption clears the park, so two identities cannot both claim the same row.
- A write with no `expectedOwnerId` is unaffected, so ordinary saves that
  resolve their own identity are untouched.

This is the narrow `library-repository` edit the brief authorised for identity
fencing, and nothing else in that file changed.

### F2 — collision import republished private guest work

`importDrafts` called `repo.saveSequence(draft)` with no overrides. A guest's
Dexie row records its visibility **only** under `pendingSyncMetadata`
(`SequenceData` has no top-level visibility), and both
`library-repository.ts` and `createLibrarySequence` default an unspecified
visibility to `"public"`. Once the importing session was a full account the
`isFullUser()` gate no longer suppressed the community mirror. Private is the
Create panel's default (`publishToCommunity = $state(false)`), so this was the
common case, not an edge.

Visibility and notes now travel with the draft, defaulting to `private` when
nothing was recorded. **Judgment call, flagged:** `anonymous-upgrade.ts` is not
in the public-by-default contract's file list and an import is a recovery path
rather than a user save surface, so the conservative default stands there. If
that reading is wrong, it is one line.

### F3 — a failed import put the drafts out of reach

`importDrafts` threw out of the loop on the first retryable failure, abandoning
every draft behind it and discarding the count of those already written.
`confirmAnonymousImport` had cleared `state.drafts` _before_ awaiting, and
`ConfirmDialog` calls it without awaiting or catching.

- `importDrafts` returns `{ imported, failed }`; every draft is attempted.
  `ALREADY_EXISTS` / `INVALID_DATA` are settled, not retryable, so they are not
  reported as failed.
- The prompt keeps exactly what is still outstanding, re-offers it, and toasts.
- `confirmAnonymousImport` **never rejects** — `ConfirmDialog` has no handler
  for a rejection, so throwing there reaches nothing. `ConfirmDialog` itself was
  left alone: fixing the rejection at its source avoids editing shared UI that
  other agents may hold.
- **Generation counter** (review follow-up): every offer, dismissal and import
  start bumps it. A run that settles after a dismissal or after a newer offer
  has replaced it returns without touching state, so a slow import cannot
  resurrect stale drafts or clobber newer ones.
- **The destination comes from the collision auth result, and binds at the
  OFFER** (this took two attempts). "Add these to this account?" means the
  account the collision just signed into. Reading the uid at confirm time
  re-pointed the question — an offer about B, answered after a switch to C,
  imported into C. My first fix moved the lookup inside
  `promptAnonymousImport`, which was still wrong twice over: it was another
  "who is signed in now?" lookup rather than the collision result, and it made
  the function `async` while every caller fires it without awaiting — so two
  collisions in flight could interleave between the await and the state write,
  leaving the generation guard and the drafts from different offers.
  `UpgradeResult` now carries `destinationUid`, read from the auth result the
  instant the collision sign-in completed, and all nine offer call sites pass
  it. `promptAnonymousImport` is synchronous again: generation, destination,
  drafts and open land in one step. `importDrafts`' destination is **required**,
  not optional — an import that cannot name its account cannot be fenced, and
  optionality would let a caller silently opt out.
- **Confirm fails closed.** If the destination was never bound, or the auth
  read fails at confirm, or the current account no longer matches the one the
  offer was about, nothing is written: the drafts are retained, the offer
  re-opens, and the user is told. The previous version caught the auth failure
  and proceeded with `destinationUid` undefined — an unfenced write, which is
  precisely what this work exists to prevent.

### F1 — the guest cap counted the whole device

`db.sequences.count()` included every prior session's rows, so a device that had
ever held `GUEST_SAVE_CAP` sequences refused every guest save while the library
read empty — an unfalsifiable error about sequences the user cannot see. It
counts `getOwnedSequenceIdSet(saverUid)` now.

**Snapshot consistency (review follow-up):** `isFullAccount`, the uid and the
ledger are read as one snapshot _before_ the Dexie await, and
`recordSavedSequenceId` uses that same snapshot uid. Reading the tier before an
await and the uid after it mixed two identities.

### F4 — the retro shells replaced the guest outright

`RetroLoginDialog.svelte:51,71` and `retro/dos/services/command-parser.ts:500`
call `signInWithEmail` / `signInWithGoogle`, which had no guest branch. The
dialog is mounted (`RetroDesktop.svelte:644`) and guest saves genuinely reach
that shell (`notation-adapter.ts:159` routes through `LibrarySaveService`).

Guarded at the **authenticator**, not at the two call sites: a shared
`upgradeCurrentGuestWith` helper routes an anonymous session through the
in-place upgrade and offers the drafts on collision. `SocialAuthCompact` and
`AccountPopover` already branch on `isAnonymous` before calling, so it is inert
for them; `signInWithGoogleCredential` already inlined the same shape. This
fixes both shells and any future caller without a third copy of the upgrade
dance.

---

## Verification

### Commands and results

```
pnpm install --frozen-lockfile
pnpm run build:packages                      # required: @tka/tka-types
pnpm exec tsc --noEmit -p tsconfig.json      # 0 errors in changed files
pnpm exec prettier --check <changed files>   # all clean
```

**Focused suites (post-fix):**

```
pnpm exec vitest run --config tests/config/vitest.config.ts \
  tests/unit/library/guest-save-cap-scoping.test.ts \
  tests/unit/library/library-sync-retry-ownership.test.ts \
  tests/unit/library/write-identity-fence.test.ts \
  tests/unit/library/save-side-effect-ownership.test.ts \
  tests/unit/library/artifact-repo-identity-fence.test.ts \
  tests/unit/library/tag-lookup-identity-fence.test.ts \
  tests/unit/library/unowned-save-continuity.test.ts \
  tests/unit/auth/anonymous-import-continuity.test.ts \
  tests/unit/auth/guest-signin-guard.test.ts \
  tests/unit/auth/guest-identity-adoption.test.ts \
  tests/unit/analytics/lifecycle-owner-attribution.test.ts
→ Test Files 11 passed (11) · Tests 105 passed (105)
```

Related-suite sweep — `tests/unit/library`, `tests/unit/auth`,
`tests/unit/analytics`, the save-service persistence suite, the
public-by-default contract, browse-engine identity switch, share-intake:

```
pnpm exec vitest run --config tests/config/vitest.config.ts \
  tests/unit/library tests/unit/auth tests/unit/analytics \
  tests/unit/library-save-service-persisted.test.ts \
  tests/unit/public-collection-live-choreo-contract.test.ts \
  tests/unit/browse-engine-identity-switch.test.ts tests/unit/share-intake
→ Test Files 100 passed (100) · Tests 732 passed (732)
```

Two earlier revisions of this report miscounted focused tests (54 and 71, when
the real figures were 52 and 62), and a third listed five paths for a command
that actually runs eleven files. Counts and commands here are copied from run
output, not recalled.

**Fails before, passes after** — the required demonstration, done by checking
out the pre-change `src/` and re-running the same tests:

| Stage                               | Pre-change result                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| First round (F1/F2/F3/F5 behaviour) | **19 failed**, 6 passed (25) — the 6 are guard assertions that must not regress |
| F4 guard                            | **4 failed**, 3 passed (7) — the 3 are the non-guest control cases              |
| Identity fencing round              | **9 failed**, 24 passed (33)                                                    |

**Full unit suite** (`pnpm exec vitest run --config tests/config/vitest.config.ts`):

```
BEFORE (pre-fix baseline, same command)
  Test Files  3 failed | 1973 passed | 5 skipped (1981)
       Tests  2 failed | 16004 passed | 106 skipped | 1 todo (16113)

AFTER
  Test Files  1983 passed | 5 skipped (1988)
       Tests  16080 passed | 106 skipped | 1 todo (16187)          exit 0
```

Zero failures. The file count rises by four and the test count by sixteen
because the two suites that were silently collecting zero tests now run, and
the new focused suites were added.

**Live Firebase auth emulator** (`pnpm run test:e2e`, `firebase emulators:exec
--only auth`):

```
Test Files  2 passed (2) · Tests 11 passed (11) · Script exited successfully (code 0)
```

This exercises the real `ensureGuestIdentity` / `upgradeAnonymousWithEmail` /
`importDrafts` against a real auth emulator, covering same-uid in-place upgrade,
collision sign-in into a pre-existing account with ledger-scoped capture, the
partial-failure/retry contract, and visibility intent.

### Two pre-existing test blockers found and repaired

Both were silently collecting **zero tests** before this session, and both fail
identically on pre-change source:

1. `tests/integration/auth-upgrade/anonymous-upgrade.e2e.test.ts` could not
   import: the e2e config aliases `$app/*` but not `$env/*`, so
   `anonymous-upgrade → guest-identity → analytics/posthog → $env/static/public`
   threw at collection. Stubs already existed for the component config; they are
   now wired in `tests/config/vitest.e2e.config.ts`. A second blocker,
   `last-auth-method.svelte` (`$state` under the plugin-less config), is mocked
   the way that file already mocks `toast-state` for the same reason.
2. `tests/unit/library/library-sync-retry-deletion-intent.test.ts` threw
   `networkStatusState.onOffline is not a function` at collection. One missing
   mock key.

Its test 3 also asserted an obsolete contract — that capture reads
`repo.getUserSequences` (Firestore). Capture moved to Dexie-filtered-by-ledger
in SP2, long before this work. Rewritten against the real source, and
strengthened: it now asserts an unowned row on the same device is **not**
captured.

### Scenario coverage requested in the brief

| Scenario                  | Where                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Same-uid in-place upgrade | emulator test 2; `guest-signin-guard`                                                                         |
| Account switch            | `library-sync-retry-ownership` (A/B, mixed device, no-one signed in, mid-pass switch); `write-identity-fence` |
| Collision                 | emulator test 3; `anonymous-import-continuity`; `guest-signin-guard`                                          |
| Partial failure / retry   | `anonymous-import-continuity`; emulator test 4                                                                |
| Duplicate saves           | `ALREADY_EXISTS` settled-not-retryable; `library-save-service-persisted` dedupe unchanged                     |
| Private/public intent     | `anonymous-import-continuity`; emulator test 5; retry visibility tests                                        |
| Anonymous ledger cap      | `guest-save-cap-scoping` (5 cases incl. full-account and re-save)                                             |

---

## Shared library dependencies (for parallel sessions)

`src/lib/shared/library/services/library-repository.ts` is shared surface and
another session is working in it concurrently (`session_01GJf6RRkVEeYeWT2CvZGm7T`,
correcting the `ensurePublicMember` → `publishSequence` live-auth chain). What
this session did there, so that work can extend it rather than collide with it
or duplicate the pattern:

**My footprint is small and localised** — 16 added lines, 1 changed, across
three methods. No other method in that file was touched.

| Method                     | Change                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `saveSequence`             | added `overrides.expectedOwnerId`; fence block immediately after `getWritableUserId()` (~line 405) |
| `saveSequenceWithMetadata` | added `metadata.expectedOwnerId`; forwards it to `saveSequence`                                    |
| `attachThumbnail`          | added a third `expectedOwnerId?` parameter; same fence after `getWritableUserId()` (~line 874)     |

**The convention, if the public path needs the same guarantee.** Every one of
these resolves its uid from live auth _after_ an await, and that uid is either
stamped as `ownerId` or used as the document path. A caller that selected work
for a specific account cannot prove that account is still current by the time
the write runs, so the check belongs on the repository side of the await:

```ts
const userId = this.getWritableUserId();
if (overrides?.expectedOwnerId && overrides.expectedOwnerId !== userId) {
  throw new LibraryError(
    "The signed-in account changed before this write could be attributed.",
    "UNAUTHORIZED",
    sequence.id
  );
}
```

Optional by design: a write with no `expectedOwnerId` behaves exactly as before,
so adding the parameter to another method cannot change existing callers. The
same shape is mirrored (with a plain `Error`, no `LibraryError` dependency) in
`HandPathRepository.save` and `SoloPropRepository.save`.

**Still resolving live auth, NOT fenced, and NOT mine.** Listed for the
collection owner's convenience, not as an audit finding — I did not trace these
and make no claim about whether they need the fence:

- `publishSequence` (`:1364`), `unpublishSequence` (`:1387`), `setVisibility`
  (`:1354`), `setVisibilityBatch` (`:1799`)
- `updateSequence` (`:1001`), `getSequenceStrict` (`:939`), `getSequences`
  (`:1148`), `getSequencePage` (`:1160`), `hasMatchingContent` (`:986`),
  `getLibraryStats` (`:1632`), the two `subscribeTo*` methods, and the
  public-index sync path

**Other shared files this session changed**, each additive and optional-param
only: `saved-sequence-ledger.ts` (three new exports for the unowned state),
`guest-identity.ts` (adoption call), `hand-path-repository-store.ts` and
`solo-prop-repository-store.ts` (third `expectedOwnerId?` param),
`tag-manager.ts` (third `expectedOwnerId?` param on `createUserTag`), and
`anonymous-upgrade.ts` / `anonymous-import-prompt.svelte.ts` (guest-upgrade
path, this session's domain). One shared **test** file was edited:
`tests/unit/public-collection-live-choreo-contract.test.ts`, where
`library-sync-retry.ts` was removed from the public-by-default regex list, with
the reasoning recorded in the file.

---

## Limitations — stated honestly

- **Mocks do not cover the real persistence identity boundary, and I am not
  claiming they do.** The fence is verified by driving the _real_
  `LibraryRepository.saveSequence` with a deferred `getFirestoreInstance()` so
  an account switch lands inside the exact await window — but Firestore itself
  is not present. That `ownerId` is written as the fenced uid, and that the
  community mirror behaves accordingly, is **inference from source**
  (`library-sequence.ts:157-167`, `library-repository.ts` public-index sync),
  not measured.
- **No Firestore emulator proof of write isolation or public mirroring.**
  `pnpm run test:e2e` runs `--only auth`. Proving server-side isolation would
  need the Firestore emulator plus a repository harness, which reaches well
  beyond the files I own. `pnpm run test:rules` exists for rules-level proof;
  I did not change `firestore.rules`, so nothing there should have moved.
- **No browser verification.** Every change is non-visual (persistence and auth
  routing), so `visual-verification-mandatory.md` does not apply — but no claim
  here rests on a rendered surface.
- **Legacy rows are now skipped by the retry.** A pre-ledger unsynced row will
  no longer auto-sync for anyone. This is deliberate: it was already invisible
  in every library view, and adopting it into the current account is the defect.
  An explicit re-save re-registers it.
- **A pre-ledger guest could exceed the cap.** A guest whose saves predate the
  ledger has an empty ledger and is uncapped. The cap is a conversion nudge, not
  a security control, and the alternative is refusing saves to a library that
  reads empty.
- **The prompt re-opens on failure.** A persistent failure (offline) re-offers
  on each confirm. "Not now" still dismisses. Chosen over silence.

---

## Files owned and changed

**Source**

- `src/lib/shared/library/services/saved-sequence-ledger.ts` — added `getOwnedSequenceIdSet`
- `src/lib/features/library/services/library-save-service.ts` — ledger-scoped cap, identity snapshot
- `src/lib/features/library/services/library-sync-retry.ts` — ownership scoping, fence, mid-pass abort
- `src/lib/shared/auth/services/anonymous-upgrade.ts` — `importDrafts` result shape, visibility, destination uid
- `src/lib/shared/auth/state/anonymous-import-prompt.svelte.ts` — retained drafts, generation, destination uid
- `src/lib/shared/auth/services/authenticator.ts` — `upgradeCurrentGuestWith` guard
- `src/lib/shared/library/services/library-repository.ts` — **narrow, authorised**: `expectedOwnerId` fence only

**Tests**

- `tests/unit/library/guest-save-cap-scoping.test.ts` (new)
- `tests/unit/library/library-sync-retry-ownership.test.ts` (new)
- `tests/unit/library/write-identity-fence.test.ts` (new)
- `tests/unit/auth/anonymous-import-continuity.test.ts` (new)
- `tests/unit/auth/guest-signin-guard.test.ts` (new)
- `tests/unit/library-save-service-persisted.test.ts` — cap test re-expressed in ledger terms
- `tests/unit/library/library-sync-retry-deletion-intent.test.ts` — repaired + ledger ownership
- `tests/integration/auth-upgrade/anonymous-upgrade.e2e.test.ts` — repaired, updated, extended
- `tests/config/vitest.e2e.config.ts` — `$env` aliases
- `tests/unit/audit/*` — the intentionally-red audit repros, deleted; replaced by the passing suites above

The audit report at
`docs/superpowers/reviews/2026-09-12-guest-save-continuity-audit.md` is left in
place as the record of the investigation. Its F5 fix-plan entry now understates
the fix (scoping plus a write-boundary fence, not scoping alone); this report is
the current word.

**Not done, deliberately:** the previously rejected "retry everything after a
collision" idea. It is the same unscoped sweep under a new trigger.

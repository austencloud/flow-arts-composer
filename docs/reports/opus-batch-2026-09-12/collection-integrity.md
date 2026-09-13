# Collection Integrity — Opus batch 2026-09-12

Four reproduced collection-integrity defects, each fixed with a repro test that
fails without the fix and passes on the branch head. D1's fix was reworked and
D4 was found in review of `32241bad`; both are covered below with their own
before/after evidence.

| Field       | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| Base SHA    | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`)         |
| Fixes SHA   | `7f632eb6` (runtime + tests; this report commits on top)           |
| Branch      | `claude/fix-collection-integrity-nm8fj9`                           |
| Scope       | collection state, membership bookkeeping, subscription lifecycle   |

## Owned files

Changed (runtime):

- `src/lib/shared/collections/collection-state.svelte.ts`
- `src/lib/shared/library/services/collection-manager.ts`
- `src/lib/shared/library/services/collection-firestore-mapper.ts`

Added (tests):

- `src/lib/shared/collections/__tests__/collection-state-overlap.test.ts`
- `tests/unit/library/collection-manager-delete.test.ts`
- `tests/unit/library/collection-firestore-mapper-existing-ids.test.ts`
- `tests/unit/library/collection-manager-subscription-disposal.test.ts`

Nothing else in the working tree was staged. `library-repository.ts`,
`saved-sequence-ledger.ts`, auth/sync retry, `firestore.rules`, the browse
engine, and shared dialogs were not touched.

---

## D1 — Optimistic rollback wrote to a stale array index

`CollectionState` backs every saved-artifact gallery (tunnels, mandalas, 3D
scenes, films). `rename`, `update`, and `updatePresentation` captured an array
index, awaited the Firestore write, then rolled back with
`this.ownedCollection[idx] = previous`. Every one of those awaits is a window in
which another gallery action can land — a save finishing (`add` **unshifts**, so
every index moves), a delete, a second edit — and the rollback then wrote the old
entry over whichever entry now occupied that slot.

`update` was worse: `lifecycle.prepareUpdate` is itself awaited *before* the
optimistic write, so on that path the corruption happened on the success path
too, not only on rollback.

`remove`'s rollback re-inserted with `splice(idx, 0, removed)` at the same stale
index, restoring the entry into the wrong position.

**Measured failure (base commit)** — a rename whose write fails while a save
lands, `src/lib/shared/collections/__tests__/collection-state-overlap.test.ts`:

```
AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]
  [
-   "41d9e76e-…",   (expected: the newly saved entry b)
+   "bb9e9d47-…",   (received: entry a, again)
    "bb9e9d47-…",
  ]
```

Entry `a` appears twice and the just-saved entry `b` is gone from the gallery —
silently, while Firestore still holds it. It reappears only on reload.

**Fix — reconcile against the confirmed baseline, not the displaced value.**

The first version of this fix resolved the slot by id and restored *the value
the failed write had displaced*, guarded by a per-write revision so only the
newest write could roll back. Review found that this still loses the persisted
state whenever **two overlapping mutations both fail**, and the follow-up tests
confirm it on that version:

- rename `A → First` then update `First → Second`, both writes rejected: the
  first rollback is ignored as superseded, the second restores `First` — a name
  the repository never accepted. Measured: `expected 'First' to be 'A'`.
- rename `A → Renamed` then delete, both rejected: the delete's rollback puts
  back the optimistic `Renamed` snapshot it happened to splice out. Measured:
  `expected [ 'B', 'Renamed' ] to deeply equal [ 'B', 'A' ]`.

The displaced value is only a safe fallback when the write that produced it
succeeded. So the state now tracks what the repository is **known to hold**:

- `confirmed: Map<id, T>` — seeded from `init`/local hydration/migration, set on
  every successful save, deleted on a successful remove.
- `inFlight: Map<id, number>` — mutations outstanding per entry. Nothing is
  settled while another write for that entry is still running; that write owns
  the display until it resolves.
- when the last outstanding write for an entry settles, `settleEntry` puts the
  confirmed value on screen — replacing it in place, re-inserting it next to the
  neighbour it sat in front of if a delete had removed it, or dropping it if
  nothing was ever persisted.

This is order-independent: whichever failure arrives last, the gallery lands on
what was actually persisted. It also fixes a case the revision model got right
only by luck — an earlier write succeeding while a later one fails now settles
to the earlier, persisted value rather than to a displaced optimistic one.

Object identity can't be used for any of this: `ownedCollection` is `$state`, so
reading a slot returns a proxy, never the object that was written. That was
measured — an identity-based version failed even the existing non-concurrent
rollback tests.

Three behaviours are new and deliberate, and are pinned by tests:

- an entry deleted while its own edit is in flight stays deleted (the edit is
  dropped rather than resurrecting the entry);
- `update` returns `null` without persisting when the entry disappears during
  `prepareUpdate`, instead of writing it back to Firestore;
- an entry optimistically removed by a failing delete stays off screen until any
  edit still in flight for it resolves, then returns with the persisted value.
  Showing it again earlier would mean showing a value that is about to change.

## D2 — A collection could become permanently undeletable

`deleteCollection` put one `batch.update(…, arrayRemove(collectionId))` per
member, plus the collection delete and a user touch, into a **single** batch.
Two Firestore rules break that:

1. `update()` requires the document to exist; one missing document fails the
   entire commit.
2. A commit carries at most 500 writes.

Both are reachable from the UI:

- A collection may legitimately hold a sequence with **no owner document** — a
  saved public sequence from another user. The codebase says so itself:
  `addSequenceToCollection` guards with `if (ownSequenceSnapshot.exists())`,
  `removeSequencesFromCollection` documents "a missing owner document is valid
  and does not block the collection removal", and `getCollectionSequences`
  falls back to the public index for ids that don't resolve locally.
- `LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION` is 500, so a full collection
  produced 502 writes.

In both cases the delete failed with "Failed to delete collection. Please try
again." on every attempt — the folder could never be removed.

**Measured failure (base commit)**, `tests/unit/library/collection-manager-delete.test.ts`:

```
FAIL  deleteCollection > deletes a collection holding a saved public sequence the user doesn't own
Error: Failed to delete collection ❯ collection-manager.ts:565

FAIL  deleteCollection > deletes a full collection without exceeding Firestore's per-commit write ceiling
Error: Failed to delete collection ❯ collection-manager.ts:565
```

**Fix.** Look up which members actually have an owner document
(`filterExistingSequenceIds`, new in `collection-firestore-mapper.ts`, chunked to
the 30-id `documentId in` limit like the existing fetch helpers), clean up only
those, chunk the cleanup at 200 updates per commit, and commit the collection
delete **last**. `arrayRemove` is idempotent, so a failure part-way through
leaves a collection the user can simply delete again, rather than sequences
pointing at a folder that no longer exists with no way to trigger cleanup.

The member list is also de-duplicated first, which removes a third latent
failure on the same commit: Firestore rejects two writes to the same document in
one batch, so a collection whose `sequenceIds` had picked up a duplicate would
have failed to delete for that reason alone.

Cost: a delete now issues `ceil(members / 30)` extra document reads (17 at the
500-member cap, 1 for a typical folder), billed only for documents that exist.
Deleting a collection is a rare, explicit user action; the alternative —
`set(…, { merge: true })`, which does not fail on a missing document — was
rejected because it would *create* phantom sequence documents in the library.

## D3 — Collection listeners orphaned when disposed before Firestore init

Flagged by the concurrent Firestore cost audit
(`origin/claude/firestore-cost-audit-8l6vvx`, finding H2) and reproduced here
independently before changing anything.

`subscribeToCollections` and `subscribeToCollection` attach `onSnapshot` inside a
`.then()`, and their disposer only acted `if (unsubscribe)`. A caller disposing
inside that window ran a no-op disposer; the listener then attached with no
reference left to tear it down. `collections-state.ensureStarted()` calls
`teardown()` **synchronously** when the uid changes, which is exactly this
window — the anonymous→Google upgrade and sign-out that the subscription's own
`permission-denied` handler already documents as routine.

**Measured failure (base commit)**,
`tests/unit/library/collection-manager-subscription-disposal.test.ts`:

```
FAIL  leaves no live collections listener when disposed before Firestore initializes
  expected [ { …(2) } ] to have a length of +0 but got 1
FAIL  leaves no live single-collection listener when disposed before Firestore initializes
  expected [ { …(2) } ] to have a length of +0 but got 1
FAIL  does not leave the previous user's listener attached across a uid swap
  expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2
```

**Fix.** The `disposed` flag discipline `subscribeToAllPublicCollections`
already uses in `public-collection-loader.ts`: bail before attaching when
disposed, re-check immediately after attaching, and have the disposer set the
flag. No new pattern was invented.

Only the two helpers inside this agent's scope were changed. The audit lists the
same shape at `library-repository.ts:1374,1538`, `user-repository.ts:597,877`
and `tag-manager.ts:286` — **left alone**, they belong to other agents.

**Note for whoever integrates both branches:** that audit's quarantined file
`tests/unit/opus-firestore-audit/listener-disposal-race.test.ts` asserts today's
leaking behaviour for `subscribeToCollections`. Those two assertions must be
inverted when this branch lands. It is not on this branch and was not edited.

## D4 — Metadata read and writes could resolve to different users

Raised in review of `32241bad`. `deleteCollection` and `updateCollection` both
capture `const userId = getAuthenticatedUserId()` and then call
`getCollection(collectionId)`, which resolves the effective user **again** —
after an await, and with `"read"` access rather than `"write"`. The effective
uid changes on the anonymous→Google upgrade, on sign-out, and when admin preview
is toggled, so the metadata read could come from one user's document while every
write went to another's.

The consequence is concrete for delete: the member list used to clean up reverse
membership comes from the wrong collection, so the wrong sequences are edited
and the right ones keep a dangling `collectionIds` entry.

**Measured failure (before the fix)**,
`tests/unit/library/collection-manager-delete.test.ts` — with the uid swapping
after capture, the signed-in user's own member keeps its stale membership
because the delete cleaned the other user's member list instead:

```
FAIL  reads and writes as the same user when the effective uid changes mid-delete
  expected { collectionIds: [ 'collection-1', 'other' ] }
        to deeply equal { collectionIds: [ 'other' ] }
```

**Fix.** A module-private `readCollectionAs(firestore, userId, collectionId)`
reads the document under an already-captured uid; `deleteCollection` and
`updateCollection` both use it, so one uid covers the metadata read and every
write. `getCollection` itself is unchanged — it is a legitimate standalone read
and other callers depend on it resolving the current user.

---

## Commands and results

All runs from a clean cloud checkout of `origin/main` at the base SHA with
`pnpm install --frozen-lockfile`.

**Workspace packages must be built before the suite is trustworthy.** A fresh
checkout has no `packages/*/dist`, and a test file importing one dies at module
load with `Failed to resolve entry for package "@tka/…"` — 16 library/collection
suites (`@tka/tka-types`) and, in the full run, 22 further files
(`@tka/domain`, `@caps/domain`, `@vtg/domain`, `@tka/sequence-engine`). That
looks like 22 red files but is zero red assertions. `pnpm --recursive --filter
"./packages/*" run build` clears all of them; the re-run row below is the proof.

| Command                                                                                   | Result                                                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `vitest run … src/lib/shared/collections/__tests__/collection-state-overlap.test.ts` (base) | **5 failed / 5** — D1 reproduced                                 |
| the same file's two both-failure cases, against the first D1 fix             | **2 failed** — the confirmed-baseline defect reproduced          |
| `vitest run … tests/unit/library/collection-manager-delete.test.ts` (base)                  | **3 failed / 4** — D2 reproduced (2 of them are the defect)      |
| the same file's uid-swap case, against the pre-D4 manager                    | **1 failed** — D4 reproduced                                     |
| `vitest run … tests/unit/library/collection-manager-subscription-disposal.test.ts` (base)   | **3 failed / 4** — D3 reproduced                                 |
| `vitest run … tests/unit/library/ src/lib/shared/collections/__tests__/ src/lib/features/library/{state,services}/__tests__/` (head) | **37 files, 223 tests, all passing** |
| `vitest run --config tests/config/vitest.config.ts` — full default suite (head)             | **15 672 passed, 106 skipped**; 22 files failed to load, all from unbuilt workspace packages (see below) |
| Re-run of those 22 files after `pnpm --recursive --filter "./packages/*" run build`          | **22 files, 327 tests, all passing** — the failures were the environment, not this branch |
| `npm run check:fast` (head)                                                                | 581 errors / 44 warnings repo-wide; **none in any changed or added file** (645 before the workspace packages were built) |
| `tsc --noEmit` over the three `tests/unit/library/` files (head)                            | **0 errors in those files** (9 errors, all inside a `node_modules` dependency's own sources) |
| `firebase emulators:exec --only firestore …`                                                | **could not run** — see limitations                              |

`tsconfig.json` includes only `src/**`, so `check:fast` does not cover the three
tests under `tests/`; they were type-checked separately with a throwaway config
(since removed) for the row above. The fourth test is co-located under `src/` and
is covered by `check:fast`.

Reproductions were captured by stashing only the runtime file under test, so the
"before" run used the base implementation with the final tests.

## Evidence quality

- **Measured:** every test result above, and the `check:fast` diagnostics. The
  repro/pass transitions were observed, not inferred.
- **Mocked:** the Firestore server is a fake in D2 and D3. The D2 fake enforces
  exactly the two documented rules the defect turns on (an `update` to a missing
  document fails the commit; more than 500 writes is rejected) — those rules are
  documented Firestore behaviour, asserted here rather than measured. What *is*
  measured is that the base implementation violates both under inputs the
  product can produce, and that the fix does not.
- **Inferred:** frequency. How often a user holds a foreign public sequence in a
  deletable collection, or fills one to 500, is not measured here. The
  reachability of each state is established from the code paths cited above,
  not from production data.

## Regressions and limitations

- **No emulator evidence.** `firebase emulators:exec` could not run: this
  environment's network policy answers `403` to `CONNECT storage.googleapis.com`,
  so the Firestore emulator JAR cannot be downloaded (`java` and `firebase-tools`
  are both available; only the JAR fetch is blocked). A probe script measuring
  the two batch rules directly is at
  `scratchpad/emulator-batch-semantics.mjs` and is ready to run wherever the
  download succeeds. It was never connected to production.
- **No browser verification.** These are non-visual state and persistence
  changes; no geometry, layout, or rendered surface is affected. Device- and
  user-gated checks were not run and are not claimed.
- **Pre-existing repo-wide type errors** (645) are untouched; none are in these
  files. No attempt was made to reduce them.
- **Behaviour changes to be aware of** beyond the fixes: `deleteCollection` is
  no longer a single atomic commit (deliberate — see D2), and `update` can now
  return `null` for an entry deleted mid-flight (deliberate — see D1).
- **Not done, deliberately:** `reorderSequences`/`reorderCollections` in
  `collection-manager.ts` are last-write-wins `updateDoc` calls that would clobber
  a concurrent add/remove and leave `sequenceCount` stale — but `rg` finds **no
  caller anywhere in `src/`**. Fixing dead code was judged lower value than the
  three defects above; recorded here so the next agent doesn't have to rediscover
  it. Existing collection permission work already in review was inspected via
  history and left alone.

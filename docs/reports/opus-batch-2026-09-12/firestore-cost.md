# Firestore Read/Write and Listener-Lifecycle Audit

**Scope:** Browse, library, collections, inbox, profile — production-reachable
paths only.
**Type:** read-only audit. No production code was modified.
**Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`)
**Branch:** `claude/firestore-cost-audit-8l6vvx`
**Date:** 2026-09-13

---

## How to read the evidence labels

Every claim below carries one of these. Nothing in this report is a dollar
figure, and nothing was measured against production.

| Label          | Meaning                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **measured**   | A test in `tests/unit/opus-firestore-audit/` counts the operations against the real production module behind a mocked Firestore SDK. The assertion is cited. |
| **read**       | Established by reading the code and tracing every caller with `rg`. No execution.                                                                            |
| **inferred**   | A consequence that follows from measured/read facts plus documented Firestore billing rules. Stated as inference.                                            |
| **unverified** | Named because it matters, but not settled here.                                                                                                              |

**Collection sizes are unverified.** This session had no production access and
was not permitted to connect to one, so `publicSequences` document count,
per-creator public-sequence counts, notification counts, and public-collection
counts are all unknown. Costs are therefore given as formulas in those
variables, with a worked example whose inputs are clearly labelled as
assumptions. Substituting a real census (there is a `scripts/diagnostics/
browse-program-census.ts` already in the repo) is the one thing that would
turn the ranking below from ordinal into absolute.

Firestore billing rules used throughout, per
`docs/architecture/firestore-cost-anatomy.md` and Firestore's published model:
one billed read per document returned; `.select()` does not reduce read count;
an aggregate `getCountFromServer` bills one read per up-to-1000 index entries
scanned (so ≥1); a write costs roughly 3× a read; a `onSnapshot` bills a read
per document in the initial result set and per changed document thereafter.

---

## Summary

Nine findings, ranked. Five are measured.

| #      | Finding                                                                                                                     | Domain                        | Cost shape                                                  | Evidence |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- | -------- |
| **H0** | Every page load of a signed-in creator scans all of that creator's `publicSequences` mirrors to write nothing               | profile                       | `P` reads **per boot, per device**                          | measured |
| **H1** | Community feed re-reads every owner profile in its 200-doc window on any snapshot                                           | collections                   | `U` reads per remote write to _any_ public collection       | measured |
| **H2** | Seven `subscribeTo*` helpers leak their listener when disposed before Firestore resolves                                    | library, collections, profile | one orphaned listener per uid swap, permanent               | measured |
| **H3** | `communityCollectionsState.invalidate()` pays a full cold re-attach for a local mutation the live listener already delivers | collections                   | `K + Σ⌈m/30⌉ + U` per rename/publish/delete                 | measured |
| **H4** | Inbox participant refresh never terminates for an unreadable participant                                                    | inbox                         | 1 read + 1 write per conversation **per snapshot**, forever | measured |
| **H5** | App-root notification listener attaches with no `limit()`                                                                   | inbox                         | `N` reads per boot, `N` growing monotonically               | measured |
| **M6** | `communityCollectionsState.teardown()` has no production caller                                                             | collections                   | collection-group listener outlives sign-out                 | read     |
| **M7** | Browse gallery query on `publicSequences` has no `where()` and no `limit()`                                                 | browse                        | `G` reads per sync; rule violation                          | read     |
| **M8** | Followed-collections shelf re-resolves and re-counts every follow on any follow-ref change                                  | collections                   | `F × (1 + ⌈m/30⌉)` per follow/unfollow                      | read     |

Variables: `P` = one creator's public sequences. `U` = distinct owners in the
community feed window. `K` = public collections in the window (≤200). `m` =
members of a collection. `N` = one user's lifetime notifications. `G` = size of
`publicSequences`. `F` = collections a user follows.

### Operations per representative session

The brief asks for a per-session operation count. Below is one, built from the
**measured** per-event costs above, with every input volume marked as an
assumption because no production census was available. **These are operation
counts, not money.** Multiplying them by a price would be inventing a total.

Session definition (assumption): a signed-in creator opens the app on the web,
lands on `/browse`, opens the Collections tab, and leaves the tab open for
thirty minutes with the Inbox provider mounted throughout.

Volume assumptions, all **unverified** — substitute a real census before
quoting any of this:

| Symbol | Assumed | Meaning                                               |
| ------ | ------: | ----------------------------------------------------- |
| `P`    |     150 | the creator's own public sequences                    |
| `G`    |   3,000 | documents in `publicSequences`                        |
| `N`    |     400 | the creator's lifetime notifications                  |
| `K`    |     200 | public collections in the feed window (the cap)       |
| `U`    |      45 | distinct owners across those 200                      |
| `m`    |      20 | median members per public collection                  |
| `C`    |      12 | the creator's conversations                           |
| `X`    |       2 | conversations with an unreadable participant (H4)     |
| `S`    |      30 | remote public-collection writes during the 30 minutes |
| `E`    |       8 | inbox snapshots during the 30 minutes                 |

| Source                                  | Formula                    |         Ops | Finding |
| --------------------------------------- | -------------------------- | ----------: | ------- |
| profile doc read at boot                | 1                          |           1 | —       |
| profile fan-out scan                    | `P`                        |         150 | **H0**  |
| gallery sync (on `/browse`, TTL cold)   | `G`                        |       3,000 | M7      |
| own collections listener attach         | own collections            |         ~10 | —       |
| community feed attach                   | `K + K·⌈m/30⌉`             |         400 | —       |
| community feed owner names, attach      | `U`                        |          45 | —       |
| community feed, 30 min of remote writes | `S·(⌈m/30⌉ + U)`           |       1,380 | **H1**  |
| notification listener attach            | `N`                        |         400 | **H5**  |
| conversation listener attach            | `min(50,C)`                |          12 | —       |
| inbox participant tax                   | `E·X` reads + `E·X` writes | 16 r + 16 w | **H4**  |

Reads ≈ **5,414**; writes ≈ **16** (≈48 read-equivalents at 3×).

What the shape says, independent of whether the volume assumptions hold:

- The single largest line is the gallery sync — but it is paid **at most once
  per 15 minutes per device**, and only when the user actually lands on
  `/browse`. That is M7's mitigation working.
- **H1 is the largest line that recurs**, and it scales with _other people's_
  activity (`S`), not the user's. Double the product's public-collection write
  rate and this line doubles for every client with the feed attached, while
  every other line stays flat. It is the only finding in the table with that
  property, which is why it ranks above the larger one-shot numbers.
- **H0 and H5 are the boot tax**: 550 ops before the user has done anything,
  every page load, every device, and both grow monotonically with account age.
  A user who reloads ten times in a workday pays them ten times.
- H4 is small here but is the only line producing **writes**, and it grows with
  message traffic rather than with session length.

If the fixes for H0, H1, H4 and H5 land, the same session costs **3,549**
reads: H0 goes to 0, H1's recurring 1,380 drops to the 30 count queries the
changed documents genuinely need, H5's 400 becomes a 50-document page, and
H4's 16 reads and 16 writes become a single first-time lookup. What is left is
dominated by the one gallery sync (3,000), which is M7's separate and harder
problem — and the recurring, other-people-drive-it component drops from 1,380
to 30.

### What is already right, and should not be "fixed"

The audit brief asks to separate deliberate caching from leaks. These are
deliberate and correct, and three of them are the reason the Browse path is
**not** the top finding despite owning the largest raw query:

- **Gallery sync TTL.** `gallery-sync-staleness.ts` caps the full
  `publicSequences` pull at once per 15 minutes per device, warming from
  IndexedDB first. (read)
- **Boot prefetch policy.** `+layout.svelte:543` only does the network sync
  when the entry route actually _is_ `/browse`, and skips it entirely on a
  constrained connection. A user who opens Compose pays zero gallery reads.
  (read)
- **Per-document normalization memo** in `subscribeToAllPublicCollections`:
  an unrelated collection update re-counts only the changed document.
  **Measured:** a one-document change costs 2 count queries, not 80
  (`community-feed-fanout.test.ts`, "re-runs getVisibleOwnerNames…").
- **`subscribeToAllPublicCollections` / `subscribeToPublicCollection`
  disposal.** These two carry the `disposed` flag the other seven lack, and
  are the correct fix template. **Measured**
  (`listener-disposal-race.test.ts`, final suite).
- **`countPublicMembers`** uses aggregate count queries rather than downloading
  member documents, and correctly filters on `ownerId` to avoid cross-user id
  collisions. (read)
- **`refreshPublicSequenceOwnerProfile`'s write filter.** It opens a
  transaction only for mirrors whose projection actually differs. **Measured**
  (`profile-boot-fanout.test.ts`, "only opens a transaction for mirrors…").
  The defect in H0 is the _scan_, not this loop.
- **`getVisibleOwnerNames` / `getUserDisplayNames`** already batch into 30-uid
  `documentId() in` chunks. H1 is that the batched pass is re-run, not that it
  is unbatched.

### Relationship to the 2026-05-23 backlog spec

`docs/superpowers/specs/backlog/2026-05-23-firebase-cost-optimization-design.md`
covers admin services, security-rule `get()` calls, and the arena pool — **none
of which is in this audit's domain**, and none of which this audit re-examined.
Its five findings and this audit's nine do not overlap. Two of its general
conclusions are confirmed here and worth carrying over:

- its note that `documentId() in` batching improves latency but **not** read
  billing is correct and applies to `countPublicMembers` and
  `getVisibleOwnerNames`;
- its observation that a client-side cache is reset by a page refresh is the
  exact mechanism behind H0 and H5.

Its cost projection is stale as a model for this domain: it assumes the
dominant cost is a few admin sessions, whereas every finding below is on a path
that every ordinary signed-in user walks on every page load.

---

## H0 — Every boot of a creator scans their whole public library to do nothing

**Severity: highest.** It is on the sign-in path, it is unbounded in a
per-creator quantity, and it is paid by every creator on every page load of
every device — the exact "runs on the idle path, thousands of times a week"
shape that `firestore-cost-anatomy.md` identifies as the thing that actually
dominated the August invoice.

### Call chain

```
onAuthStateChanged(user)                   auth-state.svelte.ts:548
  └─ createOrUpdateUserDocument(user)      user-document-manager.ts:77
       ├─ getDoc(users/{uid})              user-document-manager.ts:113     1 read
       └─ if (profileProjectionChanged || hasSavedSequences)   :343
            └─ refreshPublicSequenceOwnerProfile()
                                           public-sequence-persister.ts:790
                 └─ getDocs(query(collection("publicSequences"),
                                  where("ownerId","==",uid)))  :795         P reads
                                  ^ no limit(), no cursor, no watermark
```

`hasSavedSequences` is `existingData?.sequenceCount > 0`
(`user-document-manager.ts:336`). For anyone who has ever published, that is
permanently true. The guard therefore does not _prevent_ the scan on a
steady-state boot — it _guarantees_ it.

`createOrUpdateUserDocument` is called from the `onAuthStateChanged` handler
(`auth-state.svelte.ts:548`), i.e. once per page load for a signed-in user, not
once per account creation. (read)

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/profile-boot-fanout.test.ts`

- _"reads every one of the creator's public sequences to write nothing"_:
  300 up-to-date mirrors → `{ scanned: 300, updated: 0, unchanged: 300,
skipped: 0 }`, **0 transactions, 0 writes, 1 scan.**
- _"issues the scan with no limit() and no cursor"_: the recorded query clause
  list is exactly `[{where ownerId == uid}]`. No `limit` clause present.
- _"scales linearly with the creator's library, unbounded"_: `scanned` tracks
  10 / 100 / 1000 with `updated: 0` throughout.

### Why it exists

The comment at `user-document-manager.ts:338-340` is explicit and correct: a
previous profile write may have committed while its projection fan-out failed
offline, so later sign-ins must re-run the idempotent repair. The design goal
is right. The implementation pays for it by reading everything, every time,
rather than by recording that the repair already succeeded.

### Likely fix

Add a projection watermark to the user document and skip the scan when it
matches. Concretely: on a fully-successful fan-out, write
`profileProjectionDigest` (a hash of `{displayName, avatarUrl}`) and
`profileProjectionSyncedCount` onto `users/{uid}`. At `:343`, skip the call
when the stored digest equals the digest of the profile about to be projected
**and** the fan-out's last run reported `skipped === 0`. A steady-state boot
then costs 0 extra reads instead of `P`.

**Tradeoffs.** The watermark is client-written, so a client that dies between
the last transaction and the watermark write re-scans on the next boot — which
is the correct failure direction (it repairs). It adds two fields to the user
document, which already has an index exemption story worth checking against
`firestore-cost-discipline.md`'s field-override gate before adding. It does
**not** fix the case where a mirror is stale for a reason other than a profile
change; that case is already only reachable through the `publishing` path,
which has its own digest/revision machinery
(`publicProjectionDigest`/`publicProjectionRevision`).

A cheaper interim mitigation, if the watermark is judged too invasive: bound
the repair scan with `limit(N)` plus a rotating cursor stored on the user doc,
so a creator with 2,000 sequences repairs 100 per boot instead of reading 2,000.
This caps the per-boot cost without changing the eventual-consistency
guarantee — only its latency.

### Regression test plan

1. Extend `profile-boot-fanout.test.ts`: with a matching watermark on the user
   doc, `getDocs` call count must be **0**.
2. With a _differing_ watermark (display name changed), the scan must still run
   and still update exactly the stale mirrors — reuse the existing
   "only opens a transaction for mirrors whose projection actually differs"
   case unchanged.
3. A case where the previous run reported `skipped > 0` must **not** write the
   watermark, so the next boot re-scans.

---

## H1 — One remote write re-reads every owner profile in the community feed

### Call chain

```
BrowseModule.onMount:481  /  CollectionChipsRow:43  /  CommunityCollectionsPanel:30
  └─ communityCollectionsState.ensureLoaded()
       community-collections-state.svelte.ts:41
       └─ subscribeToAllPublicCollections()      public-collection-loader.ts:215
            collectionGroup("collections") where isPublic==true
            orderBy updatedAt desc, limit(200)
       └─ applySnapshot(withOwners)              :62
            └─ getVisibleOwnerNames(all owner ids)  user-repository.ts:410
                 30-uid `documentId() in` chunks over `users`      U reads
```

`applySnapshot` runs on **every** snapshot and passes the owner ids of the
whole current window, unconditionally. There is no memo keyed on owner id, and
no diffing against the previously-resolved set. (read + measured)

Because the underlying query is a **collection group over all public
collections**, the snapshot fires for a write by _any_ user anywhere — not only
for the viewer's own activity. Every client with Browse or the library
collection picker open pays `U` reads each time anyone in the product renames,
publishes, reorders, or edits a public collection. (inferred, from the query
shape at `public-collection-loader.ts:237-242`)

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/community-feed-fanout.test.ts`

- _"re-runs getVisibleOwnerNames on a snapshot where only one doc changed"_:
  40 collections over 10 owners; one document modified → **2** count queries
  (correct, memoised) but **1 chunked owner query covering all 10 owners**.
- _"scales the re-read with distinct owners, not with what changed"_: 40
  collections over 35 owners; one document modified → **35** owner documents
  re-read across **2** `in` chunks.

The contrast between the two assertions in the first test is the finding: the
expensive half of the pipeline was already memoised, and the cheap-looking half
was not.

### Likely fix

Memoise owner names on the state object, as `subscribeToAllPublicCollections`
already memoises normalization per document path:

```ts
private ownerNames = new Map<string, string>();

const unknown = withOwners
  .map((i) => i.ownerId)
  .filter((id) => !this.ownerNames.has(id));
if (unknown.length) {
  for (const [id, name] of await getVisibleOwnerNames(unknown))
    this.ownerNames.set(id, name);
}
```

Steady-state cost drops from `U` to 0; a newly-appearing owner costs 1.

**Tradeoffs.** A cached name goes stale when a creator renames themselves or is
moderated to `isHidden`. Today the feed picks that up on the next snapshot —
which is exactly the behaviour being paid for. Note the filter at
`community-collections-state.svelte.ts:69` (`names.has(ownerId)`) is a
**visibility gate**, not just a display lookup: a moderated or guest owner is
absent from the map and their collections are dropped from the feed. A naive
memo would therefore cache a moderation decision indefinitely. Mitigate with a
TTL on the memo (a few minutes is far cheaper than per-snapshot) or by
invalidating it on the owner-profile change events the app already emits. This
tradeoff must be stated in the fix; caching a suppression decision forever is a
moderation bug, not just a staleness bug.

### Regression test plan

1. First snapshot resolves `U` owners. Second snapshot, one doc changed, same
   owners → **0** new owner chunks. (Invert the currently-pinned assertion.)
2. A snapshot introducing a previously-unseen owner → exactly one chunk
   containing only that owner.
3. With the TTL expired, a snapshot re-resolves and a now-hidden owner's
   collections drop out of `items` — pinning that the visibility gate survives
   the memo.

---

## H2 — Seven subscription helpers leak on disposal before Firestore resolves

### The defect shape

```ts
export function subscribeToCollections(cb) {
  const userId = getAuthenticatedUserId("read");
  let unsubscribe: Unsubscribe | null = null;
  getFirestoreInstance().then((firestore) => {
    unsubscribe = onSnapshot(q, ...);            // attaches on a later microtask
  });
  return () => { if (unsubscribe) unsubscribe(); };   // no `disposed` flag
}
```

— `collection-manager.ts:1240-1300`

A caller that disposes before the promise settles runs the disposer while
`unsubscribe` is still `null`. The disposer no-ops; the listener then attaches
with nothing holding a reference to it. The orphan bills a read for every
subsequent change to its result set for the lifetime of the tab.

### The trigger is a real, routine code path

`collections-state.ensureStarted()` calls `this.teardown()` **synchronously**
when the uid changes (`collections-state.svelte.ts:65,70`). The comment at
`collection-manager.ts:1264-1272` already documents the anonymous→Google uid
swap and sign-out as expected events on this path. Because
`getFirestoreInstance()` is a promise, the `.then()` body is deferred to a
microtask even when Firestore is already initialised — so a teardown issued in
the same synchronous tick as the subscribe **always** loses the race, not just
under slow-network conditions. (read + measured)

### Affected sites (read)

| File                                            | Line | Function                  |
| ----------------------------------------------- | ---- | ------------------------- |
| `shared/library/services/collection-manager.ts` | 1240 | `subscribeToCollections`  |
| `shared/library/services/collection-manager.ts` | 1302 | `subscribeToCollection`   |
| `shared/library/services/library-repository.ts` | 1374 | `subscribeToLibrary`      |
| `shared/library/services/library-repository.ts` | 1538 | `subscribeToSequence`     |
| `shared/community/services/user-repository.ts`  | 597  | `subscribeToUsers`        |
| `shared/community/services/user-repository.ts`  | 877  | `subscribeToFollowStatus` |
| `features/library/services/tag-manager.ts`      | 286  | `subscribeToTags`         |

**Not affected** (verified, do not change): `public-collection-loader.ts:215`
and `:332` carry a `disposed` flag and re-check it after attaching;
`CollectionCollaborationManager.ts:158,200,349` carry a `cancelled` flag
checked immediately before `onSnapshot` with no intervening `await`, which is
sufficient;`followed-collections.ts:64` returns `Promise<Unsubscribe>` so the
caller owns the race, and `followed-collections-state.svelte.ts:67-73` handles
it correctly.

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/listener-disposal-race.test.ts`

- _"leaks the listener when disposed before Firestore resolves"_: dispose, then
  release the Firestore promise → one listener attached at
  `users/uid-under-test/collections`, still `active`.
- _"disposes correctly when Firestore resolves first"_: the same code path with
  the ordering reversed tears down cleanly — which is why this never shows up
  in manual testing.
- _"subscribeToAllPublicCollections … tears the listener down even when
  disposed before Firestore resolves"_: **0** leaked. The counter-example is
  measured rather than asserted.

`subscribeToUsers` deserves a specific note: its snapshot handler calls
`getFollowingIds(currentUserId)` (up to 500 reads) and then
`mapFirestoreToEnhancedProfile` per user on **every** snapshot
(`user-repository.ts:622-640`). A leaked instance of this listener is the most
expensive orphan in the set. (read)

### Likely fix

Apply the `public-collection-loader.ts` template verbatim to all seven:

```ts
let disposed = false;
let unsubscribe: Unsubscribe | null = null;
getFirestoreInstance().then((firestore) => {
  if (disposed) return;
  unsubscribe = onSnapshot(...);
  if (disposed) { unsubscribe(); unsubscribe = null; }
});
return () => { disposed = true; unsubscribe?.(); unsubscribe = null; };
```

**Tradeoffs.** None of substance — it is strictly additive and the template
already ships in this codebase. The only judgement call is whether to extract
it into a shared `createDeferredSubscription()` helper. Given seven sites and
`.claude/rules/never-hand-roll.md`'s second-use rule, extracting an owner is
the better call than seven copies; `public-collection-loader.ts` would then
become its first consumer rather than its template.

### Regression test plan

Invert the pinned assertions in `listener-disposal-race.test.ts`
(`active` → `false`, leak count → 0) and parameterise the suite over all seven
exported helpers so a newly-added subscription without the guard fails.

---

## H3 — `invalidate()` pays a cold re-attach for a mutation already delivered

`communityCollectionsState.invalidate()` unsubscribes, clears `started`, and
re-subscribes (`community-collections-state.svelte.ts:91-97`). It is called
from five local-mutation sites: `CollectionCard.svelte:155,201,222`,
`CollectionDetailView.svelte:604,624`, `CollectionDetailsDialog.svelte:64`. (read)

The live collection-group listener already delivers every one of those
mutations as a `docChange`. The re-attach therefore buys nothing the listener
would not have produced, and discards the `normalizedByPath` memo in the
process — so every collection in the window is re-normalized from scratch.

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/community-feed-fanout.test.ts`,
_"detaches and re-attaches the listener, re-counting every collection"_:
after a warm feed of 40 collections × 45 members, `invalidate()` produces
1 unsubscribe, 1 re-attach, **80 count queries** (the full cold-attach cost)
and **10** owner reads — versus the 2 count queries the equivalent
`docChange` path costs (measured in the H1 test).

### Likely fix

Delete the `invalidate()` calls on paths the listener covers. The code comment
at `:87-90` gives the reason they exist — "restarting also forces a fresh
public-member normalization after an explicit visibility action" — which is a
real concern: flipping a collection private must drop it from the feed, and
flipping it public must add it. But both of those **are** `docChange` events on
`isPublic`, so the listener handles them.

The one case that genuinely is not covered: a change to a collection's
_members'_ public visibility changes `countPublicMembers`'s answer without
touching the collection document, so no snapshot fires. If that is what
`invalidate()` is defending, the targeted fix is to evict just that document's
entry from `normalizedByPath` and let the next snapshot re-normalize it —
`Σ⌈m/30⌉` for one collection instead of all of them.

**Tradeoffs.** Requires exposing a narrow `invalidateCollection(path)` on the
subscription, which widens `subscribeToAllPublicCollections`'s contract.
Verify against the three bugs the module invariant comment at
`public-collection-loader.ts:1-14` records before changing count behaviour —
that comment documents real, repeated regressions in this exact area.

### Regression test plan

1. After a warm feed, a local visibility toggle must produce **0** re-attaches.
2. `invalidateCollection(path)` must produce `⌈m/30⌉` count queries for that
   path only, and 0 for every other document in the window.
3. Flipping `isPublic` false must remove the item from `items` via the
   `docChange` path, with no re-attach.

---

## H4 — Inbox participant refresh never terminates for an unreadable participant

### Call chain

```
InboxSubscriptionProvider.svelte:82   (mounted at app root, every signed-in user)
  └─ conversationService.subscribeToConversations()  conversation-manager.ts:418
       conversations where participants array-contains uid,
       orderBy updatedAt desc, limit(50)
       └─ per snapshot, per doc: previewNeedsRefresh(preview)
                                           conversation-mappers.ts:133
            └─ refreshParticipantInfo()    conversation-mappers.ts:154
                 ├─ fetchUserInfo(uid) → getDoc(users/{uid})   1 read
                 └─ updateDoc(conversations/{id})              1 write
```

`previewNeedsRefresh` clears only once the stored
`participantInfo.{uid}.username` is no longer `undefined`
(`conversation-mappers.ts:136-149`). But `refreshParticipantInfo` writes the
username key only `...(userInfo.username !== undefined && {...})`
(`:169-171`), and `fetchUserInfo` returns `{ displayName: "Unknown User" }`
with **no** username field when the user document does not exist or the read
throws (`conversation-manager.ts:117-120`).

So for a participant whose user document is missing (deleted account) or
unreadable (rule denial), the exit condition is unsatisfiable. The conversation
is taxed 1 read + 1 write on every snapshot, indefinitely.

The benign case terminates correctly: a user who simply has no `username`
field yields `username: null`, which **is** written, and the condition clears.

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/inbox-participant-refresh.test.ts`

- _"costs one read + one write once, then goes quiet"_ and _"still self-heals
  when the participant has no username field"_: the two terminating cases, both
  1 read total across two snapshots.
- _"re-reads and re-writes on every snapshot, forever"_: 5 snapshots → **5**
  reads, and the stored `username` is still `undefined` at the end. No
  progress.
- _"multiplies by the number of affected conversations"_: 12 affected
  conversations → **12 reads + 12 writes in a single snapshot pass.**
- _"has no in-flight guard"_: two conversations sharing one unreadable
  participant issue **two** reads of the same user document in one pass.

### Cost inference

Writes are the dominant half — at roughly 3× a read, 12 reads + 12 writes is
≈48 read-equivalents per snapshot. Snapshots on this listener fire on every
incoming message across the user's 50 most recent conversations, and the
listener is mounted at the app root, so it is live whether or not the user
opens the Inbox. (inferred)

A secondary consequence: each `updateDoc` mutates a conversation document,
which is itself in the listener's result set, so the write re-triggers the
snapshot. Firestore de-duplicates a snapshot whose document data is unchanged,
so this converges rather than spinning — but within the first burst the absent
in-flight guard lets the same document be fetched and written several times.
(inferred; the convergence half is **unverified** — it depends on SDK snapshot
de-duplication behaviour that was not exercised here.)

### Likely fix

Two independent changes, both small:

1. **Make the exit condition reachable.** In `refreshParticipantInfo`, write
   `username: null` unconditionally when the lookup failed, so a failed lookup
   records itself. One line: drop the `!== undefined` spread guard and coalesce
   to `null`.
2. **Add an in-flight/negative cache** keyed by uid in `ConversationManager`,
   so one snapshot pass fetches each distinct participant at most once, and a
   failed lookup is not retried for some cooldown.

**Tradeoffs.** (1) means a participant whose document was _temporarily_
unreadable (transient rule denial, offline) gets a permanent
`username: null` and never re-resolves. Mitigate by distinguishing "document
does not exist" (write the sentinel) from "read threw" (do not write, and rely
on the negative cache's cooldown instead) — `fetchUserInfo` currently collapses
both into the same return, so it needs to stop swallowing the error. That is
the substantive part of the fix and is worth doing carefully: getting it wrong
in the other direction re-introduces the permanent tax.

### Regression test plan

1. Missing user document: snapshot 1 costs 1 read + 1 write; snapshots 2..N
   cost **0**. (Invert the pinned "5 reads" assertion.)
2. Transient read failure: the sentinel is **not** written, and a later
   snapshot after the cooldown retries once and succeeds.
3. Two conversations, one shared unreadable participant, one pass → exactly
   **1** read. (Invert the pinned in-flight assertion.)
4. Unchanged: both terminating cases in the current file must still pass
   untouched.

---

## H5 — App-root notification listener attaches with no limit

`InboxSubscriptionProvider.svelte:89-95` calls
`notificationService.subscribeToNotifications(userId, cb, 0)` with the comment
"No limit - load all notifications for Inbox". `Notifier.subscribeToNotifications`
treats `maxCount <= 0` as "omit the `limit()` clause"
(`notifier.ts:365-372`).

The provider is mounted at the app root for every signed-in user, so the
attach reads the user's entire notification history on every page load,
whether or not they ever open the Inbox — and `users/{uid}/notifications`
grows monotonically; nothing in `notifier.ts` prunes it on a cap or a
schedule. (read)

### Reproduction evidence — measured

`tests/unit/opus-firestore-audit/inbox-notification-listener.test.ts`

- _"attaches with no limit() when called the way InboxSubscriptionProvider
  calls it"_: recorded clauses are exactly
  `[{orderBy createdAt desc}]`; no `limit` clause.
- _"does apply a bound at its default"_: the default `maxCount = 20` **does**
  emit `limit(20)` — so the unbounded shape is the app-root caller's choice,
  not a `Notifier` defect. The fix belongs at the call site.
- _"keeps only one listener alive across resubscribes"_: `Notifier` holds a
  single module-level `unsubscribe` and tears the previous listener down. This
  is correct and is pinned so a refactor cannot regress it into a pile-up.

### Likely fix

Give the provider a page size (`limit(50)`) and let the Inbox surface load
older pages with a `startAfter` cursor when the user actually scrolls. The
badge count the provider exists to compute does not need the full history.

**Tradeoffs.** `inboxState.totalUnreadCount` is derived from the delivered
notifications, so a page-limited listener under-counts unread items beyond the
page. That is a real behaviour change and is the reason the limit was removed.
The correct replacement is a `getCountFromServer` on
`where("read","==",false)` for the badge (1 read per evaluation instead of `N`),
with the listener page-limited for display. `notifier.ts:264` already builds
exactly that `where("read","==",false)` query for `markAllAsRead`, so the
predicate and its index are already proven.

### Regression test plan

1. The provider's call emits `limit(50)`.
2. The badge count comes from an aggregate query, and matches a fixture with
   more unread notifications than the page size — the case a page-limited
   listener gets wrong.
3. Requesting an older page issues exactly one query with a `startAfter`
   cursor.

---

## M6 — The community feed listener is never torn down

`communityCollectionsState.teardown()` exists
(`community-collections-state.svelte.ts:99`) and has **zero callers in `src/`**.
Verified by `rg 'communityCollectionsState.teardown'` — the only `teardown()`
call sites in the browse/library feature tree belong to the sibling
`CollectionsState` and `FollowedCollectionsState` classes, which do call their
own. (read)

`ensureLoaded()` and `invalidate()` are the only production entry points, and
`invalidate()` immediately re-subscribes — **measured** in
`community-feed-fanout.test.ts` (_"has no production caller that ever tears the
feed listener down"_: attach count never returns to a net zero).

Consequences (inferred): the collection-group listener attaches the first time
any of Browse, the library collection picker
(`CollectionChipsRow.svelte:43`), `CommunityCollectionsPanel.svelte:30`, or
`SheetBrowserDock` touches it, and then survives navigation away from Browse
and survives sign-out. After sign-out it either keeps billing reads under the
previous credentials or fails permission-denied into
`community-collections-state.svelte.ts:50`, which sets a user-visible error on
a surface the signed-out user is no longer looking at.

Contrast `collections-state` and `followed-collections-state`, which both
tear down on a null uid — this singleton is the odd one out.

**Fix:** call `communityCollectionsState.teardown()` from the same auth-change
path that already drives `collectionsState.ensureStarted()` /
`followedCollectionsState.ensureStarted()`, and add an `ensureLoaded()` guard
on uid the way the other two guard on `startedFor`.

**Tradeoff:** tearing down on navigation away from Browse would re-pay the cold
attach on return; tearing down only on auth change keeps the warm feed for the
session, which is the right balance given H3's measured re-attach cost.

**Regression test:** a simulated sign-out must bring the net listener count to
zero; a subsequent sign-in must attach exactly one.

---

## M7 — The Browse gallery query is unbounded

`PublicSequencesLoader.fetchPublicSequences()`
(`public-sequences-loader.ts:439-447`) issues
`query(collection("publicSequences"), orderBy("word","asc"))` and `getDocs` —
no `where()`, no `limit()`, no cursor. Every sync reads the entire collection:
`G` reads and `G` documents of egress.

This is a direct violation of `.claude/rules/firestore-cost-discipline.md`
("Every query on a growing collection needs a selective `where()`, a
`limit()`, or both"). It is ranked M rather than H **only** because the caching
around it is genuinely good: the 15-minute TTL
(`gallery-sync-staleness.ts:15`), the IndexedDB warm, the constrained-connection
back-off, and the route check at `+layout.svelte:543` that skips the network
sync unless the user actually landed on `/browse`. (read)

Two things keep it on the list. First, egress: `firestore-cost-anatomy.md`
records Internet Data Transfer Out at $15.29 for August against $16.85 of
reads, so a full-collection pull of hydrated sequence documents is roughly as
expensive in bytes as in reads, and `.select()` is explicitly ruled out as a
lever there. Second, `G` grows monotonically with the product's success, and
nothing in this path degrades gracefully — at some collection size the gallery
sync becomes the single largest client operation in the app.

**Likely fix:** paginate. `orderBy("word")` already gives a stable cursor, so
`limit(PAGE)` + `startAfter` behind the existing offline-cache merge is
mechanical. Better still for the common case: sync incrementally with
`where("updatedAt", ">", lastSyncedAt)`, since `GalleryOfflineCache` already
tracks `lastSyncedAt` for the TTL decision — that turns a periodic full pull
into a delta.

**Tradeoffs.** A delta sync cannot observe deletions, so it needs a tombstone
or a periodic full reconcile (e.g. daily). Pagination interacts with the
gallery's client-side filtering and sorting, which currently assume the full
set is in memory — `browse-filter` and the smart-collection
`deriveSpecMembers` path both do. That is the real cost of this fix and the
reason it is not a quick win. **Unverified:** whether any Browse surface
depends on having the complete set in memory in a way pagination would break
was not exhaustively traced.

**Regression test plan:** assert the query carries a `limit`; assert a second
sync with a populated `lastSyncedAt` issues a `where("updatedAt", ">", …)`
rather than a full scan; assert a deleted sequence disappears after the
reconcile pass.

---

## M8 — The followed-collections shelf re-resolves every follow on any change

`followedCollectionsState.resolve()`
(`followed-collections-state.svelte.ts:132-182`) runs on every snapshot of the
follow-ref subcollection and calls `getPublicCollection(ownerId, id)` for
**every** ref, each of which is 1 `getDoc` plus `toPublicView` →
`countPublicMembers` → `⌈m/30⌉` aggregate count queries. Following or
unfollowing one collection therefore re-reads and re-counts the entire shelf:
`F × (1 + ⌈m/30⌉)` operations. (read)

Ranked M because `F` is small for a typical user and the module is otherwise
exemplary — it has the epoch guard, the disposal-race handling H2's seven sites
lack, batched owner names, and a localStorage mirror for synchronous paint. It
is listed because the fix is the same memo shape as H1 and H3, and because it
is the third instance of the same "re-resolve everything on any change"
pattern in this domain.

**Likely fix:** diff the incoming refs against the resolved set and resolve
only additions; drop removals locally.

**Tradeoff:** a followed collection that is renamed or unpublished by its owner
would no longer refresh on the follower's next follow action. Today that is
incidental — the shelf is not subscribed to the foreign collections themselves,
only to the follow refs — so the staleness window is already unbounded in
practice and the memo does not make it worse. Refreshing on shelf _open_ rather
than on every ref change is the better trade.

**Regression test plan:** the existing
`followed-collections-state.test.ts` covers the resolve semantics; extend it to
assert that adding one ref to a shelf of `F` issues exactly one
`getPublicCollection`, and that removing one issues zero.

---

## Domain dependency, not audited here

**Guest-save isolation is owned by another agent in this batch.** It is a
dependency of two findings and is deliberately not analysed:

- H0's `hasSavedSequences` guard reads `sequenceCount` from the user document,
  and `user-document-manager.ts:88` skips minting a public profile for
  anonymous guests outside production — so guest/anonymous accounts take a
  different path through the profile fan-out than this audit measured.
- H2's disposal race is triggered most often by the anonymous→Google uid swap,
  which is that agent's domain. The leak is real independent of how the swap
  behaves, but the _frequency_ of the trigger depends on it.

No recommendation here should be implemented in a way that changes guest-save
behaviour without coordinating with that work.

---

## Out of scope, deliberately not touched

Per the brief: no connection to production, no changes to `firestore.rules` or
`firestore.indexes.json`, no telemetry added. Admin services, the arena pool,
and the security-rule `get()` costs from the 2026-05-23 spec belong to that
spec and were not re-examined. Per-user subcollection scans with natural small
bounds (`tag-manager.ts:144,231`, `collection-manager.ts:579`,
`notifier.ts:264`) were inventoried and judged not worth ranking.

Two unranked observations recorded for completeness (read):

- `ConversationManager.subscribeToUnreadCount` (`conversation-manager.ts:520`)
  is an unbounded listener over the user's conversations and has **zero
  production call sites**. It is dead code today; if it is ever wired up it
  would duplicate `subscribeToConversations`'s result set with a second
  listener and no `limit()`.
- `Messenger` (`messenger.ts:410`) reads every message in a conversation with
  no limit to mark them read. Bounded by one conversation's message count,
  which grows without bound for an active thread.

---

## Verification performed

All commands run from the repository root in a clean container at base SHA
`c4be1619`, after `pnpm install --frozen-lockfile --ignore-scripts` and
`npm run build:packages` (the workspace packages must be built or
`@tka/tka-types` fails to resolve under vitest).

```
npx vitest run --config tests/config/vitest.config.ts tests/unit/opus-firestore-audit/
  → 5 files, 21 tests, all passing
```

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/features/library src/lib/shared/library src/lib/shared/messaging
  → 13 files, 162 tests, all passing  (pre-existing suites, unchanged)
```

### Why the new tests pass rather than fail

This is a read-only audit, so there is no fix for a test to go green against.
Each new test pins **current** production behaviour with a measured operation
count and names, in a `DEFECT PINNED` comment, the assertion to invert when the
fix lands. That keeps CI green for the nine other agents working this
repository concurrently, while forcing any future fix to update this file
rather than leave the defect in place silently. Where a correct implementation
already exists in the same codebase — `subscribeToAllPublicCollections`'s
disposal guard, `refreshPublicSequenceOwnerProfile`'s write filter,
`Notifier`'s default `limit(20)` — it is pinned alongside the defect so the
contrast is measured rather than asserted in prose.

### Known limitations of the harness

- **Mocked SDK, not the emulator.** Operation counts are the calls the
  application code makes. They do not capture Firestore's own
  snapshot de-duplication, listener resumption, or the exact billing of an
  aggregate query over an index. The H4 convergence claim in particular is
  marked inferred for this reason. Re-running the H1/H3/H4 censuses against
  `firebase emulators:exec --only firestore` (the repo already has
  `tests/config/vitest.rules.config.ts` and `npm run test:rules` wired for it)
  would settle those.
- **No production census.** `G`, `P`, `N`, `K`, `U`, `F` are unknown. The
  ranking is ordinal and rests on how often each path runs and how it scales,
  not on measured volume.
- **One harness bug found and fixed during the work,** recorded because it
  would mislead anyone extending these tests: a `await import("firebase/firestore")`
  inside a test helper resolved to the **real** module for concurrent calls
  after the first, silently under-counting operations by an order of magnitude.
  All SDK access in these files is via static import for that reason.

## Owned files

```
tests/unit/opus-firestore-audit/listener-disposal-race.test.ts
tests/unit/opus-firestore-audit/community-feed-fanout.test.ts
tests/unit/opus-firestore-audit/inbox-participant-refresh.test.ts
tests/unit/opus-firestore-audit/inbox-notification-listener.test.ts
tests/unit/opus-firestore-audit/profile-boot-fanout.test.ts
docs/reports/opus-batch-2026-09-12/firestore-cost.md
```

No production source file was modified.

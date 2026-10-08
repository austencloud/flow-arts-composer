---
status: active
value: 5
effort: XL
remaining: "Verify Sequence/Public Parity Repair against src/lib/shared/foundation/services/word-deriver.ts before resuming implementation. Prior recorded remainder: 'Phase 1 landed (public-sequence-index model, public-index-syncer, library-save-service, library-sync-retry, plus the Fable 5 hardening round). Phases 2-5 open: dual-compatible writer, dry-run + repair tooling, tighten Firestore rules, scheduled audit. Named-but-absent files are Phase 2+ deliverables (public-artifact-projector, public-projection-preparer, library-batch-operations, library-recycle-bin). The Opus 5 review this spec asked for HAS happened (2026-07-25): 16 of 16 spot-checked claims held and all 26 referenced paths exist, so queue this as implementation, not review.'"
depends_on: ""
plan_path: ""
tags: [firestore, sequences, public-index, data-integrity, parity]
last_triaged: 2026-10-07
work_state: unverified
---
# Sequence/Public Parity Repair

> Status: **reviewed and accepted; Phase 1 in progress**
>
> Date: 2026-07-25
>
> Review: Opus 5, 2026-07-25. Sixteen factual claims were spot-checked against
> the codebase and all sixteen held; every one of the 26 referenced paths
> exists. Three corrections and one new evidence section were folded in — see
> **Review corrections** below. The design is accepted as written apart from
> those.
>
> Scope: sequence persistence, the `publicSequences` materialized view, public
> content-hash uniqueness, shortcode payload labels, repair tooling, and drift
> detection.

## Decision

Make the owner sequence and its public projection one consistency boundary.

For a public sequence, one Firestore transaction must write or remove:

1. `users/{uid}/sequences/{sequenceId}`
2. `publicSequences/{sequenceId}`
3. `publicSequenceHashes/{contentHashVersion}_{contentHash}`
4. the user's sequence-count update when the operation creates or deletes the
   owner sequence

The transaction receives a fully normalized sequence and a public projection
built by one shared pure function. It never derives a word from `name`, never
accepts a partial word, and never rebuilds a public document from an
unhydrated sequence.

Shortcodes remain a separate immutable content boundary. A shortcode label is
derived from that shortcode's encoded payload, not from the current owner or
public sequence.

This design removes the failure mode that produced `GI` for Christof's
`IIECCKIIECCK` sequence and closes the adjacent paths that can produce the same
class of drift.

## Boundaries

This design does not:

- change TKA letter, motion, LOOP, or start-position derivation rules
- rewrite shortcode payloads
- automatically choose between duplicate historical public records
- make `publicHandPaths` or `publicSoloProps` part of the core sequence
  transaction
- claim that private-library content-hash uniqueness is solved

The owner library still has a query-before-write duplicate race. Two duplicate
hash groups exist in the audited Austen library. The repair audit reports them,
but a per-user private hash claim would change fork and save semantics and
needs its own decision. The global public claim in this spec protects only the
public gallery invariant.

## Why this needs an architectural repair

The repaired record was not an isolated typo. The current write graph permits
states that the read graph assumes cannot exist.

```text
current public save

normalize some owner fields
        |
        v
owner sequence + profile batch commits
        |
        v
PublicIndexSyncer performs another write
        |
        +---- failure here leaves a public owner doc with no matching mirror
        |
        v
thumbnail and public artifact writes happen later
```

The public loader describes `publicSequences` as self-contained, but it still
falls back to `sourceRef` when compositional fields are absent. The syncer
computes `sequenceLength` from `sequence.steps?.length ?? 0`, so an
unhydrated, composition-only sequence can be published with a zero length.
`updateSequence` refreshes the mirror only when visibility changes, so public
metadata can drift after an ordinary edit. Thumbnail sync and delete also use
separate writes.

The hand-built public map also drops fields that Browse reads. The shared
Browse filter searches `intendedWord` and filters `reversalPattern`, but the
syncer does not persist either field and the public loader does not map them.
The loader tries to read `componentDomains`, while the syncer persists
`components` without `componentDomains`. The syncer writes `creatorIntent` and
`startPosition`, but the public loader's self-contained map drops both before
hydration. Those failures look like empty search results, a default reversal
classification, or lost viewer intent, not a broken page.

The word path has a second gap. `deriveWordFromBeats` silently drops steps with
missing letters. A 12-beat sequence with two unresolved steps can therefore
produce a plausible 10-token word and pass into persistence. The current Fuse
regression test catches the historical `GI` case and logs partial derivation,
but it does not stop a partial result from being stored.

The shortcode path has a third gap. New records prefer `sequence.word` before
deriving from payload steps. A stale mutable word can be stamped onto an
otherwise correct immutable encoded payload.

## Evidence from the 2026-07-25 corpus audit

The audit read 467 `publicSequences` documents, their linked owner documents,
and 20,215 shortcode documents.

### Public and owner sequences

| Finding | Count | Meaning |
| --- | ---: | --- |
| Current public words that contradict their own complete step data | 0 | The live Christof mirror was repaired before this design pass. |
| Public documents without `steps` or compositional `stepPairings` | 7 | Browse rendering depends on `sourceRef`; these are not self-contained. |
| Those seven with `sequenceLength: 0` despite source lengths of 16, 8, and 8 | 3 | The unhydrated `steps?.length ?? 0` path has produced live bad metadata. |
| Linked owner documents with blank `word` and an automatic name | 10 | Correct public words are not backed by a canonical source word. |
| Linked owner word contradicting its source step letters | 1 | The public word matches the steps; the owner word does not. |
| Public/source `contentHash` drift | 37 | 17 public-only, 11 unequal, 9 source-only. |
| LOOP prefix-equivalent word differences | 34 | Expected seed-versus-expansion representation, not corruption. |

The seven incomplete public documents are:

- `4def1d13-144f-4016-a1f8-f19ba2a1c950`
- `fe36e95d-b5a5-4e31-997d-8e7a89f0b753`
- `seq_1765151657683_bdk70tv1d`
- `seq_1784439975420_f0bf7a45`
- `seq_1784441537912_6a60c532`
- `seq_1784442568487_096360ae`
- `seq_1784446580186_3ddd5e91`

The owner document with a word that contradicts its own steps is
`bf8b6fc2-427b-48e5-b84c-d5a82df7694c`.

The broader Austen-library audit found 504 documents with one missing
`contentHash`, two duplicate-hash groups, seven invalid or missing
start-position letters, one sentinel timestamp, and six missing `gridMode`
values. The public corpus has eleven missing hashes and fifteen missing
`gridMode` values in addition to the seven incomplete projections. Those
findings belong in the repair report, but only fields derivable from canonical
sequence data are automatic repairs.

### Shortcodes

| Finding | Count | Treatment |
| --- | ---: | --- |
| Total shortcode documents | 20,215 | Audit corpus. |
| Self-contained through `encoded` | 20,211 | Decode this payload first. |
| Self-contained through `sequenceData.steps` | 4 | Use the embedded steps. |
| Linked to a current public sequence | 848 | Link is provenance, not label authority. |
| Label contradicts the current public word | 16 | Fourteen are valid historical payload versions. |
| Stale `GI` labels linked to the Christof sequence | 2 | Re-derive each from its own 7-beat or 10-beat payload. |
| Automatic-name labels from the earlier dry run | 4 | Repair only when the payload produces a complete word. |
| Missing `sequenceName` with another usable fallback | 12 | Compatibility data, not a broken payload. |

`VOJT` and `Z3WC` still carry `GI`, but their payloads contain 7 and 10 beats.
Copying `IIECCKIIECCK` from the current 12-beat public sequence would corrupt
both codes. `KJXS`, whose payload is the repaired 12-beat sequence, now carries
`IIECCKIIECCK`.

The four automatic-name records are:

- `0XHN`: `Sequence <time>`, with only a partial derived word
- `3CLR`: `Assemble Sequence`, with only a partial derived word
- `EK7E`: `Assemble Sequence`, with only a partial derived word
- `OM76`: `Assemble Sequence`, with no derivable word

All four have `scanCount: 0`. They still need payload-based classification,
not a blanket rename.

### Snapshot parity

The official R2 snapshot exported at `2026-07-25T03:01:19Z` declares and
contains 20,200 records. Firestore contained 20,211 encoded records. The eleven
newer Firestore records are expected between daily exports. The bundled static
snapshot contains 20,063 records and is an older fallback.

Snapshot lag is not the cause of the `GI` defect. The source records were
already inconsistent before export.

The shortcode snapshots are intentionally skinny and carry encoded payloads,
not Firestore label metadata. Label repair remains a Firestore change; snapshot
verification confirms that the immutable payload did not change. The full
`publicSequences` static snapshot must be regenerated after projection repair.

## Field-consumer ledger (added by review, 2026-07-25)

Section 3 requires a field-consumer ledger before the projection schema is
frozen. It was built, and it found more than this design assumed.

### Read but never written — live bugs, silently defaulted

Each of these is read off a `publicSequences`-sourced object and is never in the
syncer's `publicData` literal. None of them error; each falls back to a default,
so the feature simply does nothing.

| Field | Consumer | Live symptom |
| --- | --- | --- |
| `animatedSequenceUrl` | `feed-loader.ts:105,107,141,148` | The Watch feed's animation-versus-pictograph split can never fire. Every public sequence resolves to `pictograph`. |
| `gridMode` | `loop-labeler/sequence-loader.ts:43`, `browse-filter.ts:459` | The Grid Mode filter is dead for every gallery sequence. |
| `intendedWord` | `browse-filter.ts:196` | Contains-letters search silently ignores intended-word matches. |
| `reversalPattern` | `browse-filter.ts:649-655` | Reversal filter cannot differentiate public sequences; all default to `continuous`. |
| `componentDomains` | `public-sequences-loader.ts:304,321` → `loop-display-resolver.ts:302` | LOOP component-domain display always falls back to defaults. |
| `views`, `creatorName`, `creatorId` | `content-query-analyzer.ts:34-71` | Admin "top sequences by views" is non-functional. These are wrong legacy names; the real fields are `viewCount`, `ownerDisplayName`, `ownerId`, and the `orderBy("views","desc")` is meaningless. |

The first three and the admin trio were not in the original evidence section.
`animatedSequenceUrl` and the admin panel are independent pre-existing defects
that this projection work happens to fix; they are not parity drift.

### The two-read-path trap

A public sequence reaches the app through **two** different mappers:

1. main Browse gallery → `mapPublicIndexToSequenceData`
   (`public-sequences-loader.ts:294-371`)
2. public collection view → `batchFetchPublicSequences`
   (`collection-firestore-mapper.ts`, raw `...data` spread through
   `LibrarySequenceDocSchema`)

Path 2 reads seven fields that path 1 drops entirely: `forkCount`, `viewCount`,
`starCount`, `contentHash`, `contentHashVersion`, `creatorIntent`,
`startPosition`.

Deriving the projection schema from path 1 alone — the obvious approach, since
it is the main gallery — silently breaks prop configuration on saved LOOPs,
start-cell rendering, and the "already saved" badge, and only when a user opens
a public collection rather than the main grid. The schema must cover both paths.

### Written but not consumed

- `contentHashVersion` is validated on read and never branched on.
- `encoderHash` backs `where("encoderHash","==")` in
  `public-sequence-hash-matcher.ts:36`, but its only caller `findPublicMatch()`
  has zero call sites. The query is dormant. Keep the field (the hash-claim work
  in section 8 depends on the same basis) but do not treat the matcher as live.

### Confirmed dead

`createPublicSequenceIndex()` (`public-sequence-index.ts:161`, in **both**
copies) has zero call sites. `public-index-syncer.ts` hand-builds `publicData`
instead — which is precisely how the declared interface and the real writer
drifted apart. This is the strongest argument for section 3's single builder.

## Required invariants

### Sequence invariants

1. The owner sequence is the canonical editable record.
2. A persisted exact word is the concatenation of one non-empty notation token
   for every hydrated beat, in beat order.
3. `word` never falls back to `name`, `displayName`, or an automatic title.
4. `name` and `displayName` remain presentation metadata and may be user-authored.
5. A persistence boundary rejects incomplete word derivation. Editing state may
   remain incomplete.
6. `sequenceLength` comes from the normalized canonical beat count, never from
   an optional array on an unhydrated input.
7. `contentHash` and `contentHashVersion` are computed from the same normalized
   motion data that is persisted.
8. LOOP data persists the complete expanded beat word. Any shortened LOOP
   display is a view concern and must not change the stored exact word.

### Public projection invariants

1. `publicSequences/{id}` is a self-contained, versioned materialized view.
   `sourceRef` is provenance, not a rendering dependency.
2. A resulting owner document with `visibility: "public"` and
   `isDeleted != true` has exactly one public document with the same id.
3. A private, unlisted, soft-deleted, or deleted owner document has no public
   document.
4. Public create, public-affecting update, publish, unpublish, and delete commit
   owner, mirror, and hash claim together or commit nothing.
5. The public document records the source's `publicProjectionRevision`,
   `publicProjectionSchemaVersion`, and `publicProjectionDigest`.
6. Source-owned fields are produced by one projection builder. Callers cannot
   assemble public maps by hand.
7. Existing `publishedAt` and public engagement counters survive a projection
   refresh.
8. `updatedAt` changes when projection content changes.
9. A content-hash claim points to one public sequence. Publishing the same hash
   under another id fails with a typed duplicate result.

### Shortcode invariants

1. A new shortcode has an immutable `encoded` payload or embedded
   `sequenceData.steps`, as the existing Firestore rule already requires.
2. `payloadWord` is derived from that exact payload after encoding or decoding.
3. `payloadWord` is complete for every payload beat. Minting fails if it is not.
4. A mutable `sequenceId` link is provenance only. Later edits do not relabel an
   existing shortcode.
5. A repair derives labels from each shortcode's payload. It never copies the
   current public word by id.

## Proposed architecture

### 1. Add strict word derivation to the existing word module

Extend
`src/lib/shared/foundation/services/word-deriver.ts`; do not create another
word utility.

Add a result type:

```ts
interface WordDerivationStatus {
  readonly word: string;
  readonly complete: boolean;
  readonly stepCount: number;
  readonly tokenCount: number;
  readonly missingStepIndexes: readonly number[];
  readonly source: "steps" | "stepPairings" | "none";
}
```

Add:

```ts
deriveWordStatus(sequence: SequenceData): WordDerivationStatus
deriveWordStatusFromSteps(steps: readonly Step[]): WordDerivationStatus
requireCompleteWord(sequence: SequenceData): string
```

Rules for the implementation:

- Prefer hydrated `steps`.
- Use `stepPairings` only when steps are absent, not when steps exist but are
  incomplete.
- Treat whitespace-only or missing tokens as unresolved.
- Preserve token order and glyphs.
- Report every unresolved beat index.
- Never consult `word`, `name`, `displayName`, or `intendedWord` for strict
  derivation.
- Keep `deriveWord` and `getSequenceDisplayName` as permissive display helpers.
  Persistence code must call the strict API.

This extends the existing canonical module and turns the current warning-only
behavior into a reusable gate.

### 2. Normalize once before persistence

Add
`src/lib/shared/library/services/sequence-persistence-normalizer.ts`.

This orchestration is new because no current boundary combines hydration,
composition, exact-word validation, canonical count, and identity hash. It
must reuse:

- `SequenceHydrator.hydrate`
- `ensureComposition`
- `withCanonicalStepCount`
- `deriveWordStatus`
- `SequenceContentHasher.computeHash`
- `CONTENT_HASH_VERSION`

The normalizer accepts a full incoming sequence and returns the shape below.

> **Correction:** `LibrarySequenceWriteData` **does not exist** anywhere in the
> codebase — the name was invented by this spec. The implementation must
> identify the real owner-document write type (the object that actually reaches
> `setDoc` in `LibraryRepository.saveSequence`) and either reuse it or declare
> one, rather than assuming the name resolves.

```ts
interface NormalizedSequenceWrite {
  readonly hydrated: SequenceData;
  readonly ownerData: LibrarySequenceWriteData; // see correction above
  readonly exactWord: string;
  readonly sequenceLength: number;
  readonly contentHash: string;
  readonly contentHashVersion: number;
}
```

The operation order is fixed:

1. Hydrate when `steps` are absent.
2. Reject empty data.
3. Derive or refresh compositional fields from the hydrated sequence.
4. Validate one exact word token per beat.
5. Stamp the exact word.
6. Stamp canonical sequence length.
7. Compute the active-version content hash from the normalized hydrated data.
8. Strip `undefined` only after all validation succeeds.

The normalizer has no Firestore writes, UI state, cache updates, or toasts. It
is safe to run before a transaction and from Admin migration tooling.

`saveSequenceWithMetadata` must stop assigning
`word: sequence.word || metadata.name`. Metadata may set `name` or
`displayName`; only strict derivation sets `word`.

### 3. Create one canonical public projection

Keep the canonical model in
`src/lib/shared/foundation/domain/models/public-sequence-index.ts`.

Delete the duplicate
`src/lib/features/library/domain/models/public-sequence-index.ts` after
confirming imports. The two files are byte-for-byte copies today.

Delete the unused, incomplete `createPublicSequenceIndex`. Put the pure builder
in `src/lib/shared/library/services/public-sequence-projection.ts`; the domain
model file keeps types and schema-facing constants. The builder accepts a
normalized sequence plus already-resolved projection context:

```ts
interface PublicProjectionContext {
  readonly ownerDisplayName: string;
  readonly ownerAvatarUrl?: string;
  readonly tagNames: readonly string[];
  readonly encoderHash: string;
  readonly loop: {
    readonly isCircular: boolean;
    readonly loopType: string | null;
    readonly period?: number;
    readonly components?: SequenceData["components"];
    readonly componentDomains?: SequenceData["componentDomains"];
    readonly loopSpec?: SequenceData["loopSpec"];
  };
  readonly difficultyLevel?: string;
  readonly level?: number;
}

interface ExistingPublicOwnedFields {
  readonly publishedAt?: Timestamp;
  readonly forkCount?: number;
  readonly viewCount?: number;
  readonly starCount?: number;
}

buildPublicSequenceProjection(
  normalized: NormalizedSequenceWrite,
  context: PublicProjectionContext,
  revision: number,
  existing?: ExistingPublicOwnedFields
): Promise<PublicSequenceIndexWriteData>
```

The builder is deterministic except for timestamps supplied by the writer. It
must persist all data needed by Browse and the sequence viewer:

- identity: `id`, `sourceRef`, `ownerId`
- owner projection: display name and avatar
- presentation: `name`, `displayName`, `intendedWord`, exact `word`,
  thumbnails
- canonical count and difficulty
- LOOP metadata, including `components`, `componentDomains`, and `loopSpec`
- reversal-pattern metadata used by Browse filters
- tag names
- fork attribution and creator intent
- birthday
- `contentHash`, `contentHashVersion`, and `encoderHash`
- `gridMode` and `startPosition`
- `blueSoloProp`, `redSoloProp`, and `stepPairings`
- hand-path and solo-prop hashes
- `publicProjectionRevision`
- `publicProjectionSchemaVersion`
- `publicProjectionDigest`

Before freezing the schema, build a field-consumer ledger for
`PublicSequencesLoader`, Browse filters, the sequence viewer, offline cache,
share/hash matching, and thumbnail rendering. Every consumed public field must
be either included in the schema or documented as derived from included data.
Private notes, performance media paths, and arbitrary metadata are excluded.
If a public metadata bag is needed for rendering, project an allowlisted typed
shape instead of copying the extensible source map.

Add a dedicated runtime schema for the wire document. The current loader casts
Firestore data to `PublicSequenceIndex`, and
`collection-firestore-mapper.ts` validates public documents with the general
library schema. Neither verifies a self-contained public projection.

The schema must distinguish Firestore `Timestamp` wire values from application
`Date` values and provide one conversion function. `PublicSequencesLoader`,
the offline cache, and hash matcher must import the same canonical type.

During rollout, `PublicSequencesLoader` may use `sourceRef` fallback only for a
legacy document without projection schema 2. Record a metric for every fallback
hit. A schema-2 document that fails self-containment validation is an invariant
violation: report it and exclude it from Browse until repaired. Fetching the
owner source would hide new drift.

After the corpus migration and compatibility window, Browse accepts only
schema-2 documents. Keep `sourceRef` for attribution and Admin diagnostics, not
rendering.

### 4. Define projection field ownership

A full `setDoc` currently risks resetting counters, and it does not merely risk
resetting `publishedAt` — it **unconditionally overwrites it on every sync**
(`public-index-syncer.ts:174` sets `publishedAt: serverTimestamp()` in the
literal, and the literal is written with a full `setDoc`). Every republish has
already destroyed the original publication time, and the value is not
recoverable from the public document. The migration must therefore treat
`publishedAt` as suspect corpus-wide and prefer the owner document's `birthday`
or `createdAt` when reconstructing it, rather than trusting the mirror.

The builder must use an explicit ownership split.

| Owner | Fields | Refresh rule |
| --- | --- | --- |
| Sequence source | word, names, thumbnails, composition, counts derived from composition, hashes, LOOP data, tags, creator intent, fork attribution, birthday | Rebuild through the canonical projection. |
| User profile | owner display name and avatar | Refresh on profile projection work or the next sequence projection. |
| Public engagement | `forkCount`, `viewCount`, `starCount` | Preserve unless a named counter operation changes the field. |
| Publication lifecycle | `publishedAt` | Set once on first publication and preserve on resync. |
| Projection writer | `updatedAt`, revision, schema version, digest | Change only with projection content. |

The projection digest covers source-owned and profile-owned projection fields.
It excludes engagement counters and timestamps. Use the existing
`canonicalJSON` utility. Extract the repeated Web Crypto SHA-256-to-hex code
into one shared helper instead of adding another private digest
implementation.

The owner document stores matching
`publicProjectionRevision`, `publicProjectionSchemaVersion`, and
`publicProjectionDigest` while public. These fields are cleared on unpublish.
They are separate from the existing `_version`, which tracks general document
conflicts. A notes-only update must not force a public projection revision.

### 5. Prepare projection context before the transaction

`PublicIndexSyncer` currently handles moderation, tag and profile reads, LOOP
detection, projection assembly, Firestore writes, public artifact fanout, error
feedback, and Browse cache mutation. The word and field-loss defects cross
those responsibilities. The file fails the single-responsibility test for a
proven reason, not its line count.

Replace it with
`src/lib/features/library/services/public-projection-preparer.ts`. Its one job
is to produce settled `PublicProjectionContext` before a repository
transaction. It must not own Firestore writes, public artifact writes, cache
mutation, or user feedback.

Before the transaction it may:

- run content moderation
- enforce the community minimum
- read owner display data
- resolve tag names
- calculate difficulty
- detect LOOP data
- calculate `encoderHash`

Any preparation failure stops before Firestore writes. `encoderHash`, resolved
tag names, LOOP data, difficulty, and owner metadata are part of one settled
projection result. An untagged sequence resolves to an empty tag list; a failed
tag lookup is not the same state. No broad `catch` may convert a calculation or
read failure into missing projection data.

The current broad `catch` blocks that silently omit derived data need typed
results. The transaction receives settled projection data and contains no
moderation, network lookups outside Firestore transaction reads, cache
mutation, or UI callbacks.

Do not replace the old class with thin cache or transaction wrappers. The
repository calls the existing Browse-loader cache methods through injected
post-commit callbacks. The composition root wires those callbacks after the
transaction resolves.

### 6. Put public writes behind one repository transaction

`LibraryRepository` remains the public library API and orchestrator. Add
`src/lib/shared/library/services/public-sequence-persister.ts` to implement the
atomic persistence of the public-sequence aggregate: owner, public projection,
hash claim, and profile count when applicable. This keeps transaction mechanics
out of the already broad repository while giving batch, recycle-bin, and
conflict paths one writer to call.

`LibrarySaveService` may stage the normalized record in Dexie before the cloud
transaction, marked as pending. That local write is not evidence of
publication. It must not add the sequence to the Browse cache or present public
sync as confirmed. A permanent publication rejection keeps the library copy
private and records the typed blocked reason; a transient failure retains the
pending public intent for retry.

For a public create or public-affecting update:

1. Normalize the incoming sequence.
2. Prepare projection context.
3. Start `runTransaction`.
4. Read the current owner document, current public document, current hash
   claim, and proposed hash claim before any write.
5. Recheck the expected owner `_version` or update precondition.
6. Reject a proposed claim owned by another public sequence with a typed
   `PUBLIC_DUPLICATE` result.
7. Compute the next `publicProjectionRevision`.
8. Build the public projection while preserving public-owned fields.
9. Write owner, public projection, hash claim, and profile counter mutation.
10. Delete a prior claim only when the transaction proves it belongs to this
    sequence and the content hash changed.
11. Commit.
12. Mark the Dexie record synced, update Browse cache, and project independently
    discoverable public artifacts from the committed projection.

The persister's transaction callback may run more than once. All values captured or
assigned inside it must be reset on every invocation, following the pattern in
`ShortCodeManager`'s hash-claim transaction. UI effects and cache writes happen
only after `runTransaction` resolves.

For a public thumbnail completion, run a narrow transaction that reads the
owner and public records, patches the owner thumbnails, patches only public
thumbnails plus projection revision/digest, and preserves every other public
field. Do not replay an earlier full sequence snapshot.

For unpublish:

- update owner visibility
- clear owner public-projection stamps
- delete public projection
- delete its owned hash claim

For delete:

- delete owner sequence
- delete public projection if present
- delete its owned hash claim
- decrement the profile count

Each operation is one transaction.

Private-only saves can retain offline-capable batched writes when they do not
touch public projection fields. Firestore client transactions fail offline,
while batched writes can queue offline. The existing Dexie-first save and
`library-sync-retry.ts` already provide the queue for a public operation. The
retry layer must classify:

- transient network and contention failures as retryable
- `INCOMPLETE_WORD`, moderation failure, and `PUBLIC_DUPLICATE` as
  non-retryable user-action states

A permanent validation error must not spin in the background retry queue.

`LibrarySaveService` is the single user-feedback boundary for an interactive
save or publish. Lower repository and projection layers return typed failures
or let unexpected errors propagate. They must not show a modal and then rethrow,
which is the current `PublicIndexSyncer` pattern.

Use `getErrorHandler().showUserError()` only for a failure that blocks the
user-initiated operation or would otherwise look like silent data loss. Supply
the library module, save/publish action, sequence id, sync state, and typed error
code as context. Expected validation states need direct messages and a clear
next action:

- incomplete word: `This sequence has unresolved beats. Finish them before publishing.`
- public duplicate:
  `This exact sequence is already in the community gallery. Your library copy remains private.`
- offline/transient failure:
  `Couldn't publish this sequence. It is saved on this device and will retry when you are online.`

Background retry records technical failure context without reopening a modal on
every attempt. A later successful retry clears the pending state. Thumbnail and
public-artifact failures remain visible through sync status and the audit, but
they do not report the core sequence transaction as failed after it committed.

### 7. Close batch, recycle-bin, and conflict-resolution bypasses

The shared implementations used by `LibraryRepository` contain more direct
owner writes:

- `LibraryBatchOperations.deleteSequences`
- `LibraryBatchOperations.addTagsToSequences`
- `LibraryBatchOperations.setVisibilityBatch`
- `LibraryRecycleBin.softDeleteSequence`
- `LibraryRecycleBin.restoreSequence`
- `LibraryRecycleBin.purgeSequence`
- `LibraryRecycleBin.emptyRecycleBin`
- `LibraryRepository.resaveSequenceForConflict`
- `LibraryRepository.attachThumbnail` (owner `updateDoc` at :748, then a
  separate mirror `updateDoc` — functionally covered by the thumbnail
  transaction in section 6, but it belongs in this ledger)

Two more writers sit **outside `LibraryRepository` entirely** and were missed
in the first pass:

- `LoopLabelsFirebaseRepository.deleteSequenceFromDatabase`
  (`src/lib/features/loop-labeler/services/loop-labels-firebase-repository.ts:200-214`)
  deletes `publicSequences/{id}` directly and never touches the owner document.
  It leaves an owner record with `visibility: "public"` and no mirror — exactly
  the drift class this design exists to remove. Worse, after phase 4 that owner
  document can never be updated again, because every owner update will demand a
  matching mirror that no longer exists. This is an Admin/labeler tool, so it
  must either route through unpublish or be restricted to Admin-only repair
  tooling that fixes both sides.
- `ShortCodeManager` is correctly out of scope (immutable payload boundary), but
  confirm no other feature-layer service writes the collection before phase 4.
  The sweep that found the labeler path was
  `grep -rn "getPublicSequencePath\|publicSequences" src scripts functions`.

Every path that changes a public projection field or public eligibility must
call `PublicSequencePersister`.

Batch operations are atomic per sequence, not across the whole selection.
Prepare each sequence, run the per-sequence transaction with bounded
concurrency, and return a result for every id. One rejected sequence must not
hide the committed results for its neighbors. Retrying the failed subset is
safe.

Specific handling:

- batch visibility uses publish/unpublish transactions, never an owner batch
  followed by `Promise.all` mirror writes
- batch delete removes owner, mirror, claim, and profile count per sequence
- batch tag edits reproject public sequences because the public document stores
  resolved tag names; private sequences may retain an offline batch
- collection-only and notes-only edits remain owner-only when their fields are
  outside the projection key set
- conflict resolution sends a public winning copy through normalization and the
  public transaction instead of a standalone `setDoc`
- soft delete marks the owner `isDeleted: true`, clears public projection
  stamps, and removes mirror and claim in one transaction
- a soft-deleted record is not publicly eligible even if its stored visibility
  remains `public`
- restore of a formerly public record reruns normalization, moderation, and
  claim checks before restoring the public projection; a public duplicate
  restores the library record as private and returns a typed
  `RESTORED_PRIVATE_PUBLIC_CONFLICT` result
- purge and empty-bin paths delete any defensive leftover mirror and owned
  claim in the same per-record transaction

The current feature-layer copies of `library-batch-operations.ts` and
`library-recycle-bin.ts` have no imports. They are not identical to the shared
implementations. Delete them after a second import check so future fixes cannot
land in dead copies.

### 8. Replace query-based public deduplication with a hash claim

Add:

```text
publicSequenceHashes/{contentHashVersion}_{contentHash}
```

Claim data:

```ts
interface PublicSequenceHashClaim {
  readonly sequenceId: string;
  readonly ownerId: string;
  readonly contentHash: string;
  readonly contentHashVersion: number;
  readonly createdAt: Timestamp;
}
```

This uses the proven `shortcodeHashes/{encoderHash}` transaction pattern.
The current `where("contentHash", "==", hash)` preflight query is not a
uniqueness boundary: two clients can both observe no result and then write.

Public duplicate semantics differ from shortcode semantics. A shortcode caller
can adopt the winning code for the same immutable payload. A sequence publisher
cannot adopt another owner's sequence id, so a claim owned by another
sequence returns `PUBLIC_DUPLICATE` and commits nothing.

The claim id includes the hash version so a future hash-basis rollout cannot
confuse values computed under different bases.

### 9. Enforce transaction shape in Firestore rules

Update both the owner-sequence and public-sequence rule blocks. Add rules for
`publicSequenceHashes`.

For a resulting public, non-deleted owner document, rules must use `getAfter()`
to require:

- a public document at the same id
- `ownerId == request.auth.uid`
- exact `sourceRef == users/{uid}/sequences/{id}`
- public `publicProjectionRevision` equals the owner stamp
- public `publicProjectionSchemaVersion` equals the owner stamp
- public `publicProjectionDigest` equals the owner stamp
- exact equality for the core source-owned fields that rules can compare
  directly, including word, content hash/version, canonical length,
  compositional fields, and start position
- a matching hash claim after the transaction

For a public document create or update, rules must require the matching owner
document after the transaction, public visibility, matching stamps, and the
same core field checks.

For unpublish, soft delete, or delete, rules must require the public document
and owned hash claim to be absent after the transaction. A hash claim:

- is publicly readable
- may be created only by a full user for a matching owner/public transaction
- may not be updated
- may be deleted only by its owner as part of a proven unpublish, delete, or
  hash change, or by Admin

Rules cannot recompute a SHA-256 projection digest. Matching digest stamps are
an accidental-drift guard, not proof against a malicious owner writing the same
false digest twice. Direct equality checks protect the critical copied fields;
the shared builder and audit protect the full projection.

Use `diff().affectedKeys()` on owner updates. Notes and other fields outside the
public projection may update without rewriting the mirror. Any
public-projection source key, visibility, or public stamp change requires the
paired transaction.

Firestore permits 20 document-access calls for an atomic multi-document
operation and 10 for each individual write evaluation. Do not choose a batch
size by intuition. Add emulator tests that exercise the full transaction and
measure the accepted shape before setting any bulk limit.

### 10. Keep public artifacts outside the core transaction

`publicHandPaths` and `publicSoloProps` are independently discoverable indexes.
They are not needed to render a self-contained `publicSequences` document and
can expand to a variable number of writes.

Move their existing projection logic to
`src/lib/features/library/services/public-artifact-projector.ts`. That module
has one job: idempotently project independently discoverable artifacts after a
public sequence commit. Add those indexes to the audit and repair path, and
never let their failure roll back or invalidate a correct public sequence. Do
not describe them as atomically consistent with the owner sequence.

This is a deliberate boundary, not a hidden follow-up write.

## Shortcode correction

**LANDED (2026-07-26).** Mint path shipped as specced (strict
`deriveWordStatusFromSteps` over the payload steps, `IncompleteWordError` on
incomplete, `payloadWord`/`payloadStepCount`/`payloadSchemaVersion: 2`/
`sourceSequenceId`/`sourceProjectionRevision`, aliases written from
payloadWord; readers — `importedWord`, the /q SSR OG mask — prefer
payloadWord). The repair path shipped with three findings the spec's
assumptions didn't survive, all now encoded in
`backfill-shortcode-words.ts`:

1. **"Decode encoded first" is unsafe alone** — old deck blobs carried
   content-only beats, so the modern decoder consumes the first content beat
   as the start position and the word silently loses its head (proven on
   09PB). The script derives BOTH sources and prefers the one with more
   content beats; deck-embedded blobs also number content beats 0-BASED, so
   a stepNumber-0 beat CARRYING a letter is renumbered as content, never
   filtered as a start entry.
2. **The decode+dataframe channel has a same-family letter bias** on old
   blobs (Θ↔Ω, Σ↔Δ, R↔P, …: 67 records where the decoded word disagrees
   with the mint-time embedded letters). A word-CHANGING repair therefore
   requires two witnesses (both sources complete, equal count, equal word),
   a seed→full-expansion relationship, a non-word-shaped label, or a payload
   with MORE beats than the label has tokens (structural proof the label
   never described the payload — the VOJT/Z3WC class, which repair exactly
   as this section ordered). Everything else quarantines:
   `TRUNCATED_PAYLOAD_AT_MINT` (53 — the payload physically lost its first
   beat at mint; relabeling would enshrine the loss),
   `LABEL_CONTRADICTS_PAYLOAD` (22), `PAYLOAD_SOURCES_CONFLICT` (67),
   `PAYLOAD_INCOMPLETE` (110), `PAYLOAD_MISSING` (1) — 253 of 20,210 held
   for review, manifests in `scripts/migrations/backups/`.
3. **`scripts/create-shortcodes-batch.js` is a mint-path bypass** — it
   writes shortcode records directly with `sequence: publicDoc.word`.
   Post-corpus-repair that word is canonical so its labels are correct
   going forward, but it does not stamp the payload fields; periodic
   label-repair runs heal its mints. Folding it onto the strict mint path
   is an open follow-up.

**PAYLOAD REBUILD + BYPASS FOLD LANDED (2026-07-26, same day, follow-up
pass).** The two payload-defect quarantine classes are now EMPTY:

- `rebuild-truncated-shortcode-payloads.ts` restored all 53
  `TRUNCATED_PAYLOAD_AT_MINT` payloads (15→16 beats) plus the one
  `PAYLOAD_MISSING` zombie (8N3I, ∅→16 via its hash-claim twin 2AI7 —
  provably never printed: deck renders resolve codes by content hash and the
  claim belongs to the twin; scanCount 0). Sources: 53 via catalog probe —
  deck mints carry only a catalog-style sequenceId, no deckId/ownerId, so the
  script lists catalog refs (`listDocuments`, no reads) and `getAll`-probes
  `catalogs/{id}/sequences/{sequenceId}` across all 114 catalogs. Length/
  reversal deck variants seed the SAME doc id (8-beat vs 16-beat copies), so
  every copy is gated on reproducing the stored full-word label BEFORE
  disambiguation; survivors differing in content hash would fall back to the
  record's `encoderHash`, then quarantine (`AMBIGUOUS_SOURCES`) — in
  practice the label gate resolved all 53 uniquely. Mint-time `encoderHash`
  values were computed from the truncated content and matched nothing; they
  were deliberately left untouched (claim-topology changes are phase-4
  policy, not payload repair). Every rebuild re-encoded a fresh blob and
  proved the round-trip lossless (decode → dataframe derivation → same word,
  same count) before replacing `encoded`; labels/stamps were then applied by
  rerunning the standard label repair. Post-rebuild convergence: 20,024
  LABELS_CURRENT, quarantine 253→199 (22 contradicts / 110 incomplete / 67
  conflicts — label-doubt only, all payloads playable). Shared derivation now
  lives in `scripts/migrations/lib/shortcode-derivation.ts` (extracted from
  the backfill so repairs can never fork from it).
- `create-shortcodes-batch.js` now mints STRICT: it loads the shared
  derivation through tsx's programmatic `tsImport` (the script and its
  importers show-sequence.mjs / generate-qr.mjs run under plain node),
  derives the label from the steps it embeds, refuses letterless or
  payload-less mints (the 8N3I zombie class), and stamps
  `payloadWord`/`payloadStepCount`/`payloadSchemaVersion: 2` +
  `sourceSequenceId`. `publicDoc.word` is demoted to a logged cross-check.
  Verified against a fake-Firestore harness: schema-2 record shape, both
  refusal paths, and import compatibility for show-sequence.mjs.

**CLOSEOUT PASS LANDED (2026-07-27): duplicate resolved, quarantine 199→78,
R2 refreshed.** The three items left open above are done:

- **Duplicate pick.** Survivor: `seq_1766471163932_0hh8pf3sg` (modern id,
  word already the canonical expansion, correct gridMode). Loser: the 2024
  legacy projection `QΛ` (seed-form word, stale box gridMode, 9 drifted keys,
  zero engagement fields, zero shortcodes referencing either id). New script
  `scripts/migrations/resolve-duplicate-public-projection.ts` proves the pair
  is a TRUE duplicate before writing (both owner sources must normalize to
  the SAME claim id — verified `2_7a9afafe…`), refuses cross-owner pairs,
  backs up all four docs, deletes the loser projection, and flips the
  loser's owner source to `visibility: "private"` so no future sync can
  resurrect the duplicate (the content stays in the owner's library).
  Survivor then reprojected via `--sequence` reconcile. Post-resolution
  corpus convergence: **466/466 IN_SYNC, zero conflicts** — the phase-4
  duplicate gate is fully clear.
- **Quarantine resolution.** `rebuild-truncated-shortcode-payloads.ts` now
  covers all five defect classes with per-class evidence gates:
  INCOMPLETE requires equal beat count + letter agreement at every derivable
  position (new shared `contentLetters` positional API in the derivation
  lib); CONFLICT requires the live source to side with one of the two
  payload witnesses (own embedded accepted when the label corroborates it —
  two mint-time witnesses against the biased legacy blob channel);
  CONTRADICTS requires the source to side with the label (payload restored)
  or the payload (rebuild makes it corroborated; the backfill's reviewed
  policy relabels). Every accepted rebuild passes a CONVERGENCE SIMULATION —
  the post-write doc re-derived through the shared derivation must yield a
  complete, un-conflicted word — so a half-repair can never just move a
  record between quarantine classes. Blob verification gained two tiers
  below strict word round-trip: "motions" (equal count, zero letter clashes
  with the source at derivable positions — the wire format can drop letters
  the dataframes cannot re-derive) and blob-DROP (19 records whose defective
  blob could not be re-encoded at all: embed written, blob deleted, old blob
  retained in the manifest — Firestore serves the corrected payload and the
  skinny R2 fallback omits the code instead of playing the WRONG sequence
  offline). Embeds now stamp the VERIFIED word, not the source doc's mutable
  `word` field (AK0E's owner doc carried a stale word next to correct
  letters; 5 records re-aligned). Result: **121/199 repaired** (96 REBUILT +
  19 blob-dropped + 6 blob-kept), 78 SOURCE_NOT_FOUND (65 incomplete + 13
  contradicts) — every witness deleted, irreducible with current evidence.
  Final convergence: **20,155 LABELS_CURRENT / 78 quarantined / zero
  conflicts / zero repairable**.

  *Why the 78 are permanently underivable from payload (root-caused
  2026-07-27):* their blobs predate prefloat fields. The legacy encoder wrote
  a float's own rotation — literally "noRotation" — into the wire slot, and
  the legacy decoder FABRICATES `prefloatMotionType` from it
  (`legacy-sequence-codec.ts` decode, `deriveMotionType(start, end,
  "noRotation")`), so the blob's float "prefloat data" is manufactured, not
  stored. A handpath-based rotation recovery was attempted and produced
  confident same-family wrong letters — proven against embedded mint-time
  witnesses (tgllYT/YOZG/kzkEp0: fabricated types flip pro↔anti arbitrarily)
  — then reverted with a guard comment in the derivation lib. Float letters
  never entered the legacy wire; only stored sources carry them, which is why
  source-corroborated rebuild was the correct and only repair. Diagnostics:
  `scripts/diagnostics/profile-underivable-beats.ts` (387 of the quarantine's
  underivable beats are legacy floats; ~17 are skewed/odd signatures),
  `scripts/diagnostics/probe-float-beat.ts` (embedded-vs-blob field
  comparison). Latent app-side siblings of the same gap, flagged not fixed:
  the legacy decoder's fabricated prefloat type, and
  `motion-query-handler.ts:359`'s `prefloatRotationDirection ||
  rotationDirection` fallback. The derivation lib now also loads
  `SkewedPictographDataframe.csv` (correct coverage; inert on the current
  corpus — zero classification changes).
- **R2 refresh + verification.** New ops mirror
  `scripts/publish-r2-shortcode-snapshot.ts` (same skinny contract, envelope,
  gzip -9, key, and headers as the `snapshotShortCodes` function; only
  `_meta.source` differs) built and published on demand — the daily 03:00 UTC
  run predated every repair. Verified from the public URL: declared = actual
  = 20,210; canary blobs `8N3I`/`2DQU`/`0017`/`VOJT`/`AK0E` byte-identical to
  Firestore; dropped-blob record `20GW` correctly absent. The next scheduled
  function run overwrites it with identical content.

**PHASE 4 STRICT RULES LANDED + DEPLOYED (2026-07-27).** The deferred
getAfter linkage is LIVE: firebase-tools 15.24.0 (pinned as an exact
devDependency; needs JDK 21 — portable Temurin at
`C:\Users\Austen\jdks\jdk-21.0.11+10`) fixed the emulator defect that made
every getAfter call fail, proven by the new
`getafter-probe.rules.test.ts` (inline-rules capability probe). What
shipped, and the deltas from the section 9 design:

- `publicSequences` create/update: schema 2 REQUIRED (legacy allowance
  removed), full field-shape proof, `publicOwnerParityAfter` (owner doc
  exists after the transaction, `visibility == 'public'`, stamps + core
  fields equal), and `publicClaimAfter` (the hash pair's claim exists after
  the transaction naming this sequence and caller). Delete requires
  `publicClaimReleasedAfterDelete` (own claim gone or provably another
  sequence's).
- `publicSequenceHashes` create: getAfter linkage — the named public doc
  must exist after the transaction with THIS hash pair and owner. Delete
  requires a proven release: the named public doc is gone or carries a
  different hash pair. Update stays `false`.
- **Owner-document scoping (deliberate deviation from section 9's full
  design):** owner saves are OFFLINE-FIRST — content fields (word, steps,
  contentHash, visibility) must stay writable without a paired public
  transaction, so the rules gate the projection STAMP keys only
  (`publicProjectionRevision/SchemaVersion/Digest`, via
  `diff().affectedKeys()`): setting them demands full mirror parity after
  the transaction; removing them demands the mirror be gone. Only the
  persister writes those keys (verified: no other src writer). A stamped
  owner doc can no longer be deleted while its mirror survives. Content
  drift between owner and mirror remains the retry layer's and the audit's
  domain — by design, not omission.
- `shortcodes` create: strict mint — `payloadSchemaVersion == 2`, non-empty
  `payloadWord`, positive `payloadStepCount`, and a hash-carrying mint must
  write its `shortcodeHashes` claim in the same transaction.
  `shortcodeHashes` create requires the code doc after the transaction to
  carry this exact hash (the `healHashIndex` self-heal passes only for
  verifiable code docs; unverifiable heals deny into its try/catch).
- Client-version UX (spec phase 4 requirement): `library-sync-retry.ts` now
  classifies a Firestore `permission-denied` on publish as PERMANENT
  (`CLIENT_VERSION_REJECTED`) with a reload message — an old cached bundle
  stops retrying and tells the user; local saves stay safe.
- Tests: the phase-2 "PHASE 4 DEFERRED" pin is flipped
  (`public-sequence-parity.rules.test.ts`, rewritten — 25 tests covering the
  publish/unpublish/thumbnail/hash-change/admin-unpublish transaction shapes
  and denying every unpaired fragment and forgery; core suite updated for
  the two strict-world contracts). 79 rules tests green. Deployed to
  production 2026-07-27.

**FABRICATED-PREFLOAT GUARDS LANDED (2026-07-27, same pass).**
`legacy-sequence-codec.ts` decode no longer manufactures a prefloat pair
from a NO_ROTATION wire slot — pre-prefloat-era floats decode with the
fields ABSENT (guard tests in `sequence-encoder.legacy-qr.test.ts`; the
real-rotation slot still round-trips). `motion-query-handler.ts` treats a
persisted fabricated pair (prefloat type + literal "noRotation" rotation) as
absent instead of matching rows against it. The shared derivation lib's
float handling is CHANNEL-AWARE (`floatAlternatives` option on
`letterForBeat`/`contentLetters`): EMBEDDED (mint-time) steps may resolve a
prefloat-less float via the app's canonical pro/anti-alternatives lookup —
an app era saved floats bare, and their labels were DEFINED by that lookup
at creation (proven on qCE8jd) — while ENCODED (wire-decoded) steps never
guess, because the legacy wire physically dropped the information.
`deriveFromSteps` passes the flag for `source === "embedded"` only. A
strict-everywhere first cut flipped 7 LABELS_CURRENT records to
PAYLOAD_INCOMPLETE; the channel-aware version restores full classification
stability (dry-run 2026-07-27T06-44: zero deltas vs the T02-23 reference
across all 20,233 codes; sole addition the new mint M85R). Visual note:
scanned legacy floats now render with absent prefloat instead of arbitrary
fabricated values.

### Mint path

Change the order in `ShortCodeManager.allocateCode`:

1. Produce the self-contained encoded payload.
2. Decode or use the exact steps that will be written.
3. Run strict word derivation against those payload steps.
4. Reject incomplete derivation.
5. Calculate `encoderHash`.
6. Write the shortcode and `shortcodeHashes` claim in the existing transaction.

Add first-class fields:

```ts
payloadWord: string
payloadStepCount: number
payloadSchemaVersion: number
sourceSequenceId?: string
sourceProjectionRevision?: number
```

Keep `sequence` and `sequenceName` as compatibility aliases during the reader
migration. New code writes both aliases from `payloadWord`. Readers prefer
`payloadWord`, then the legacy fields, and may re-derive from payload when the
record is old.

Do not use `sequence.word || deriveWordFromBeats(...)`. The payload is the
authority even when `sequence.word` is non-empty.

### Repair path

Extend `scripts/migrations/backfill-shortcode-words.ts`; do not add a parallel
shortcode migration.

The script must:

- initialize Admin Firestore for both dry-run and apply
- stop using the client query path whose
  `db.collection(...).select is not a function` failure currently breaks the
  default dry run
- decode `encoded`, falling back to `sequenceData.steps`
- derive `{ word, complete, missingStepIndexes, stepCount }` through the shared
  strict API
- compare the payload-derived word to `payloadWord`, `sequenceName`, and
  `sequence`
- classify historical payload versions separately from stale mutable labels
- update labels only when derivation is complete
- quarantine or report incomplete payloads without inventing a word
- preserve scan counts, encoded payloads, ownership, print/deck attribution,
  and timestamps

`VOJT` and `Z3WC` receive their own payload-derived labels. They do not receive
the current 12-beat public word. The four automatic-name records are updated
only if their own payload becomes completely derivable after the canonical
decoder runs.

## Corpus repair migration

Add
`scripts/migrations/reconcile-sequence-public-projections.ts`.

A new script is justified here because `rehash-content-v2.ts` repairs one hash
basis and `audit-sequence-cruft.ts` is read-only. This migration must coordinate
owner, public, and claim documents transactionally. It must reuse the normalizer,
projection builder, Admin initialization, and existing migration CLI patterns.

### Command behavior

- dry-run by default
- require `TKA_ADMIN=1` and `--apply` for writes
- support `--limit`, `--after`, and one-sequence targeting
- write a timestamped JSON manifest with every classification and proposed
  field change
- use deterministic ordering by owner id and sequence id
- record source update time or `_version` during scan
- skip and report any record that changed before apply
- be idempotent; a second apply produces zero writes
- never delete a duplicate public sequence automatically

### Read and classification phase

For every public document:

1. Validate `sourceRef` shape.
2. Load the owner source.
3. Confirm owner id and public visibility.
4. Hydrate and normalize the owner source.
5. Build the expected public projection.
6. Compare all source-owned public fields.
7. Validate projection stamps and hash claim.
8. Classify the result.

Classifications:

| Class | Action |
| --- | --- |
| `IN_SYNC` | No write. |
| `SAFE_REPROJECT` | Transactionally normalize source, write public projection, and create or repair its claim. |
| `EXPECTED_LOOP_REPRESENTATION` | Canonicalize to the expanded exact word only when all beats are complete; do not count the old prefix form as motion corruption. |
| `ORPHAN_PUBLIC` | Report for review; do not guess an owner. |
| `PRIVATE_SOURCE_WITH_PUBLIC_MIRROR` | Remove only after update-time recheck and manifest review. |
| `DUPLICATE_HASH_CONFLICT` | Report every competing id; do not choose a winner automatically. |
| `INCOMPLETE_CANONICAL_DATA` | Quarantine for manual repair; do not persist a partial word. |
| `SOURCE_CHANGED_DURING_RUN` | Skip and retry in a later run. |

### Apply phase

Each safe record uses one Admin transaction to:

- re-read the source, public document, and relevant claims
- verify the scan precondition
- write normalized source fields
- preserve source fields outside normalization
- preserve public engagement and original `publishedAt`
- write the complete projection
- create the new claim
- delete an obsolete owned claim when required

Use parallel reads and bounded concurrency for the scan. Use per-record
transactions for parity and claims. Firestore's server `BulkWriter` is suitable
only for unrelated cleanup writes that do not participate in the invariant.
Do not place the whole corpus in one batch.

### Known live repair targets

The first dry run must explicitly account for:

- seven incomplete public projections
- three zero public sequence lengths
- ten blank source words with automatic names
- one source word that contradicts source steps
- 37 public/source content-hash drifts
- missing hash and projection-schema fields
- public projections missing Browse-consumed fields that exist on their source
- duplicate content-hash groups
- stale or missing `gridMode` only where canonical derivation is conclusive

Invalid start-position letters and the sentinel timestamp require a separate
classification. Repair them only if the canonical sequence data proves the
correct value. Otherwise report them as manual.

After apply, a fresh dry run must report zero actionable parity drift.

## Continuous audit

Extend `scripts/diagnostics/audit-sequence-cruft.ts` or factor its comparison
engine into a shared script module used by both the diagnostic and migration.
Do not build a second scanner with different definitions.

The audit must check:

- owner/public existence and visibility parity
- source path and owner parity
- projection schema, revision, and digest parity
- strict word completeness and exact-word parity
- canonical sequence length
- composition self-containment
- content hash and hash version
- hash-claim ownership and uniqueness
- public field ownership violations, including reset counters or
  `publishedAt`
- required Browse/search fields such as `intendedWord`, `reversalPattern`, and
  `componentDomains`
- shortcode payload completeness and payload-label parity
- public artifact index drift as a separate, non-blocking category

Output:

- human-readable summary
- machine-readable JSON
- non-zero exit only for actionable invariant violations
- separate counts for expected LOOP representation and snapshot lag

Run it after every migration and as a scheduled read-only Admin job. Alert on
new actionable drift. Do not use a Firestore trigger as the primary projector.

Firestore event triggers are delivered at least once and do not guarantee
ordering. An idempotent trigger can be a repair backstop, but it cannot provide
the same commit-level guarantee as the client transaction.

## Test strategy

The silent bugs here are plausible persisted data that looks valid until a
specific reader combines fields. Tests must target those boundaries.

### Unit tests

Add or extend tests for:

- 12 beats with one missing letter return `complete: false`, not an 11-token
  success
- the historical Fuse sequence derives `IIECCKIIECCK`, never `GI`
- `stepPairings` are used when steps are absent
- incomplete steps do not fall back to complete-looking `stepPairings`
- `name` and automatic titles never become `word`
- a custom display name survives normalization as display metadata
- a composition-only source hydrates to the correct exact word, length,
  composition, and V2 content hash
- LOOP seed input persists the complete expanded word while display
  simplification remains unchanged
- public projection digest is deterministic
- projection refresh preserves engagement counters and `publishedAt`
- projection includes `gridMode`, start position, and all compositional fields
- intended-word search, reversal-pattern filtering, and component-domain
  display survive a public round trip
- creator intent and start position reach hydrated public viewer data
- legacy public documents may use the temporary source fallback, while an
  invalid schema-2 document is reported and never hidden by fallback
- shortcode label is derived from the encoded payload
- editing a linked source does not relabel an existing shortcode
- incomplete shortcode payloads cannot mint

Use:

- `src/lib/features/fuse/services/__tests__/fused-word-derivation.test.ts`
- the existing canonical-JSON tests
- existing content-hash V2 fixtures
- existing shortcode transaction tests

### Repository transaction tests

Add focused `PublicSequencePersister` transaction tests and replace the current
owner/profile-only repository assertion with tests proving:

- public create writes owner, profile count, public projection, and claim in one
  transaction
- any transaction failure writes none of them
- two publishers racing for the same hash produce one claim and one typed
  duplicate
- re-publishing the same sequence repairs its projection without a duplicate
  error
- public metadata edits refresh the mirror
- notes-only edits do not increment projection revision
- thumbnail completion patches owner and public together
- unpublish removes mirror and claim with the visibility change
- delete removes owner, mirror, and claim with the count decrement
- batch visibility, tag, and delete operations use the same per-sequence
  invariant and report mixed results by id
- soft delete removes projection and claim; restore either republishes
  atomically or restores private with the typed conflict result
- conflict resolution cannot resave a public owner without its projection
- retrying a committed operation is idempotent
- transaction callback retries do not leak state or duplicate cache effects

### Firestore rules emulator tests

Extend
`tests/integration/firestore-rules/firestore.rules.test.ts`, using the existing
`npm run test:rules` harness.

Prove the rules:

- reject a public owner write without its mirror
- reject a mirror write without its owner
- reject mismatched owner id or `sourceRef`
- reject revision, schema, digest, word, hash, length, or composition mismatch
- reject a missing or hijacked hash claim
- reject claim updates
- accept one valid publish transaction
- accept a notes-only owner update without a mirror write
- accept valid thumbnail, unpublish, and delete transactions
- stay within Firestore document-access limits for every accepted operation

### Migration fixture tests

Build a small fixture corpus containing every classification:

- missing public composition
- zero public length
- missing source word
- wrong source word
- hash drift in each direction
- LOOP seed/expanded equivalence
- orphan and private-source mirror
- duplicate hash conflict
- source changed after scan
- complete historical shortcode payload
- stale shortcode label
- incomplete shortcode payload

Prove:

- dry-run performs no writes
- apply repairs only safe records
- counters and publication time survive
- conflicts and incomplete records remain untouched and reported
- a second apply has zero changes
- post-apply audit has zero actionable drift for repaired fixtures

## Rollout

### Phase 1: pure functions and schemas

Land strict derivation, normalization, canonical public projection, digest,
wire schema, and unit tests. Keep current runtime writes during this phase.
Readers must tolerate both old and new public documents.

### Phase 2: dual-compatible writer

Land the transaction writer, hash claims, typed retry outcomes, and emulator
tests. Deploy rules that allow legacy documents temporarily while enforcing the
new transaction shape for documents carrying
`publicProjectionSchemaVersion: 2`.

New clients write schema 2. Old cached clients can still write legacy shape
during the migration window.

**LANDED (2026-07-26).** What shipped, and the deltas from the section 6/8
design:

- `public-sequence-persister.ts` — `publishPublicSequence` (one transaction:
  public doc + claim + stale-claim release + owner projection stamps, with the
  duplicate check inside), `unpublishPublicSequence` (doc + owned claim +
  owner stamp clearing; owner id read from the stored doc so recycle-bin and
  batch callers keep their signatures), `updatePublicThumbnails` (narrow
  patch; restamps digest/revision on schema-2 docs via
  `computeStoredProjectionDigest` and self-heals a missing claim).
  `PublicIndexSyncer` now delegates all three; context preparation,
  moderation, artifacts, and cache stay outside the transaction (section 10).
- `PublicDuplicateError` (typed, `code: "PUBLIC_DUPLICATE"`); the retry layer
  (`library-sync-retry.ts`) classifies it, `IncompleteWordError`,
  `SequenceNormalizationError`, and moderation failures as PERMANENT — the
  record gains `pendingSyncMetadata.blockedReason`, is skipped by future
  passes, and the user is told once. An explicit re-save clears the block
  (`library-save-service.ts:209` writes a fresh metadata object).
- `saveSequenceWithMetadata` no longer writes `word: sequence.word || name`;
  strict derivation stamps the word when complete, otherwise the prior stored
  word is preserved (never a title) and the public boundary refuses partials.
- Rules: `publicSequenceHashes` block (immutable claims, owner-released;
  Admin repair uses the Admin SDK which bypasses rules) and dual-compatible
  `publicSequences` enforcement — schema-2 writes must prove sourceRef, the
  identity pair, and the projection stamps; legacy-shape writes stay allowed
  until phase 4. All field access uses `.get()` defaults so a missing field
  denies instead of erroring. **The `getAfter()` claim-linkage proof is
  deferred to phase 4**: firebase-tools 14.23.0's emulator fails EVERY
  getAfter call ("Service call error", the #2983/#2067 defect class —
  verified by bisect with constant, variable, and computed paths), so the
  rule was unverifiable, and an unverifiable rule gating every publish must
  not ship. The client persister writes the claim in the same transaction;
  rules-level linkage is malicious-client hardening and needs an emulator
  fix or canary proof first. Deployed 2026-07-26. Emulator harness notes:
  rules test files must run in SEPARATE `emulators:exec` invocations
  (`test:rules:core` / `test:rules:parity`) — co-running corrupts the shared
  emulator's write stream ("RESOURCE_EXHAUSTED: message larger than max")
  and later files' writes silently fail to land; batch `assertSucceeds` is
  not proof of persistence, always read back.
- **Security fix found by the new rules tests:** the original
  `publicSequences` update rule checked only the INCOMING `ownerId`, so any
  full user could hijack any public document by overwriting it with their own
  uid. Update now also requires owning the existing document.
- Not in this phase (still open for phase 2.5/3): rerouting
  `LibraryBatchOperations` / `LibraryRecycleBin` / conflict-resolution /
  `LoopLabelsFirebaseRepository.deleteSequenceFromDatabase` onto the
  persister (section 7), the `LibrarySaveService` feedback-boundary rework,
  profile-count mutation, and deleting the dead feature-layer batch/recycle
  copies.

**Section 7 rerouting LANDED (2026-07-26, phase 2.5).** Deltas from the
section 7 design:

- Persister gained `deleteSequenceCompletely` (owner + mirror + owned claims
  in one transaction; mirror deleted when it EXISTS, not when owner
  visibility says so, so pre-repair drift gets cleaned) and
  `softDeleteSequenceEverywhere` (owner `isDeleted` mark + stamp clearing +
  mirror/claim removal atomically). Both — and `unpublishPublicSequence`,
  refactored onto the same helper — release every claim proven owned via
  BOTH stored hash pairs (public doc and owner doc can disagree after a
  stale mirror; both owned claims must go).
- `LibraryBatchOperations`: delete/visibility are per-sequence atomic with
  bounded concurrency (4) and per-id `BatchSequenceResult`s; a failed
  neighbor no longer hides committed work. Visibility publish failures
  COMPENSATE by reverting that owner's visibility. Tag adds keep the
  offline owner batch but reproject every public sequence through the
  publish transaction (resolved tag names live in the projection).
  **Deviation:** the profile `sequenceCount` decrement is ONE aggregate
  write after the per-sequence transactions, not per-sequence — the counter
  is a denormalized display value, not an invariant participant, and
  folding it into N concurrent transactions serializes them all on
  `users/{uid}` (same class as the section-10 "unrelated cleanup writes"
  carve-out).
- `LibraryRecycleBin`: soft delete is the single transaction above; restore
  reruns the full publish pipeline and returns typed
  `RESTORED` / `RESTORED_PRIVATE_PUBLIC_CONFLICT` (owner flipped private on
  a duplicate claim) / `RESTORED_PUBLIC_SYNC_PENDING`; purge and empty-bin
  run `deleteSequenceCompletely` per record (defensive leftover mirror +
  claims included).
- `resaveSequenceForConflict` sends a public winning copy through
  `syncToPublicIndex` after the owner re-save.
- Labeler `deleteSequenceFromDatabase` routes through
  `unpublishPublicSequence`. To let the admin-run labeler unpublish records
  it does not own, `publicSequences` and `publicSequenceHashes` `delete`
  rules gained `|| isAdmin()` — owner check FIRST so a profile-less user's
  `isAdmin()` get() error absorbs to deny (emulator-tested both ways).
  Deployed 2026-07-26.
- Dead feature-layer `library-batch-operations.ts` / `library-recycle-bin.ts`
  copies deleted after a zero-import sweep.
- Still open for a later slice: the `LibrarySaveService` single feedback
  boundary and reader migration off bare casts.

### Phase 3: dry-run and repair

**CORE REPAIR LANDED (2026-07-26).** Steps 1–4 and 7 executed:

- `scripts/migrations/snapshot-public-corpus.ts` (new) dumped a recoverable
  snapshot first: 467 public docs, 467 owner docs (every public doc has a
  live owner — zero orphans), 0 claims.
  `backups/pre-reconcile-snapshot-2026-07-26T16-23-52-741Z.json` (gitignored,
  local).
- `scripts/migrations/reconcile-sequence-public-projections.ts` (new) dry-ran
  the full corpus: 137 SAFE_REPROJECT, 328 EXPECTED_LOOP_REPRESENTATION
  (stored seed word → full expansion, all repairable), 2
  DUPLICATE_HASH_CONFLICT, and — against the audit's expectations — 0
  ORPHAN_PUBLIC / 0 PRIVATE_SOURCE_WITH_PUBLIC_MIRROR / 0
  INCOMPLETE_CANONICAL_DATA (every source normalizes; the audit's
  field-level classes all collapse into reprojection).
- Apply wrote 465/465 repairs, 0 failures, one Admin transaction per record
  (projection + claim mint + owner parity stamps). The post-apply dry run
  converged: **465 IN_SYNC + 2 DUPLICATE_HASH_CONFLICT, zero proposed
  writes** (manifests in `backups/reconcile-projections-*.json`).
- **The 2 duplicates await Austen's pick before phase 4:** `QΛ` and
  `seq_1766471163932_0hh8pf3sg` — identical content hash
  (`2_7a9afafe…`), both owned by the primary account; the migration never
  chooses a survivor.
- Implementation notes: legacy docs get `publishedAt` reconstructed from the
  owner's `birthday`/`createdAt` (section 4's suspect-corpus-wide rule);
  schema-2 docs keep their stored value. The manifest's `changedKeys` diff
  reuses `PROJECTION_DIGEST_EXCLUDED_KEYS` — diffing
  `blueSoloProp`/`redSoloProp`/`stepPairings` would flag every record forever
  (UUIDs regenerate per normalization pass) and IN_SYNC would be
  unreachable.
- Still open in this phase: the shortcode mint-path fields + label repair
  (steps 5–6), static snapshot regeneration + R2 verification (steps 8–9).

1. Export or otherwise retain a recoverable production snapshot.
2. Run the sequence/public migration in dry-run mode.
3. Review the JSON manifest, especially duplicate and incomplete classes.
4. Apply only `SAFE_REPROJECT` records.
5. Run the shortcode payload-label dry run.
6. Apply complete shortcode label repairs.
7. Run both dry runs again and retain the zero-actionable reports.
8. Regenerate the committed static snapshots with
   `scripts/export-static-snapshot.cjs`.
9. Run or wait for the official R2 export and verify declared count, actual
   count, export time, and repaired canary records against Firestore.

Resolve every `DUPLICATE_HASH_CONFLICT` through explicit content review before
phase 4. The migration does not choose which published record survives, but the
strict claim rules cannot be enabled while two public documents still require
the same claim.

### Phase 4: tighten rules

After the migrated corpus and new writer have remained clean through the audit
window:

- require projection schema 2 for public writes
- require owner/public/claim transaction parity
- remove the legacy public write allowance
- leave legacy reads tolerant

An old cached client will then fail a public cloud sync instead of creating
drift. The UI must identify the client-version failure and require a reload.
Private offline saves remain available.

### Phase 5: scheduled audit

Enable the read-only parity audit and alerting. Repair remains an explicit Admin
operation with a manifest; the scheduled job does not mutate production.

**PHASE 5 LANDED (2026-07-27).**
`scripts/diagnostics/audit-sequence-public-parity.ts` wraps BOTH existing
engines (reconcile + shortcode backfill, always dry-run — never a second
scanner) and compares against
`scripts/diagnostics/parity-audit-baseline.json`, the human-acknowledged
quarantine set (78 codes: 65 PAYLOAD_INCOMPLETE + 13
LABEL_CONTRADICTS_PAYLOAD, generated from the 2026-07-27T06-44 manifest).
Actionable = any reconcile record not IN_SYNC, or any shortcode whose class
is neither LABELS_CURRENT nor its baselined class. Exit 0 clean / 2 drift /
1 audit failure; `--alert` writes `users/{uid}/notifications` docs to every
admin (the deployed `onNewNotification` function pushes them — path proven
by self-test). Scheduled via Windows Task Scheduler "TKA Parity Audit"
(daily 04:30, `scripts/diagnostics/run-parity-audit.cmd`, logs to
`scripts/migrations/backups/parity-audit.log`). First live run
2026-07-27T06-53: reconcile 466/466 IN_SYNC, shortcodes 20,156/65/13,
0 actionable, exit 0. Regenerate the baseline after intentional relabels
(e.g. the pending 13-contradiction review picks).

**AUSTEN REVIEW ROUNDS (2026-07-27, same day).** Baseline 78 → 71:

- Relabeled to the payload word after review (payload right, label was a
  ×4 claim over a shorter payload): 4AHBJl, F0S0, H0M9 —
  `scripts/migrations/relabel-reviewed-shortcode.ts` (re-derives from the
  live doc; refuses on mismatch).
- **Half-applied LOOP transform family** (the review's big find): 2026-05-02
  system mints whose repeat 2 got a PARTIALLY applied mirrored-family
  transform. B2ZM/PAI0 ("mirrored": red locations mirrored without rotation
  flips, blue copied unmirrored → W/Σ where the label says Y/Θ). ZLCD/HVJY
  ("mirrored_inverted": locations+rotations right, PRO↔ANTI inversion never
  applied → W/Σ where the label says Z/Ω). Repaired by
  `scripts/migrations/repair-half-applied-loop-mints.ts`: repeat 2
  regenerated from repeat 1 through the app's canonical executor for the
  embedded loopType; refuses unless the rebuild derives the exact label
  (label-corroborated). ZLCD/HVJY's inverted floats cannot ride either wire
  format (flat drops prefloat TYPE; the compositional encoder fails its
  round-trip and falls back) — their defective blobs were DROPPED
  (embed-only records; snapshot omits them). Each pair shares one hash
  claim, moved to the new content hash with ownership preserved.
- **Origin hypothesis (open):** the compositional decoder reconstructs
  LOOPs via the ENGINE executor set (packages/sequence-engine), which
  diverges from the app executors on these transforms — the same divergence
  likely GENERATED the corrupt mints. Verify/fix the engine executors
  before trusting compositional round-trips of mirrored-family LOOPs.
- Wide-cell warm gap fixed in the same pass: `warmSequenceCells` now keys
  duration>1 cells with the card's widthMultiplier (held-beat cards
  previously could never warm their wide cells → permanent (!) placeholders
  on scan cards).

**REVIEW COMPLETE (2026-07-27, round 3). LABEL_CONTRADICTS_PAYLOAD = 0.**
Baseline 71 → 62 (all PAYLOAD_INCOMPLETE):

- Austen ratified "payload correct" for every remaining count/letter
  dispute: RmLaBb, TSYH, LVGB, 5C3V, C17U, D4LT, WVGE relabeled to their
  payload words.
- jyC3ji/ZaJWw6 (rotated quartered LOOP, ×4): the one case where the
  PAYLOAD was wrong. Aligned cyclically the label and payload disagreed on
  ONE beat per repeat (Θ played as Ω). A chain-constrained brute force over
  the canonical matcher + orientation calculator proved the flip is blue's
  pro↔anti attribute on that beat — the same inversion defect family, baked
  into the seed. `scripts/migrations/repair-jyc3ji-rotated-loop.ts` fixes
  the seed beat (float pf:pro/ccw, the hand-alternating realization
  matching the sequence's other Θ), recomputes the seed orientation chain,
  rebuilds via StrictRotatedLOOPExecutor (QUARTERED), and gates on
  derivation == ΘYΘZ×4. The rebuilt loop also CLOSES in orientation, which
  the stored data did not. Labels stamped to the derived word (the stored
  start position's phase of the same circle; the old label read the circle
  from the Z beat). Wire cannot carry the pro-floats — blobs dropped,
  embed-only, snapshot omits.

**PICKUP AUDIT + LOCAL MINT ROUND-TRIP GATE (2026-07-27; NOT YET
DEPLOYED).** A fresh production
audit after round 3 reported **466 IN_SYNC / 20,174 LABELS_CURRENT / 62
PAYLOAD_INCOMPLETE / zero actionable**. Both rules suites also passed:
52 core tests and 26 parity tests. The parity suite now includes the local
embed-only mint plus matching hash claim. The first scheduled 04:30 audit completed
with exit 0.

The pickup audit corrected the remaining codec hypothesis. The QR
compositional codec resolves the APP executors in `compositional-utils.ts`;
it does not reconstruct through the engine executor set. Its detector does
delegate to `packages/sequence-engine`, and that detector classifies repaired
ZLCD/HVJY as strict `mirrored` instead of their stored
`mirrored_inverted`. The attempted plain-mirrored recipe mismatches and falls
back to flat. That detector defect is real, but it does not prove the origin
of the May 2 corrupt mints.

The deeper wire limit affects all four embed-only records. Flat encoding
stores prefloat rotation and re-derives prefloat type. For these motions that
changes the derived letter. A rotated recipe for jyC3ji/ZaJWw6 can still pass
its byte/hash check because both the recipe seed and comparison target use the
same lossy flat basis; decoding changes Θ to Ω once per repeat. Byte equality
was therefore not a semantic payload proof.

The local `ShortCodeManager.allocateCode` change closes that mint-time gap.
After encoding, it decodes the candidate blob, re-derives every letter through
the runtime motion lookup, and runs strict word derivation. The blob is kept
only when completeness, exact word, and beat count match the source payload. A
mismatch or verification failure stores the exact `sequenceData` embed and
omits `encoded`, matching the repair policy already used for the four records.
The embedded `word` is stamped from strict source-step derivation, never the
mutable source word.

An exact runtime-derivation dry run supplied a positive and four negative
controls. B2ZM's current mirrored recipe re-derived the exact source word and
passed.
ZLCD/HVJY fell back to flat and re-derived
`Λ-γXΔγΛ-γWΣγ` instead of `Λ-γYΘγΛ-γZΩγ`; jyC3ji/ZaJWw6
produced rotated recipes and re-derived `ΘYΩZ` ×4 instead of `ΘYΘZ` ×4.
The mint gate accepted B2ZM and rejected all four lossy payloads. Focused QR
and shortcode tests cover faithful blobs, word-changing blobs, decoder
failures, incomplete re-derivation, and exact embed fallback: **6 files /
65 tests passed**.

Offline restoration for the four existing records is now a separate,
versioned-codec project: carry explicit prefloat type and add compound recipe
tags. Engine executor changes alone cannot make the current wire lossless.

## Rollback

- Projection schema 2 fields are additive. Old readers continue to use the
  existing fields.
- If new rules block valid traffic, restore the dual-compatible rules first.
- Disable the transaction writer only after rules accept the old path.
- Hash claims may remain during rollback; they are additive indexes.
- Migration writes are recoverable from the pre-run snapshot and JSON manifest.
- Do not roll back by deleting public documents or claims in bulk.
- Shortcode payloads never change during label repair, so labels can be restored
  from the manifest without changing scan behavior.

## Rejected alternatives

### Keep the two writes and add retries

Retries reduce the duration of drift but do not remove the state. A permanent
auth, validation, or client-shutdown failure still leaves one committed side.

### Make a Firestore trigger the projector

Firestore triggers have at-least-once delivery and no ordering guarantee.
Correct idempotency can make a trigger converge eventually, but owner and
public documents are still inconsistent between commits and may be processed
out of order.

### Copy shortcode labels from the current public sequence

A shortcode is an immutable payload snapshot. Fourteen of the sixteen current
label/public differences are historical payload versions. Relabeling by
current sequence id would make their printed label disagree with their encoded
motion.

### Continue deduplication with a query

A query followed by a write has a race. A content-addressed claim document
turns uniqueness into transaction contention with one winner.

### Persist shortened LOOP words

That makes `word` depend on display policy and breaks exact beat-to-token
validation. Persist the expanded exact word and simplify only in the view.

### Repair the corpus with one large batch

It would exceed practical write and rule-access limits, overwrite records that
change during the run, and cannot safely resolve per-hash contention.

## Implementation file map

### Modify

- `src/lib/shared/foundation/services/word-deriver.ts`
- `src/lib/shared/foundation/domain/models/public-sequence-index.ts`
- `src/lib/shared/foundation/utils/canonical-json.ts` or a neighboring shared
  hash utility, to expose canonical digest support without another private
  implementation
- `src/lib/shared/library/services/library-repository.ts`
- `src/lib/shared/library/services/library-batch-operations.ts`
- `src/lib/shared/library/services/library-recycle-bin.ts`
- `src/lib/features/library/services/library-save-service.ts`
- `src/lib/features/library/services/library-sync-retry.ts`
- `src/lib/shared/browse/services/public-sequences-loader.ts`
- `src/lib/shared/library/services/collection-firestore-mapper.ts`
- `src/lib/shared/qr/services/short-code-manager.ts`
- `src/lib/shared/qr/services/types.ts`
- `scripts/migrations/backfill-shortcode-words.ts`
- `scripts/diagnostics/audit-sequence-cruft.ts`
- `firestore.rules`
- `tests/integration/firestore-rules/firestore.rules.test.ts`
- `tests/unit/library/library-repository-save-atomic.test.ts`
- affected unit and repository transaction tests
- `docs/architecture/save-paths.md`

`docs/architecture/save-paths.md` currently says the UI persists through
`SequencePersister`; the live Library save path calls `LibraryRepository`.
Update the document with the implemented transaction graph.

### Add

- `src/lib/shared/library/services/sequence-persistence-normalizer.ts`
- `src/lib/shared/library/services/public-sequence-projection.ts`
- `src/lib/shared/library/services/public-sequence-persister.ts`
- `src/lib/features/library/services/public-projection-preparer.ts`
- `src/lib/features/library/services/public-artifact-projector.ts`
- `src/lib/shared/library/services/create-lazy-public-projection-dependencies.ts`
  for preparer, artifact-projector, and post-commit Browse callbacks
- a dedicated public projection wire schema beside the canonical public model
- `scripts/migrations/reconcile-sequence-public-projections.ts`
- focused unit, repository, rules, and migration tests

### Delete after import proof

- `src/lib/features/library/domain/models/public-sequence-index.ts`
- `src/lib/features/library/services/public-index-syncer.ts`
- `src/lib/features/library/services/library-batch-operations.ts`
- `src/lib/features/library/services/library-recycle-bin.ts`
- `src/lib/shared/library/services/IPublicIndexSyncer.ts`
- `src/lib/shared/library/services/create-lazy-public-index-syncer.ts`

## Acceptance criteria

The repair is complete only when all of the following are proven:

1. A public write cannot commit an owner sequence without its matching public
   projection and hash claim.
2. A public projection cannot commit without the matching public owner source.
3. Unpublish and delete cannot leave a public projection or owned claim.
4. A composition-only sequence publishes with complete composition, correct
   length, exact word, and active-version content hash.
5. A missing beat token blocks persistence and shortcode minting.
6. `name` never becomes `word`.
7. A public metadata or thumbnail update cannot leave a stale mirror.
8. Projection refresh does not reset engagement or `publishedAt`.
9. Concurrent duplicate publication produces one claim and no duplicate public
   document.
10. Every shortcode label agrees with its own immutable payload or is
    explicitly classified as incomplete.
11. The production repair's second dry run reports zero actionable
    source/public/claim drift.
12. `npm run test:rules` passes the new transaction-shape suite.
13. Focused unit and repository transaction tests pass.
14. A runtime canary proves publish, metadata edit, thumbnail completion,
    unpublish, and delete parity by querying owner, public, and claim documents
    after each operation.
15. Batch visibility, batch tags, batch delete, conflict resolution, soft
    delete, restore, purge, and empty-bin tests prove that no bypass can write a
    public owner state without the matching projection state.
16. Static and R2 snapshot verification shows the repaired public projection
    data and expected shortcode payloads, with no unexplained count gap.

## Review corrections (Opus 5, 2026-07-25)

The seven questions raised for review, answered.

1. **Keep `publicProjectionRevision` separate from `_version`.** Agreed as
   proposed. `_version` is optimistic concurrency on the owner document;
   revision is projection freshness. Merging them makes every notes-only edit
   rewrite the Browse mirror and burn a projection write, for the price of one
   saved field.
2. **The direct-equality set is sufficient; the digest is correctly a
   drift stamp.** Rules cannot recompute SHA-256, and the threat model here is
   bugs rather than a malicious owner — an owner can already write arbitrary
   public content about their own sequence today. What matters is that the
   equality set covers the fields that actually broke: `word`, `contentHash`,
   `contentHashVersion`, canonical length, compositional fields, start position.
   It does.
3. **One bypass was missing.** `LoopLabelsFirebaseRepository.deleteSequenceFromDatabase`
   writes the collection with no owner-document change at all. Added to
   section 7 along with `attachThumbnail`. The rest of the section 7 list
   matches the live shared implementations exactly; the feature-layer copies of
   `library-batch-operations.ts` and `library-recycle-bin.ts` are confirmed to
   have zero importers.
4. **The access-call budget is not a real risk.** The core transaction writes
   at most four documents, and the mutually-referential `getAfter()` checks come
   to roughly six calls against a limit of twenty for an atomic operation. Prove
   it in the emulator as planned, but do not restructure the transaction in
   anticipation of a limit it is nowhere near.
5. **Source fallback becomes legacy-only, as proposed.** Keep `sourceRef` for
   attribution and Admin diagnostics. Note that `loadFullSequenceData` also
   backs deep-link resolution, so retire the fallback by document age, not by
   deleting the code path.
6. **Artifacts and profile fanout are correctly outside the core transaction.**
   The artifact indexes are content-addressed, written with `merge: true`,
   shared across sequences, and unbounded in count. Including them would make
   the transaction size data-dependent for no consistency gain.
7. **Confirmed as net-new work.** `library-sync-retry.ts` has no failure
   classification at all today — it retries everything once per trigger. The
   typed permanent-versus-transient split must be built, not adjusted.

### Additional corrections folded into the body

- `publishedAt` is unconditionally overwritten on every sync, not merely at
  risk. See section 4.
- `LibrarySequenceWriteData` does not exist. See section 2.
- The field-consumer ledger found three further live defects
  (`animatedSequenceUrl`, `gridMode`, and the admin `views`/`creatorName`/
  `creatorId` trio) and the two-read-path trap. See the ledger section.

## Phase 1 hardening round (Fable 5, 2026-07-25 — landed with the Phase 1 modules)

Adversarial review of the Phase 1 workflow output surfaced six defects; all are
fixed in the committed modules. Decisions that bind later phases:

1. **Blank steps are refused at the persistence boundary.**
   `normalizeSequenceForPersistence` throws `BLANK_STEPS_UNSUPPORTED` for any
   sequence containing `isBlank` steps, because the flag does not round-trip:
   `extractStepPairings` (sequence-decomposer.ts:82) does not carry it and
   `step-deriver.ts:156` rebuilds every step with `isBlank: false`, while
   `isBlank` sits in the V2 hash basis (sequence-content-hasher.ts:132) — so a
   persisted blank would change its own word and identity hash on the next
   save. No production path creates a blank step today (verified: the only
   `isBlank: true` writers are Write-module sheet CELLS, a different type).
   **Phase 2, if blanks are ever wanted:** persist the flag in `stepPairings`,
   restore it in `deriveSteps`, then delete the refusal.
2. **Legacy inline `stepNumber === 0` start entries are stripped by the
   normalizer** before anything counts, composes, or hashes. Both corpus step
   shapes (legacy raw `steps` with a letterless step 0; modern compositional
   with none) now normalize onto the content-beats-only basis: word,
   `sequenceLength`, and pairings agree, and the legacy shape gains the same
   V2 identity as its modern twin (stragglers self-heal through the
   version-aware lazy rehash, as in the V1→V2 flip). A start-entry-only
   document is `EMPTY_SEQUENCE`.
3. **One name per side.** The builder returns `PublicSequenceProjectionWrite`
   (write shape, may carry `serverTimestamp()` sentinels); the wire schema owns
   `PublicSequenceProjection` (read-side application model, real `Date`s) and
   is the single declaration of `PUBLIC_PROJECTION_SCHEMA_VERSION`, re-exported
   by the builder.
4. **Prior state is a required discriminant, not an optional.**
   `buildPublicSequenceProjection` takes
   `{ kind: "first-publication" } | { kind: "existing", fields }`. A failed
   read of the current public document has no representation — the caller must
   abort, so a read failure can never masquerade as a first publication and
   reset `publishedAt` or the engagement counters. Phase 2's transaction writer
   MUST honor this: read inside the transaction, abort on failure.
5. **`animationFormat` is on the wire schema** (string, tolerant of future
   formats) and flows through `toPublicSequenceProjection`.
6. **Ghost-field consumers fixed** (production changes, same commit):
   `landing-preview/services/sequence-matcher.ts` now reads
   `ownerDisplayName` (was `author`/`ownerName`, both never written — always
   rendered "Unknown"); `admin/services/content-query-analyzer.ts` now orders
   by and reads `viewCount`/`ownerDisplayName`/`ownerId` (was
   `views`/`creatorName`/`creatorId`, all ghosts — the admin panel showed no
   data).

**Phase 2 ledger addition — loader assignments.** Writing the missing fields
repairs only `componentDomains`, which `mapPublicIndexToSequenceData` already
assigns. The mapper never ASSIGNS `gridMode`, `intendedWord`,
`reversalPattern`, `animatedSequenceUrl`, `animationFormat`, `startPosition`,
or `creatorIntent` — Phase 2 must add those assignments (or migrate the loader
onto `classifyPublicSequenceDocument`, the intended end state) or the Grid
Mode/reversal filters and Watch-feed split stay dead on path A even with a
repaired corpus.

### Sequencing note

The transaction, claim, and rules work prevents future drift but repairs nothing
a user can see today. The field-loss defects — dead Grid Mode and reversal
filters, intended-word search, dropped `startPosition` and `creatorIntent`,
mirrors that never refresh after an edit — are all fixable by pointing the
existing `PublicIndexSyncer` at the phase 1 projection builder, well before the
transaction work lands. Phase 1 already permits current runtime writes to stay,
so this is compatible with the rollout as written and is the recommended order.

**LANDED (2026-07-25).** `PublicIndexSyncer.syncToPublicIndex` now normalizes
first, reads the prior public document, and writes what
`buildPublicSequenceProjection` returns — the hand-built literal is gone.
Behavioral deltas, all deliberate:

- Publishes of incomplete/blank/empty sequences now REFUSE with the typed
  normalizer errors, before any Firestore access.
- Moderation checks the DERIVED word (the stored `word` could be an auto-title,
  or empty — which previously skipped moderation entirely).
- `publishedAt` and the engagement counters survive republish; a failed read of
  the prior document aborts the publish rather than posing as a first
  publication.
- Tag-read and encoder-hash failures fail the publish (section 5) — the old
  degrade-to-empty contract published "untagged"/unmatchable as fact.
- Loop label lookup runs on the derived word, so a junk stored word can no
  longer miss the curated label.
- New sync writes are schema-2 (`publicProjectionSchemaVersion: 2` + revision +
  digest); every republish self-repairs the six field-loss defects for that
  document.

Pinned by `public-index-syncer-projection.test.ts`. Still Phase 2+: the
query-based dedup race (transaction + `publicSequenceHashes` claims), the
owner-write normalizer wiring in `library-repository`, reader migration off the
bare casts (including the loader-assignment gaps above), rules, corpus repair,
audit.

## Round 4 — PAYLOAD_INCOMPLETE recovery (Fable 5, 2026-07-27)

The 62 acknowledged PAYLOAD_INCOMPLETE quarantines (blob-only mints whose
legacy wire slot destroyed the float beats' prefloat information) were
reduced to **1** by treating the mint-time label as what it provably is for
this class: a surviving projection of the destroyed letters.

**The measurement that licensed the method** (read-only,
`scripts/diagnostics/analyze-payload-incomplete-recovery.ts`): across all
237 witness records carrying BOTH a prefloat-era embed and a legacy blob,
the canonical alternatives lookup applied to the blob decode reproduced the
mint-time letter on only **287 of 579** float beats (~50%, same-family bias
— C→A, R→P, U→S — exactly the bias the review documented). So the lookup
alone proves nothing; but for every word-labeled quarantined record, the
strict derivation already spelled the stored label at every derivable beat,
gaps landing exactly on the floats. Label agreement per beat is therefore
the proof; the lookup is just the canonical mechanism.

**The repair** (`scripts/migrations/restore-quarantined-shortcode-payloads.ts`,
60 records): restore the record's embedded payload copy from its own blob
decode — the dual-source shape every source mint carries — so the embedded
channel's canonical semantics apply. Float-gap letters resolve through the
alternatives lookup wherever it matches the label witness; where it
disagrees, the label's letter is stamped as stored mint testimony
(`step.letter`). No prefloat fields are invented (era-1 mints never had
them, and wrong prefloat would alter float rendering via the graft — letters
alter nothing at runtime). Blobs, `encoderHash`, and hash claims untouched;
the R2 snapshot was unaffected by these 60. Witness gates, all mechanical:

- *full-label*: token count equals beat count AND every derivable beat
  matches its token positionally (56 records);
- *periodic-label*: derivable letters strictly p-periodic and matching the
  truncated 6-char-era label prefix (7FJ8, CKW8 — stamped L where the
  lookup guessed J; JXZB needed no stamps and was relabeled to its full
  expansion through the sanctioned payload-outgrows-label path);
- *sibling-label*: 0XHN is beat-for-beat signature-identical to the seed
  half of 5247, whose reviewed full-form label lends the letters; its
  auto-name was replaced by the derived word.

Records failing any gate are refused and reported RESIDUAL — the tool never
stamps into a contradiction, a non-float gap, or an unwitnessed position.

**P9LY** was not float damage: its mirrored repeat-2 blue shifts kept the
seed's ccw rotation (beats 7/8 `pro n→e / e→s ccw` — a rotation/handpath
combination in no dataframe), the half-applied-mirror family expressed as
unflipped rotations. `scripts/migrations/repair-p9ly-mirrored-rotations.ts`
brute-forces {pro,anti}×{cw,ccw} through the canonical matcher per beat,
found exactly ONE candidate each (`pro/cw`, the mirror-flip of repeat 1's
`pro/ccw` twins), recomputed the orientation chain (loop closes), and the
fresh blob round-trips to the label. Blob replaced, claim moved
559a54bbf942… → dd556e9ac1eb…, R2 snapshot republished.

**Residual quarantine of one:** 3CLR, an Assemble-lab export ("Assemble
Sequence") whose blue dash-chains over mixed cardinal/intercardinal
locations against a parked red exist in no pictograph dataframe. It has no
word and never will; it stays baselined.

**End state, verified 2026-07-27:** backfill dry-run
20,235 LABELS_CURRENT + 1 PAYLOAD_INCOMPLETE (3CLR); reconcile 466/466
IN_SYNC; audit exit 0, zero actionable; baseline regenerated to the single
residual. Every repair wrote a backup manifest
(`restore-quarantined-payloads-*.json`, `repair-p9ly-*.json`) with the
previous field values.

**Runtime coda — the letter graft.** The restored letters were invisible to
/q: the wire carries no letter column, so the runtime lookup re-derived
float letters through the same ~50%-wrong alternatives guess (0KUH's Z-
beats displayed as Y-), and the scan-cell warm refused those beats forever
(`requireComplete`), leaving permanent "!" cells on every affected /q page.
`prefloat-graft.ts` now also grafts the embedded step's LETTER onto a
letterless decoded step — same conservative alignment rules as the prefloat
pair (tail alignment, both channels' motion identity must match, never
overwrites an existing letter; pinned by 4 new unit tests, 10/10 passing).
After the graft, a scoped `startScanCellWarm` over the 60 restored codes
completed 60/60 with 0 failures, and /q/0KUH renders all 16 cells with the
mint-truth Z- (screenshot-verified, before/after).

## Incident 2026-09-30: 615 audit violations, none of them corrupt data

The 2026-09-30 alert reported 607 SAFE_REPROJECT sequences and 8 shortcodes.
Each class came from an intentional code change that did not bring the audit
or the stored corpus along with it.

- **607 sequences, 2026-09-16 onward.** `48050b5010` renamed the projected
  `startPosition` key to `startPlacement`, with read-side normalization and
  no migration. The digest covers key names, so every stored document's
  expected digest changed. An offline check against the backup found all 607
  start values identical under the new key. The 11 `creatorIntent` entries
  in `changedKeys` were map key order only. One record
  (`994596ea…`) had been published on 2026-09-05 by a pre-v3 client with a
  hash-v2 claim. Repair: snapshot
  `pre-reconcile-snapshot-2026-10-01T00-58-45-951Z.json`, dry run, then
  `--apply` wrote 607 with 0 failures; the follow-up dry run was 613/613
  IN_SYNC.
- **6 hand-path codes, 2026-09-05 onward.** `fdb2b8d13b` added the
  `hand-path` payload kind (schema 4). The label engine had no rule for it
  and derived TKA words from the hand paths (4 LEGACY_PAYLOAD_VERSION, 2
  PAYLOAD_INCOMPLETE). An `--apply` would have stamped a word and schema 2
  onto them. `scripts/migrations/lib/shortcode-payload-kinds.ts` now
  validates hand-path records through `hydrateSelfContainedShortCodePayload`
  (HAND_PATH_CURRENT), and any payload kind without a rule is reported as
  UNKNOWN_PAYLOAD_KIND, never derived as a word.
- **JBGM, PWZI, 2026-09-24 onward.** Minted 2026-09-22; the 2026-09-23
  landmark lettering rule (`1ab0c1c1fd`) renamed their skewed beats K→Q and
  E→N in the dataframe. Both payload channels carry identical motions. After
  Austen's review they stay as minted and are baselined.

Prevention: `public-sequence-projection.test.ts` pins the digest of a fixed
sequence. Any projection change (renamed key, new field, hash change) fails
that pin, whose comment requires a reconcile dry run and apply once the change
deploys.

## Primary references

- [Firestore transactions and batched writes](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore security-rule conditions and `getAfter()`](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firestore trigger delivery and ordering](https://firebase.google.com/docs/functions/firestore-events)
- [Firestore rules emulator setup](https://firebase.google.com/docs/rules/emulator-setup)
- [Firestore rules unit testing](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
- [Firestore best practices for large writes](https://docs.cloud.google.com/firestore/native/docs/best-practices)
- [Firestore retry and idempotency guidance](https://firebase.google.com/docs/functions/retries)

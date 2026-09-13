# Persistence round-trip audit — sequence serialization, normalization, import

**Scope:** read-only audit of `SequenceData` through local persistence,
compositional normalization, the share/QR wire format, and the canonical
domain models. No production code was changed.

**Branch:** `claude/persistence-roundtrip-audit-uy8go8`
**Base SHA:** `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`,
"Merge pull request #48 from austencloud/claude/hand-tunnel-toy")
**Commits on the branch** (a commit cannot name its own hash, so the tip is the
one commit not listed here — `git log --oneline c4be1619..HEAD` prints the full
set):

| SHA | Contents |
| --- | --- |
| `3b646f178b9b4633f2c780baeb78e00b0423b116` | the seven audit test files |
| `490b3227d822a99c3e1fd28f634ca72e71a50d61` | this report |
| `3a18a7400377daf2066e2b02e71463d5b4f67326` | SHA bookkeeping in this report |
| `9f06f0a9f41baad4b6f934bc598081dde86f4bc6` | tightened the wire corpus assertion (P4) |

**Owned paths (exclusive):**

- `tests/unit/opus-persistence-audit/**` (7 new files)
- `docs/reports/opus-batch-2026-09-12/persistence-roundtrip-audit.md` (this file)

Nothing else was created, edited, or deleted. Guest identity, auth/privacy, and
library-write ownership were left to the agent that owns them: this audit traces
through `src/lib/shared/library/**` but changes nothing there.

---

## How to read the evidence

Three kinds of statement appear below and are never mixed:

- **Measured** — produced by a test in `tests/unit/opus-persistence-audit`
  executed against this tree. The exact assertion is named.
- **Traced** — read directly out of the source at a named file and line. No
  runtime observation.
- **Inferred** — a consequence argued from the two above. Labelled as such,
  with the uncertainty stated.

Comparisons are **semantic**, never byte equality. Normalization legitimately
mints new step ids, rebuilds placement data, and re-derives `gridMode` and the
reversal flags — the same fields `sequence-content-hasher.ts` excludes from the
V2/V3 identity basis. `tests/unit/opus-persistence-audit/fixtures.ts`
(`MOTION_IDENTITY_FIELDS`, `diffMotionIdentity`) defines the compared set.

Two fixture sources, kept separate on purpose:

1. Hand-authored beats built through the real factories, used when a defect
   needs one minimal readable example.
2. `tests/fixtures/loop-audit/real-loop-fixtures.json` — 45 sequences, 432
   content beats (legacy `blue`/`red` motion keys, inline `stepNumber: 0` start
   entries, `plane: "wall"` and `handPath: null` on every motion).

**What that corpus is, precisely.** It is **generated fixture output, not
captured Firestore documents.** `scripts/generate-loop-audit-fixtures.mjs`
drives the production generation path — the canonical
`DiamondPictographDataframe.csv` dataset through `SequenceBuilder` (beam search
+ LOOP seam targeting) into `executeLOOPSpec`, the same pipeline behind MCP
`generate_sequence` and the app's circular generation — and commits the result.

So in a differential test it is authoritative for **what the canonical
generator emits**: 45 builder-validated sequences this audit did not author, so
where a round trip disagrees with it the round trip is the suspect. It is **not**
a sample of stored data. It supports no statement about how many saved
documents exist in any shape, and a field it happens to leave unset is a
property of the generator, not of user data. An earlier revision of this report
called it "a recording of real output" and drew prevalence from it; that was
wrong and the affected claims below are now marked conditional.

An earlier revision also compared a field set that omitted `handPath`, which is
in the V3 hash basis. `MOTION_IDENTITY_FIELDS` is now a **superset** of that
basis, so no hash-affecting divergence can hide behind a short list — and
correcting it changed a finding (see P4).

---

## Commands and results

All run from a clean cloud checkout of the base SHA. No laptop dependency, no
dev server, no emulator, no browser.

| Command | Result |
| --- | --- |
| `pnpm install --prefer-offline` | ok (23.5s) |
| `npx tsc --build packages/tsconfig.build.json` | exit 0 — required before vitest; `@tka/tka-types` resolves to built output |
| `npx vitest run --config tests/config/vitest.config.ts tests/unit/opus-persistence-audit` | **6 files, 39 tests, all passing** (9 of them quarantined `it.fails` repros) |
| `npx vitest run --config tests/config/vitest.config.ts .../sequence-persistence-normalizer.test.ts src/lib/shared/foundation` | 10 files, 139 passed — the normalizer suite plus every adjacent foundation suite, unaffected |
| `node scripts/tsc-gate.mjs` | 1 owned error, **not in any audited or added file** (see Limitations) |

The audit suite is green by construction: every assertion that pins *current*
behaviour passes, and every assertion describing a *contract the codebase
already states* is marked `it.fails`. See "Quarantine convention" below for why
that qualifier matters and which two repros were removed under it.

---

## Findings

### P1 — High · Identity hash is computed before the document it describes is final, forking a duplicate on the next save

**Traced.** `library-repository.saveSequence` computes the stored identity hash
at `src/lib/shared/library/services/library-repository.ts:424`
(`computeHash(sequence)`), then refreshes the compositional fields at
`:574` (`ensureComposition(libSeq)`). `ensureComposition` **derives** a
`startPosition` when the incoming sequence has none
(`src/lib/shared/foundation/services/sequence-hydrator.ts:250-254`), and
`startPosition` is part of the hash basis at every version
(`src/lib/shared/library/services/sequence-content-hasher.ts:118-131`,
`extractStartPosition`).

The read path re-derives steps through `hydrate` — `library-repository.ts:456-459`
says so in as many words ("Match the normal read path
(`mapDocToLibrarySequence` → `hydrate`) exactly"). So save #1 stores
`hash(document-without-start)` beside a document that now carries a start; the
next save, with no user edit, hashes the start-bearing document.
`decideFork` (`src/lib/shared/library/services/fork-decision.ts:50-66`) only
recomputes the stored hash on a **version** mismatch; same version plus
different hash means `fork: true`, and the fork branch
(`library-repository.ts:466-490`) mints a new document id with
`source: "forked"` and `visibility: overrides?.visibility ?? "public"`.

**Measured** (`content-hash-operation-order.test.ts`):

- A start-bearing sequence hashes identically across save → read → save.
- A start-less sequence does not: `computeHash(seq)` ≠
  `computeHash(hydrate(stored))`.
- A controlled experiment over the generated corpus: **0/45 drift when a start
  position is stored, 45/45 when it is not.** Both runs use the same fixtures
  and the test removes `startPosition` itself, so the single variable isolates
  the MECHANISM.

**Exposure is conditional, and the 45/45 is not prevalence.** The corpus run is
a synthetic removal from generated fixtures, not a survey: every fixture **as
generated** carries a start position and is therefore not exposed (pinned by
`"a start-bearing sequence is the shape the generator actually emits"`). This
audit did **not** identify a runtime producer that hands `saveSequence` a
start-less sequence, and had no corpus access to count stored documents in that
shape. `tests/unit/services/ensure-composition-start-position.test.ts` builds
the shape and calls it "the bug's shape", which shows the shape was considered
worth defending against — it is a test fixture, not a producer, and it is not
evidence of prevalence.

So: the ordering defect is **confirmed and latent**. Its blast radius depends
entirely on whether such a producer exists.

**Inferred (impact, conditional on a producer existing):** one silent duplicate
library document — defaulting to public — per affected sequence, on its first
no-op re-save. The duplicate then stabilises (it was read back with a start
position), so it would be one extra document per sequence, not unbounded
growth.

**Minimal repro:** `content-hash-operation-order.test.ts` →
`"SHOULD PASS AFTER FIX: hashing a startPosition-less sequence survives one
save/read/save cycle"`.

**Bounded remediation.** Adopt the operation order the publish path already
documents — `sequence-persistence-normalizer.ts:230-234`, step 8: "Hash the
normalized data — after every field it covers is final, so the stored hash
describes the stored document." Smallest safe change: in `saveSequence`, move
the `computeHash` call below the `ensureComposition` / `withCanonicalStepCount`
block and hash `libSeq`. Two things to check when doing it: the duplicate-detection
query at `:529-540` uses `incomingHash`, and the `decideFork` comparison at
`:445-446` uses it too — both want the post-composition value, so one move covers all
three. Existing stored hashes are unaffected (no basis change, so
`contentHashVersion` stays V3); affected documents converge on their next save.

---

### P2 — High · A legacy inline start entry is composed into a real beat on the owner path, permanently blocking publish

**Traced.** `normalizeSequenceForPersistence` strips `stepNumber === 0` as step
2 of its fixed order and spells out what happens otherwise
(`sequence-persistence-normalizer.ts:210-223`): "`extractStepPairings` and
`extractSoloProp` map `steps` 1:1, so leaving it in mints a pairing and a
solo-prop beat for a non-beat: `sequenceLength` disagrees with the word by one,
and the next pairings-only republish throws IncompleteWordError on the
letterless leading pairing — a locked document."

That strip lives only in the normalizer, and the normalizer is wired into the
**publish** path only (`src/lib/features/library/services/public-index-syncer.ts:88`).
`rg "normalizeSequenceForPersistence|trySequenceNormalization" src/` returns
that single runtime call site, the normalizer's own module and tests, and one
comment in `library-repository.ts:800`; every other caller is a migration script
under `scripts/`. The owner save path
calls `ensureComposition` directly (`library-repository.ts:574`), which has no
such strip (`sequence-hydrator.ts:234-267`).

**Measured** (`legacy-start-entry-composition.test.ts`), on a two-beat sequence
carrying the legacy start entry:

- owner path → `stepPairings.length === 3`, `leftSoloProp.steps.length === 3`,
  leading pairing `letter === null`;
- publish path → `sequenceLength === 2`, `exactWord === "AB"`;
- `computeHash(legacy)` ≠ `normalized.contentHash` — owner doc and public
  mirror carry different identities for the same sequence;
- re-normalizing the owner-composed document rejects with
  `IncompleteWordError: Word derivation incomplete: 2/3 beats resolved`.

**Inferred (reach):** the entry shape is produced by pre-compositional
documents. `hydrate`'s non-compositional branch returns stored steps untouched
(`sequence-hydrator.ts:211-231`), so a legacy document that is opened and saved
carries its step 0 into `ensureComposition`. The Browse read path *does* strip
it (`public-sequences-loader.ts:659` `normalizeStartPosition`); the library read
path does not, which is the asymmetry. I could not measure how many live
documents still carry the shape — no corpus access from this checkout.

**Minimal repro:** `legacy-start-entry-composition.test.ts` →
`"SHOULD PASS AFTER FIX: composition persists one pairing per content beat"`.

**Bounded remediation.** Move the strip into the single owner:
`ensureComposition` should filter `stepNumber === 0` from `sequence.steps`
before `extractLeftSoloProp` / `extractRightSoloProp` / `extractStepPairings`,
exactly as the normalizer does, and derive `startPosition` from the stripped
entry when one is absent (the normalizer notes the stripped entry's data is not
lost, because `ensureComposition` re-derives the start from the first content
beat). The normalizer's own step 2 then becomes a no-op rather than the only
line of defence. Alternative, larger: route `saveSequence` through
`normalizeSequenceForPersistence` — that also fixes P1, but it imposes the
strict word gate on owner saves, which today deliberately tolerate an
incomplete draft (`library-repository.ts:793-811`).

---

### P3 — High · "This hand is not really there" does not survive the persistence round trip

**Traced.** Since the both-required Step flip, an absent hand is an invisible
static placeholder (`motion-data.ts:createPlaceholderMotion`, `isVisibleMotion`).
`getSequenceMotionProfile`
(`src/lib/shared/foundation/services/sequence-motion-profile.ts:38-64`) reads
exactly that flag to decide solo vs paired, and `getSequenceMotionVisibility`
uses the answer to decide which prop the viewer renders.

The round trip does not carry the flag:

- `src/lib/shared/foundation/services/sequence-decomposer.ts:133-149` turns an
  invisible motion into a **static placeholder** solo-prop step, with both
  locations collapsed to the resolved start location;
- `src/lib/shared/foundation/services/step-deriver.ts:88-109` rebuilds every
  motion with `isVisible: true` (and `isBlank: false` at `:171`).

`StepPairingData` has no presence field, so there is nowhere for the flag to
live. The normalizer refuses `isBlank` steps for the structurally identical
reason — `BLANK_STEPS_UNSUPPORTED`, "the persistence layer cannot round-trip the
blank flag yet (stepPairings does not carry it) … Refusing loudly beats
corrupting silently" — but there is no equivalent gate for an invisible hand.

**Measured** (`solo-hand-absence-roundtrip.test.ts`), on a solo sequence built
from a real corpus sequence via `extractLeftSoloProp` → `soloPropToSequence`:

- before: `getSequenceMotionProfile(...).kind === "solo"`, every right motion
  `isVisible === false`;
- after `ensureComposition` → drop steps → `hydrate`: every right motion
  `isVisible === true`, `motionType === STATIC`, `startLocation === endLocation`;
- `getSequenceMotionProfile(...).kind === "paired"`.

**Traced (reach).** A printed solo-prop card resolves through
`hydrateSoloShortCodePayload` → `soloPropToSequence`
(`src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts:60-122`),
which builds each step with a single hand key; `createStepData` fills the other
with an invisible placeholder
(`src/lib/shared/foundation/domain/factories/create-step-data.ts:25-30`). That
sequence is saved to the library with `visibility: "public"` by
`src/lib/features/browse/collections/components/ScanCardSheet.svelte:214` and
`src/lib/shared/share-intake/services/intake-router.ts:267`, both of which reach
`ensureComposition` at `library-repository.ts:574`.

**Inferred (user-visible effect):** after the save, the viewer shows a second
prop parked at the start location for the whole sequence, and the sequence stops
identifying as solo choreography. Not runtime-observed — no browser in scope for
this audit — but it follows directly from `getSequenceMotionVisibility` being
the renderer's input.

**Minimal repro:** `solo-hand-absence-roundtrip.test.ts` →
`"SHOULD PASS AFTER FIX: a solo sequence is still solo after save + read"`.

**Bounded remediation.** Two steps, in this order:

1. *Immediately, cheap:* extend the normalizer's refusal set with a
   `HAND_ABSENCE_UNSUPPORTED` code alongside `BLANK_STEPS_UNSUPPORTED`, so a
   solo sequence is refused loudly at the publish boundary instead of being
   silently repaired into a paired one. This alone does not fix the owner save
   (P2's wiring gap again).
2. *Properly:* add presence to `StepPairingData` (e.g.
   `leftPresent?: boolean` / `rightPresent?: boolean`, absent meaning present,
   so every stored document keeps its bytes and its hash) and have `deriveSteps`
   pass `isVisible: pairing.leftPresent !== false` into `rehydrateMotion`. The
   identity hash already excludes `isVisible` deliberately
   (`sequence-content-hasher.ts:188-191`), so this adds no hash churn. Lifting
   the `isBlank` restriction is the same shaped change and could ride along.

---

### P4 — Medium · The share/QR wire format carries fewer motion fields than the identity hash reads, and its own round-trip check cannot notice

**Traced.** `encodeMotion`
(`src/lib/shared/navigation/services/sequence-encoder.ts:163-215`) emits exactly
`${startLoc}${endLoc}${rotation}${turns}`, plus one prefloat byte for a float.
No byte encodes `plane`, `skewSteps`, or `skewDir`, and `decodeMotion`
(`sequence-encoder.ts:261-360`) never restores them. Separately, `decodeMotion`
**synthesizes** `handPath` via `getHandpathDirection` for every motion, whether
or not the source had one.

Two consumers care:

- `sequence-content-hasher.ts:206` — V3, **active since 2026-09-04**, hashes
  `plane: m.plane ?? Plane.wall`. V3 exists precisely because "plane was
  previously dropped by composition, so no V1/V2 stored identity could
  distinguish physically different multi-plane choreography"
  (`sequence-content-hasher.ts:26-29`). The composition path was fixed; the wire
  format was not.
- `skewSteps`/`skewDir` are carried by `sequence-decomposer.ts:49`, hashed at
  `sequence-content-hasher.ts:204`, and authored by
  `src/lib/features/choreo-card/services/hand-path-data-builder.ts:200`.
- `handPath` is hashed at `sequence-content-hasher.ts:198`
  (`handPath: m.handPath ?? null`), so `null` and `"ccw"` are different
  identities for the same physical movement.

`verifySequenceRoundTrip` (`sequence-encoder.ts:941-968`) lists `skewSteps` and
`skewDir` among the fields it compares — but it compares `decode(x)` against
`decode(encode(decode(x)))`. Both sides have already been through the lossy
encoder, so an encode-side loss is structurally invisible to it.

**Measured** (`share-wire-motion-fields.test.ts`):

- an authored beat with `plane: "wheel"`, `skewSteps: 2`, `skewDir: "+"`
  encodes to `iiSS|nonox0:sosox0|noeac0:sowec0|easoc0:wenoc0` — the same bytes
  it would produce without any of them — and decodes with all three absent;
- `verifySequenceRoundTrip` on that encoding returns `ok: true`;
- over the generated corpus, **two** hash-basis fields diverge on 864/864
  motions: `plane` is **dropped** (`"wall"` → absent) and `handPath` is
  **synthesized** (`null` → `cw`/`ccw`/`dash`). Nothing else diverges —
  locations, orientations, motion types, rotation directions and turns all
  survive the orientation-chaining decoder, so this is field coverage rather
  than a broken derivation;
- the same fixtures through the **composition** round trip diverge on neither
  field, which localizes both to the wire format.

**Correction.** An earlier revision of this report claimed plane was the *only*
divergence. That was an artefact of a compared field set that omitted
`handPath`; the set is now a superset of the V3 hash basis and the claim is
replaced by the two-field measurement above. The `handPath` divergence is a
gain, not a loss — but it moves the identity hash in exactly the same way, so a
sequence shared by QR and re-imported takes a **different V3 identity from its
original** whenever the source's `handPath` was unset.

**Bounding the `handPath` half.** The synthesis is only observable because the
source value is `null`, and `null` on every generated motion is a property of
the generator (pinned by a dedicated assertion). How many **stored** documents
carry an unset `handPath` is not measurable from this checkout, so no prevalence
is claimed in either direction.

**Not yet biting, and why.** Every motion in the corpus is `plane: "wall"`,
which the V3 hasher's `?? Plane.wall` default absorbs, so no stored identity
breaks today. Multi-plane authoring currently exists only in
`src/routes/test/spatial-sculpture` (a prototype route), not on a shipped
composer surface — `rg` for a non-wall `plane:` assignment on a `MotionData`
finds no production writer. **Inferred:** the day multi-plane authoring reaches
a real surface, every QR and share link silently flattens it to wall and every
imported copy takes a different V3 identity from its original. Skew is authored
today by the hand-path builder, so skewed hand paths already lose their skew
over a share link; I did not trace an end-to-end user flow that both authors
skew and shares it, so I am not claiming a live user-visible break there.

**Minimal repros:** `share-wire-motion-fields.test.ts` →
`"SHOULD PASS AFTER FIX: an authored plane survives a share round trip"` and
`"… authored skew survives a share round trip"`.

**Bounded remediation.**

1. Fix the detector first, because it is what makes the gap invisible:
   `verifySequenceRoundTrip` should compare the SOURCE sequence against
   `decode(encode(source))` when a source is available, or at minimum
   `findMotionMismatch` should stop listing fields the format cannot carry (a
   field list that lies is worse than a short one).
2. Extend the motion segment with an optional suffix for the fields the hash
   reads. The format already has precedent for exactly this: `encodeBeat`
   appends `:d<duration>` only when the duration is not 1, explicitly "so old
   links and their hashes stay stable while newly timed sequences round-trip"
   (`sequence-encoder.ts:226-236`). The same shape — emit nothing for
   `plane === "wall"` and no skew — keeps every printed card's bytes and every
   historical recipe hash intact.

---

### P5 — Medium · `createSequenceData` drops `birthday`; restored local state carries strings behind `Date`-typed fields (plus one unresolved `createdAt` policy)

**Traced.** `createSequenceData`
(`src/lib/shared/foundation/domain/models/sequence-data.ts:254-379`) copies
fields one by one. Four declared `SequenceData` fields have no line:
`birthday`, `createdAt`, `syncStatus`, `pendingSyncMetadata`. The last two are
local-only sync bookkeeping the persistence layer strips anyway
(`sequence-persistence-normalizer.ts:76-81`), so dropping them is at worst
undocumented. `birthday` is not: it is declared "Original creation date of the
sequence (never changes after being set)" (`sequence-data.ts:72-73`) and
`public-index-syncer.ts:233` falls back to `new Date()` when it is absent.

The function is the ingress constructor for persisted and imported data:

- `src/lib/shared/persistence/services/dexie-persistence-service.ts:441` —
  restoring the in-progress sequence from localStorage;
- `src/lib/features/create/shared/services/deep-link-sequence-handler.ts:104` —
  inside `loadFromPendingEdit`, which parses the `PENDING_EDIT_KEY`
  **localStorage** blob. **Correction:** an earlier revision of this report
  called this "an imported share link". It is not. `loadFromDeepLink` (:64-76)
  calls `setSequence(deepLinkData.sequence)` directly, so a direct share link
  **bypasses this constructor entirely**;
- `src/lib/shared/qr/services/short-code-payload-hydrator.ts:99` — an embedded
  short-code payload;
- `src/lib/features/choreo-card/services/sequence-render-hydrator.ts:67`.

The localStorage path adds a second problem: state is written with
`JSON.stringify` (`dexie-persistence-service.ts:399`) and read with
`JSON.parse`, so every `Date` arrives as an ISO string, and
`createSequenceData` copies `dateAdded` through untouched.

**Measured** (`sequence-data-field-coverage.test.ts`):

- `createSequenceData({ birthday, createdAt, dateAdded })` returns `dateAdded`
  and has no own `birthday` / `createdAt` key at all;
- after the localStorage round trip, motion content and letters survive intact,
  but `restored.dateAdded` is a `string`, not a `Date`, behind a `Date`-typed
  field.

**`createdAt` is an UNRESOLVED POLICY QUESTION, not a defect.** An earlier
revision of this report bundled it with `birthday` and quarantined an
`it.fails` asserting it should survive. That `it.fails` has been **removed**,
because it dressed an unapproved product decision as a validated remediation.
`library-sequence.ts:132-133` defines `createdAt` as "When added to THIS user's
library (may differ from birthday)" — a membership timestamp owned by the
receiving library, not a property of the imported content. Carrying an imported
payload's value through unconditionally would assert someone else's membership
date as this user's. Three defensible contracts exist:

  (a) drop it and let `createLibrarySequence` stamp the receiving library's own
      value — today's behaviour, arguably already correct;
  (b) carry it only for a same-user restore (the localStorage path) and drop it
      for cross-user imports;
  (c) carry it always.

The owner picks. The suite now pins (a) as current behaviour so a deliberate
move is a reviewed change rather than a silent one.

**`birthday` blast radius, stated honestly.** For an *existing* library document
the loss is absorbed: `library-repository.ts:498-503` re-saves as
`{ ...existing, ...sequence }`, and because `createSequenceData` omits the key
entirely rather than setting `undefined`, the stored `birthday` survives the
spread. It bites when an imported payload becomes a **new** document —
`createLibrarySequence` stamps `birthday: options.birthday ?? now`
(`library-sequence.ts:177`), so an imported sequence's real creation date is
replaced by today's.

**The `dateAdded` string is a type-contract violation with NO demonstrated
failing consumer.** The two are separated deliberately. The declared type says
`Date` and the runtime value is a `string`, which makes every consumer's
correctness depend on remembering to coerce — that is worth fixing. But the
known consumers *do* coerce: `browse-date.ts:12` and
`browse-section-manager.ts:203` both run
`candidate instanceof Date ? candidate : new Date(candidate)`, and a measured
assertion confirms `resolveBrowseDate` returns the correct `Date` from a
restored sequence. This audit found no consumer that calls a `Date` method on
the restored value unguarded. An earlier revision said a string "sorts but does
not format"; that was asserted, not demonstrated, and is withdrawn.

**Minimal repros:** `sequence-data-field-coverage.test.ts` →
`"SHOULD PASS AFTER FIX: birthday survives the ingress constructor"` and
`"SHOULD PASS AFTER FIX (type contract, not a demonstrated failure): a restored
sequence's timestamps are Dates"`.

**Bounded remediation.** Add the two missing passthrough lines to
`createSequenceData` (mechanical, matching the `dateAdded` line immediately
above), and revive timestamps at the one boundary that serializes them —
`loadCurrentSequenceState` should map the known date fields through `new Date()`
before handing the object to `createSequenceData`, the way
`collection-firestore-mapper.ts:124-128` already does for Firestore timestamps.
A broader fix (a shared `reviveSequenceTimestamps`) is tempting but would be a
new shared capability; `never-hand-roll.md` says extend the existing owner —
`collection-firestore-mapper`'s `toDate` — rather than mint a parallel one.

---

### P6 — Low · The wire decoder's turn guard is shape-only — legal range is an open question

**Measured, and this is the whole measurement**
(`share-wire-motion-fields.test.ts`):
`decodeSequence("iiSS|nonox0|nonoc999999999999")` yields
`turns === 999999999999`. **Traced:** `decodeMotion` validates the shape with
`/^-?(?:\d+(?:\.\d*)?|\.\d+)$/` plus `Number.isFinite`
(`sequence-encoder.ts:281-303`) and applies no range check. That is a public,
attacker-supplied surface (scanned QR, pasted URL).

**What is NOT established: that any particular value is illegal.** An earlier
revision of this report asserted "turns are a bounded domain quantity" and
proposed range-checking against "the domain's legal set". Neither is supported:

- `Motion.turns` is typed `number | "fl"`
  (`packages/tka-types/src/motion.ts:30`) with no bound;
- `rg` for a turns validator across `packages/tka-types`,
  `packages/sequence-engine`, and `src/lib/shared/pictograph` finds **none** —
  only prose in `IOrientationPropagator.ts:21` ("0, 0.5, 1, 1.5, 2, etc.") and
  a comment in `OrientationCalculator.ts:321` about quarter turns.

There is therefore nothing in-repo to bind a check to, and **this audit will not
invent a turn palette**. Whether an upper bound exists at all — and whether
quarter turns, negative turns, or arbitrary fractions are legal — belongs to the
canonical domain owner (Flow Arts MCP), which was not reachable from this
checkout. No `it.fails` is written for it: quarantining a bound nobody has
defined would assert a policy as a validated fix.

**Remediation, gated:** first get the legal set from the canonical domain source
(or a decision that there is no bound). *Then* a range check next to the
existing `Number.isFinite` guard is a two-line change. Until that decision
exists this stays an **unresolved feature-specific policy question**, not an
actionable defect. Everything else malformed *is* refused with a typed error —
empty input, an unknown location pair, a non-numeric turn, a malformed duration,
all measured in the same file — so the decoder is otherwise strict.

---

## What the round trip DOES preserve (negative results)

Recorded as passing assertions in `composition-roundtrip-parity.test.ts` so a
later change cannot quietly undo them.

- **The composition round trip is semantically lossless on canonical generator
  output.** Across all 45 corpus sequences (432 beats, 864 motions),
  `ensureComposition` → drop `steps` → `hydrate` produces **zero** differences
  across a field set that is a superset of the V3 hash basis — `handPath` and
  `plane` included — and preserves every per-beat letter. Whatever else is wrong
  above, the core compositional model does not lose movement data. Scope: this
  is generator output, so it is evidence about the model, not about the stored
  corpus.
- **The orientation chain reproduces generator output.** The wire format stores
  no per-beat orientation and recomputes it from the start-position seed through
  `calculateEndOrientation`. On the corpus that derivation reproduces every
  `startOrientation` and `endOrientation` exactly.
- **Turn fidelity over the wire is intact**, including halves (`1.5`, `0.5`) and
  the float sentinel (`turns: "fl"` round-trips as `"fl"`).
- **Malformed wire input is refused, not repaired** (five cases measured).
- **`hydrate()` failures at read boundaries are guarded.** `deriveSteps` throws
  on a pairing/solo-prop length mismatch (`step-deriver.ts:124-134`), and every
  read-path caller wraps it — `public-sequences-loader.ts:549`,
  `:654`, `collection-firestore-mapper.ts:141`,
  `library-repository.ts:934`. One malformed document cannot sink a batch.
- **Legacy hand-identity migration is correct and idempotent.**
  `normalizeLegacySequence` maps `blue`/`red` onto `left`/`right` across solo
  props, path hashes, steps, motions, reversal flags, step pairings,
  `intendedProp`, and nested `creatorIntent.propConfig`, retains unknown
  application metadata, and is a no-op on already-canonical input.
- **Per-beat letters lost over the wire are recovered downstream** by
  `navigation/sequence-hydrator.hydrateSequence`, which re-derives letters and
  the word for every decoded sequence. Pinned as a deliberate, recovered loss
  rather than left to look like a defect.

---

## Quarantine convention

Every intentionally-failing repro is marked `it.fails(...)` with a name starting
`SHOULD PASS AFTER FIX:`. Vitest passes an `it.fails` block when its body
throws, so:

- the suite is **green today** — the branch adds no red tests to CI;
- the moment a defect is fixed, its `it.fails` block turns **red**, which is the
  signal to delete the `.fails` marker and keep the assertion as a regression
  test.

Every other assertion in the suite pins measured current behaviour and stays
green either way. `tests/unit/opus-persistence-audit/fixtures.ts` contains no
assertions and is not collected as a test file (the vitest `include` glob only
matches `*.{test,spec}.{js,ts}`).

**A quarantined repro is a defect test, never a fix, and never a proposal.**
There are **9** of them (down from 11 in the first revision). Two were removed
in review because they asserted contracts nobody has approved:

| Removed | Why |
| --- | --- |
| `createdAt survives the ingress constructor` | `createdAt` is the receiving library's membership timestamp; preserving an imported value is a product decision with at least three defensible answers (P5). |
| `an out-of-domain turn count is refused` | No legal turn set exists in-repo to bind to, and inventing one is not this audit's call (P6). |

Both are now pinned as **measured current behaviour plus a stated open
question**. The rule this enforces: an `it.fails` may only encode a contract the
codebase already states (a documented invariant like `birthday`'s "NEVER
changes after being set", a declared type, or a field the hash basis already
reads). Where the right answer is a policy choice, the suite records the choice
that exists and names the decision instead of pre-empting it.

---

## Regressions and limitations

- **No regressions introduced.** No production file was touched
  (`git diff --stat` against the base SHA covers only
  `tests/unit/opus-persistence-audit/**` and this report). The existing
  `sequence-persistence-normalizer.test.ts` suite still passes (32 tests).
- **`node scripts/tsc-gate.mjs` reports one owned error**,
  `src/lib/features/community/get-geocoding-service.ts(4,10): TS2305 — Module
  '"$env/static/public"' has no exported member 'PUBLIC_GOOGLE_MAPS_API_KEY'`.
  Pre-existing and environment-derived: it is a missing public env var in this
  cloud checkout, in a feature this audit never touched. **Zero** diagnostics in
  any added file.
- **No corpus access, and no fixture that substitutes for it.** Every claim
  about live data is a claim about *shape*, never about counts. The
  `real-loop-fixtures.json` set is generated output from the production
  generator, so it gives breadth over canonical generation and **zero**
  information about stored documents. I cannot say how many stored documents
  carry a legacy step-0 entry (P2), how many were saved without a start position
  (P1), how many carry an unset `handPath` (P4), or how many solo cards have
  been scanned into libraries (P3). Sizing any of those needs a read-only corpus
  query, which is outside this scope.
- **No producer identified for P1's trigger shape.** The ordering defect is
  confirmed; a runtime path that hands `saveSequence` a start-less sequence is
  not. P1's severity is conditional on one existing, and finding out is the
  first thing worth doing before the fix.
- **Corrections applied after independent review** (this revision). The first
  revision (`ef3735e4`) overstated four things, all now fixed in place: it
  described the fixture corpus as captured Firestore documents; it read P1's
  synthetic 45/45 as prevalence; it compared a field set that omitted `handPath`
  and so wrongly called `plane` the only wire divergence; and it cited
  `deep-link-sequence-handler.ts:104` as a share-link path when it is a
  localStorage pending-edit path. Two `it.fails` repros asserting unapproved
  policy were removed. The three strongest findings — the solo printed-card
  intake reach (P3), the serializer field loss (P4), and the hash-before-compose
  ordering defect (P1) — survive the review unchanged in substance.
- **No runtime or browser observation.** P3's user-visible effect (a phantom
  second prop) is inferred from `getSequenceMotionVisibility` being the
  renderer's input, not seen. Confirming it needs the in-app browser pass this
  audit's read-only scope excludes.
- **No MCP domain access**, so P6 names the gap but deliberately does not assert
  what the legal turn range is.
- **Firestore write paths were read, not exercised.** P1 and P2 trace through
  `library-repository.saveSequence`; the tests reproduce the *pure* operation
  order (`computeHash` / `ensureComposition` / `hydrate`) that path composes,
  not the Firestore transaction. The fork decision itself is separately covered
  by the repo's own `fork-decision.test.ts`.
- **Library and auth code deliberately untouched**, per the concurrent-agent
  boundary. P1, P2, and P3 all propose changes inside
  `src/lib/shared/library/**` or `src/lib/shared/foundation/**`; none was made,
  and whoever implements them should re-check against that agent's landed work
  first.
- **Not audited:** the public projection wire schema
  (`public-sequence-wire-schema.ts`, 824 lines of Zod), the legacy sequence
  codec (`legacy-sequence-codec.ts`), compositional recipe encoding
  (`compositional-encoder.ts` / `-decoder.ts`) beyond reading them, and the
  Dexie schema itself. Each is a plausible next slice; the recipe encoder in
  particular carries its own hash-verified reconstruction and deserves the same
  differential treatment.

---

## Suggested order of work

1. **P1** — smallest diff, clearest silent-corruption payoff (duplicate public
   documents), no schema change.
2. **P2** — one filter in `ensureComposition`; unblocks documents that are
   currently unpublishable.
3. **P3 step 1** (refuse loudly), then **P3 step 2** (persist presence) when a
   schema touch is acceptable.
4. **P4 step 1** (stop the detector from lying) before multi-plane authoring
   ships; **P4 step 2** with it.
5. **P5 (`birthday` + the `dateAdded` type contract)** — mechanical. The
   `createdAt` question is a **decision, not a task**: answer it before touching
   that field.
6. **P6** — **blocked on a domain decision**, not on engineering. Get the legal
   turn set (or "there is no bound") from the canonical domain source first; the
   code change afterwards is two lines.

**No item above is authorized by this audit.** The branch contains defect tests
and analysis only; every remediation is a proposal for the owner of the affected
module, and P1–P3 all land in `src/lib/shared/library/**` or
`src/lib/shared/foundation/**`, which a concurrent agent was working in.

---
status: active
value: 3
effort: M
remaining: "Recheck stored stepPairings, hydration, and the three reversal implementations against current code; then decide the canonical derivation and tests."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Reversal-Derivation Reconciliation — Findings

> Status: **investigation complete, decision required from Austen.** No live
> code or persisted data changed. Read-only diagnostic + this writeup are the
> deliverables. Supersedes the "path 1" framing in
> `project_stepdata_step_migration` memory.
>
> Conclusions adversarially verified by a 4-lens workflow
> (`reversal-reconciliation-verify`, 2026-06-30); the verification overturned an
> earlier (wrong) "the detector over-detects" hypothesis — see §Domain.

## TL;DR

The proposed hardening — *"make reversals derived, prove `deriveReversals ==
stored`, keep contentHash byte-stable"* — **is not viable as stated.** Measured
against the real production code over the committed public corpus:

- **`processReversals` (the function `hydrate()` already runs on every load)
  disagrees with the persisted `stepPairings` reversal flags on 133 / 460
  published sequences (28.9%), 770 / 6188 steps (12.4%).** Exact, not
  approximate — confirmed by two independent methods.
- The disagreement is **strictly one-directional**: all 913 disagreeing
  blue/red cells are **derived = TRUE / stored = FALSE**; not one case of stored
  TRUE / derived FALSE. 440 / 460 sequences carry **no** stored reversal flag at
  all. So "stored disagrees" means *the persisted flags almost never recorded
  the reversals the live detector legitimately produces.*
- Re-deriving therefore *adds* flags on 29% of the corpus. Those flags sit
  inside both content hashes, so re-deriving **changes contentHash for 29% of
  published sequences** — the exact byte-stability violation the path was meant
  to avoid.
- A **latent phantom-fork-on-resave** falls out of the same wiring: a load +
  "Save to library" with no motion edit can fork a published sequence's identity.

Evidence: `tests/unit/reversal-derivation-parity.test.ts` (real `deriveSteps` +
`processReversals` over `static/data/snapshots/public-sequences.json`); a second
independent replication script agreed to the cell.

## How the system is wired (evidence)

Reversal flags are **identity-bearing**:
- `hashSequenceContent` (render-cache key) serializes `step.blueReversal/redReversal` — `content-hasher.ts:124-125`.
- `computeHash` (SHA-256 variation identity) serializes them — `sequence-content-hasher.ts:62-63`.

Both hash the **in-memory** `sequence.steps`, i.e. the post-hydrate
(re-derived) flags — not the stored `stepPairings`.

The live data flow:
1. Persisted doc carries authored `stepPairings.blue/redReversal`;
   `contentHash` was computed from whatever flags the steps held at save.
2. `deriveSteps` seeds each step with the stored pairing flags
   (`step-deriver.ts:154-155`) **but passes `rotationDirection` through
   untransformed** (`step-deriver.ts:94`).
3. `hydrate()` then runs `processReversals`
   (`sequence-hydrator.ts:167,182`), which ignores the seeded flags and
   **recomputes purely from motion rotation + loop-wrap**, overwriting them.
   `library-repository.ts:228` comments that hydrate "overrides this with
   freshly derived steps."

Three reversal implementations exist, all comparing raw `rotationDirection`
(`cw`/`ccw`), none reading hand-arc direction:

| impl | file | loop-wrap | blank handling |
|---|---|---|---|
| app `processReversals` | `src/lib/shared/create/services/reversal-detector.ts:35` | **yes** (`[...steps, ...steps.slice(0,i)]`, line 48) | transparent (looks past) |
| engine `deriveReversals` (canonical, advertised by `tka-types/step.ts:13`) | `packages/sequence-engine/src/analysis/deriveReversals.ts:32` | **no** | breaks chain |
| engine `ReversalDetector` class | `packages/sequence-engine/src/analysis/ReversalDetector.ts:38` | **no** | n/a |

`deriveReversals` (the function `tka-types` advertises as canonical) has neither
the loop-wrap nor the blank semantics of the production `processReversals` — so
it is a *third* behavior. Any future migration routed through it would diverge
again.

## The 29% divergence (real, measured)

```
corpus sequences (compositional): 460
MATCH  real processReversals == stored: 327
DIFFER real processReversals != stored: 133   (loop=110, non-loop=23)
step-level: 770/6188 differ (12.4%)   cell-level: 913 (436 blue + 477 red), ALL derived=TRUE/stored=FALSE
sequences carrying any stored reversal flag: 20 (8 differ); 440 carry none (125 of those now derive ≥1)
```

**Dominant driver: the loop-boundary wrap.** ~125 of the 133 diverging
sequences carry *no* stored reversal flags; the wrap
(`reversal-detector.ts:48-53`) makes early steps look back through the sequence
tail and now produces reversals the older persisted `stepPairings` never
recorded. The remaining handful (8 of the 20 flag-carrying sequences) differ
similarly. Example — word `AB` (loopType `rotated`): blue rotation
`[cw,ccw,cw,ccw]` → derived `[T,T,T,T]`, stored `[—,—,—,—]`.

## TKA domain ground truth (MCP) — the cause is NOT over-detection

An earlier hypothesis ("the detector over-detects natural pro/anti alternation")
was **wrong** and is retracted. MCP `get_term_definition`:

- **`pro`** = prop spins the **same** direction as the hand's arc; **`anti`** =
  opposite.
- **`reversal`** has three types: **hand reversal** (hand retraces, prop
  continues — switches pro/anti), **prop reversal** (hand continues, prop
  reverses spin — switches pro/anti), **full reversal** (both retrace — *keeps*
  pro/anti).

Consequence (formal, from the definitions): pro/anti is the relation
(propRot vs handArc). A raw `rotationDirection` cw↔ccw flip while the hand
continues its arc is **verbatim a prop reversal**; if the hand also flips it is a
full reversal. So **every dot the detector emits is a genuine reversal — zero
false positives.** The `AB`-style chain is a real prop-reversal chain, not "no
reversals." There is no stricter canon that calls those zero.

The heuristic *is* lossy, but in the **opposite** direction: comparing only
`rotationDirection` (never the hand arc) makes it **miss hand reversals** (prop
spin unchanged, hand retraces, pro/anti flips). Those are false negatives. So
the persisted all-false flags are not "the correct stricter truth" — they are
simply stale/under-recorded relative to the current detector (mostly because of
the later-added loop-wrap).

**Do not build a fix that suppresses reversal dots.** That would erase correct
indicators. The identity/fork hazard below stands entirely on its own — it does
not depend on the (retracted) over-detection claim.

## Latent phantom-fork-on-resave (verified, with scope corrections)

Chain (all links confirmed at the code level):
1. Load → `hydrate()` recomputes flags Y that differ from the doc's authored
   flags X for the 133 divergent sequences.
2. Resave → `computeHash(sequence)` (`library-repository.ts:285`) hashes the
   Y-flag steps; `ensureComposition`→`extractStepPairings`
   (`sequence-decomposer.ts:81`) persists Y.
3. `incomingHash(Y) !== existingHash(X)` → **fork detection at
   `library-repository.ts:295` creates a new UUID doc, `source:"forked"`,
   default `visibility:"public"`.** Toast still reads "Saved." Original untouched.

Scope (so we don't overclaim):
- **Trigger is the viewer's explicit "Save to library"**
  (`library-action-handler.svelte.ts handleSave → saveSequence`), and
  `library-state.svelte.ts:485`. It fires with **no motion edit** — just opening
  a stale sequence and pressing Save.
- **Favorite / retitle / publish do NOT fork** — they route through
  `updateSequence` (`library-repository.ts:605-698`), which writes only the
  changed fields and never calls `computeHash`.
- **Conditional, not universal:** requires recomputed ≠ persisted **and** an
  existing stored `contentHash` (the guard at `:295` needs `existingHash`
  truthy). Legacy docs without a stored hash are safe; an already-consistent doc
  is stable across resaves.
- **Reversal flags are not the only hazard field.** `gridMode` is likewise
  re-derived on hydrate (`step-deriver.ts deriveStepGridMode`) and hashed
  (`sequence-content-hasher.ts:67`); it can independently trip the same fork.
  Reversal flags are the cleanest demonstrated case.

## Closest existing mitigation (scoped to the wrong path)

`catalog-loader.ts:188-193` (choreo-card catalog loader) already does
`const hasStoredReversals = steps.some(s => s.blueReversal !== undefined || s.redReversal !== undefined); if (hasStoredReversals) return hydrated;`
— it preserves stored flags and skips `processReversals`. But it exists **only**
on the choreo-card path; the main library/published path (`hydrate()`,
`sequence-repository.ts:131,163`) has no such guard. So the *same* sequence
yields stored flags via catalog-loader but re-derived flags via `hydrate()` —
contentHash depends on load path. This is the obvious thing to lift into
`hydrate()`.

The reversal-pattern deck system (`reversal-transform.ts`,
`reversal-seed-service.ts solveHandFlips`) is explicitly built so stored flags
**equal** what `processReversals` re-derives ("WYSIWYG"). It does *not*
intentionally write irreproducible flags — so the divergence is drift, not
design.

## The real fork (decision required)

Re-deriving is not the safe move; resolve the divergence by removing the hazard
or fixing the source of truth.

- **A — Exclude round-trip-derived fields from the identity hash (recommended
  for the fork bug).** Reversal flags + `gridMode` are recomputed on every load;
  hashing them makes identity load-path- and algorithm-dependent. Drop them from
  `computeHash` / `hashSequenceContent`. This **kills the phantom-fork-on-resave**
  and makes "derive reversals byte-stably" true by construction (derived fields
  no longer affect identity). One-time cost: the hash basis changes → a corpus
  `contentHash` migration (gated on Austen + prod access). Principled, narrow.
- **B — Persist-and-trust on read (stabilizes display per-doc).** Lift the
  `catalog-loader.ts:188-193` guard into `hydrate()` so the main path stops
  overriding stored flags. Makes load idempotent, kills load-path-dependent
  drift. Caveat: stored flags are near-all-false today, so the 133 sequences
  would display **fewer** dots than the live detector currently shows — a
  visible change; needs Austen, because it asserts "stored > recomputed."
- **C — Hand-arc-aware detector (correctness, separate track).** Make the
  detector catch the *hand* reversals it currently misses (the real semantic
  gap). This *increases* dots and is orthogonal to identity/byte-stability —
  do not conflate it with A/B.

Recommendation: **A** is the correct, narrow fix to the fork hazard and makes
path-1 byte-stable by construction; it needs a gated one-time hash migration.
Pair with **B** (lift the existing guard) if we also want display stability
without immediately changing the hash basis. **C** is a separate correctness
improvement. Do **not** ship any of these blind — A's hash-basis change and B's
visible-dot change are both Austen's calls.

## Decision (2026-06-30): Option A chosen, mechanism built

Austen chose **A**. Built + proven this session (default still V1 — zero runtime
change until the gated rollout):
- V2 identity hasher behind a version constant — `sequence-content-hasher.ts`.
- Fork-proof + collision-safe proof — `tests/unit/content-hash-v2-fork-proof.test.ts`
  (7 tests green; V2 invariant under re-derivation; 0 false merges over the
  corpus; V1 golden-locked).
- Migration — `scripts/migrations/rehash-content-v2.ts` (dry-run default).
- Rollout spec (version-aware fork detection + lazy rehash + ordering):
  `docs/superpowers/specs/active/2026-06-30-content-hash-v2-rollout.md`.

Gated on Austen: the version-aware fork-detection wiring (corruption core) + the
prod migration + flipping the active version. See the rollout spec.

## What was delivered this session (safe, committed)

- `tests/unit/reversal-derivation-parity.test.ts` — read-only diagnostic over
  the real corpus using the real `deriveSteps` + `processReversals`.
- `sequence-content-hasher.ts` V2 hasher (default V1, inert) +
  `tests/unit/content-hash-v2-fork-proof.test.ts` + `rehash-content-v2.ts`
  migration + the rollout spec.
- This findings doc.

No live code path changed behavior (active hash version stays V1), no
`deriveReversals` semantics, and no persisted data were touched.

## Adversarial verification summary

4-lens workflow (`reversal-reconciliation-verify`, Opus 4.8 ×5, 549k tokens):
- **independent-recompute** — *confirmed*, exact to the cell (133/460, 913
  one-directional derived-TRUE/stored-FALSE).
- **phantom-fork-trigger** — *confirmed*, with the scope corrections folded in
  above (viewer Save, not favorite; conditional; gridMode too).
- **semantic-lens-mcp** — *refuted* the over-detection hypothesis; established
  the detector is correct (no false positives) and under-detects hand reversals.
  This is the most important correction.
- **missed-reconciliation-sweep** — *confirmed* nothing reconciles the published
  path; surfaced the `catalog-loader.ts:188-193` guard as the scoped-wrong
  mitigation and confirmed no reversal-flag migration exists.

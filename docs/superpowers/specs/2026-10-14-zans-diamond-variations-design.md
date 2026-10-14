# Zan's Diamond variations — design (2026-10-14)

## Decisions (Austen, 2026-10-14)

- The source is the author-verified sequence
  `users/PBp3GSBO6igCKPwJyLZNmVEmamI3/sequences/seq_1791923102683_sysj46042`
  (word `IΨ-IΨ-IΨ-IΨ-`, 8 beats). Each hand traces the closed path
  s → e → w → n → s → w → e → n → s. Nothing about the path is invented; the
  generator reads the saved solo-prop steps.
- Stagger: all seven offsets 1–7 of one hand against the other count as
  distinct. Hand swap is distinct (right leading by 3 ≠ left leading by 3).
- Reversal is per hand: one hand runs the path backwards while the other runs
  forward. Whole-pair reversal (the sequence played backwards) is out.
- Every variation is expected to resolve to a TKA letter on every beat. Any
  beat that does not resolve is reported, not hidden.
- Delivery: new sequence documents appended to the public "Zan's Diamond"
  collection `dab5fdca-b279-4a50-bd7a-67f291fce071`. No Learn lesson yet.

## Enumeration

With the left hand as the forward reference at offset 0:

| Family         | Right hand           | Left hand            | Count |
| -------------- | -------------------- | -------------------- | ----- |
| Stagger        | forward, offset 1–7  | forward, offset 0    | 7     |
| Right reversed | reversed, offset 0–7 | forward, offset 0    | 8     |
| Left reversed  | forward, offset 0    | reversed, offset 0–7 | 8     |

Twenty-three variations plus the original. The generator dedupes by cyclic
step signature and the test asserts the count.

Offset k means the hand starts its path at step k (cyclic). Reversal is the
rotation-faithful kind the combination engine already uses: step order and
locations reverse, the prop keeps its rotation direction, and the motion type
is re-derived (pro ↔ anti, dash stays dash). Turns are chosen so the prop keeps
the record's orientation convention (every beat starts and ends `out`), which
is what the source record does for both hands.

## Components

- `src/lib/shared/foundation/services/solo-prop-pair-variations.ts` — pure:
  rotate / reverse solo-prop steps, pair two hands into beats with placements
  (`getGridPlacementFromLocations`) and letters (caller-supplied lookup),
  enumerate the stagger + reversal variations.
- `scripts/zans-diamond-variations.ts` — reads the source record, builds every
  variation, prints a manifest, writes import JSON; with `--write` imports each
  through `scripts/import-sequence.cjs`, publishes through
  `scripts/publish-sequence.cjs`, then adds it to the collection. Idempotent on
  `metadata.zansDiamondVariant`.
- `scripts/add-sequence-to-collection.ts` — generic: append sequences to a
  collection the way `collection-manager.addSequenceToCollection` does
  (public collection requires a published member).

## Verification

- Vitest for the pure module against a checked-in copy of the source record's
  solo-prop steps and the real diamond dataframe: 23 unique variations, every
  beat lettered, orientations stay `out`, offset 0 forward/forward reproduces
  the source word.
- Dry run of the script prints the manifest; the write run reports the new
  sequence ids and the collection count.

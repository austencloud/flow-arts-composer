# Combinator research scripts

Throwaway-quality but load-bearing: these three scripts are the **reproducible
evidence** for the domain claims in `docs/reference/letter-gap-families.md` and
`docs/superpowers/specs/2026-08-05-sequence-combinator-redesign-design.md`.
Written 2026-08-05. They read the canonical dataframes directly and depend on
nothing else — `node scripts/combinator-research/<file>`.

They are research instruments, not product code. When the real combinator is
built inside `src/lib/shared/combination/`, these stay as the oracle its output
is checked against.

| Script | What it proves | Runtime |
|---|---|---|
| `letter-orbits.mjs` | The **13 letter-gap families**. Rotates one hand by 90/180/270 over every pictograph and maps letter → letter. 100% coverage, no misses. Prints the full map, the 180° involution, and the families as undirected components. | seconds |
| `letter-group.mjs` | The **group** underneath the families. Treats each structural transform as a permutation of all 1152 pictographs, reports which are closed, generates the group, and prints its orbits and letter classes. Also proves the **288 characters × 4 gaps** bijection and the family-size law. | seconds |
| `by-count.mjs` | The **count buckets and the crossing law**. Enumerates every closed unit for a card pair, tests closure against the D4×swap group, and buckets by full circle length (unit × order of the closing transform). | ~30s for A+G |
| `theory-512.mjs` | The **pair fingerprint**. Same enumeration across many base-sequence pairs, reporting distinct-word counts. Source of the 256 / 512 / 7396 table. | minutes to hours |
| `pair-classes.mjs` | The **fingerprint law**, stated as a prediction and then scored against measurement. Derives each pair's predicted class from gap separation and family membership, runs the enumeration, and prints PASS/MISS per pair. | ~15 min |
| `enumerate.mjs` | Not a script — the shared enumeration core, extracted from `theory-512.mjs` so the oracle and the prediction harness cannot drift. Exports `countPair`, the closure group, and the runtime family derivation. | — |

**Regression anchor:** `countPair({ lettersA: ["A"], lettersB: ["G"] }).words` must be
**256**. If a change to `enumerate.mjs` moves that number, the change is wrong
(or the equivalence relation moved, which needs saying out loud — see limit 3).

## Known limits — read before trusting a number

1. **Diamond mode only.** `by-count.mjs` and `theory-512.mjs` load only
   `DiamondPictographDataframe.csv`. Box is loaded in `letter-orbits.mjs` only.
2. **The closure test is a reimplementation.** It checks position-pair membership
   against a locally-built D4×colour-swap group. It was verified 2026-08-05 to
   agree with the app's `isLOOPValidForPlacementPair`
   (`packages/sequence-engine/src/loop/validation/LOOPValidator.ts`) — but the
   real engine must call the app's validator, not this.
3. **Counts are sensitive to the equivalence relation**, which is the open
   design question. `by-count.mjs` quotients by cyclic rotation of the unit,
   whole-sequence D4×swap symmetry, and the one-hand-rotation orbit. Change any
   of those and every number changes. An early version omitted the orbit quotient
   and reported 512 for A+G where the correct figure is 256.
4. **45° (skew) is excluded** — the shipped skewed dataframe has no rows starting
   from a skewed position, so skew faces cannot be resolved. See the design spec.
5. Turns are ignored entirely; everything is 0-turn.

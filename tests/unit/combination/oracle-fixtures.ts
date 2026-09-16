/**
 * Golden-fixture snapshot of the combinator RESEARCH ORACLE.
 *
 * Source: `scripts/combinator-research/` (`enumerate.mjs`, `by-count.mjs`,
 * `pair-classes.mjs`, `theory-512.mjs`), transcribed 2026-08-05 from that
 * directory's own printed output and from `docs/reference/letter-gap-families.md`
 * ("What a card pair's fingerprint measures", "Compound cards", and the
 * `by-count.mjs` A+G run). These numbers were NOT re-measured when this file
 * was written — see the one exception noted on `SMOKE_CHECKED_AG_WORDS` below.
 * Re-running the originating scripts is how you'd re-verify them from
 * scratch; this file exists so the app engine has something fixed to check
 * itself against without paying that cost on every test run.
 *
 * KNOWN LIMITS — carried forward from `scripts/combinator-research/README.md`.
 * Read that file before trusting any number below, and DO NOT treat a
 * mismatch between the app engine and this fixture as automatically the
 * app's bug — it may be a legitimate difference in equivalence relation
 * (limit 3).
 *
 *   1. Diamond mode only. The oracle never loads BoxPictographDataframe.csv.
 *   2. The closure test is a REIMPLEMENTATION of the app's rule (a local
 *      D4 x colour-swap group over placement pairs). Verified 2026-08-05 to
 *      agree with `isLOOPValidForPlacementPair`
 *      (`packages/sequence-engine/src/loop/validation/LOOPValidator.ts`) —
 *      but the real engine must call the app's validator, not this.
 *   3. Counts are sensitive to the equivalence relation the oracle quotients
 *      by: cyclic rotation of the unit, whole-sequence D4 x swap symmetry,
 *      AND the one-hand-rotation orbit. Change any of those and every number
 *      below moves. An early version of the oracle omitted the orbit quotient
 *      and reported 512 for A+G where the correct figure is 256 — a number
 *      that looks plausible is not evidence it came from the right relation.
 *   4. 45 degrees (skew) is excluded entirely — the shipped skewed dataframe
 *      has no rows that start FROM a skewed placement, so skew faces cannot
 *      be resolved.
 *   5. Turns are ignored; everything below is 0-turn.
 *   6. Standard box for every fingerprint below, unless noted otherwise:
 *      unit length <= 6 steps, <= 2 connectors, diamond grid, both cards
 *      required to appear in the closed unit.
 */

// Pair fingerprints — distinct closed-unit word counts for a card pair.

export interface PairFingerprint {
  readonly cardA: string;
  readonly cardB: string;
  readonly words: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("+");
}

/**
 * The three gap-involution partner pairs: the same motion character seen at
 * opposite gaps (alpha <-> beta). These are the only pairs the fingerprint
 * law (see `predictCrossWorldFingerprint` below) predicts 256 for; every
 * other cross-world single-letter pair predicts 512.
 */
const GAP_INVOLUTION_PARTNERS: ReadonlySet<string> = new Set([
  pairKey("A", "G"),
  pairKey("B", "H"),
  pairKey("C", "I"),
]);

/**
 * The fingerprint law (`docs/reference/letter-gap-families.md`, "What a card
 * pair's fingerprint measures"): every cross-world card pair fingerprints
 * 512 words. It halves to 256 exactly when the two cards are
 * gap-involution partners — the same motion character at opposite gaps
 * (A<->G, B<->H, C<->I). Separation into gamma never halves, whether or not
 * the cards share a family. Same-world pairs need no bridge at all and
 * explode instead (see `SAME_WORLD_PAIR_FINGERPRINTS`) — this predicate only
 * answers the cross-world question, and only for the ten runnable
 * single-letter cards (A, B, C, G, H, I, S, T, U, V).
 *
 * Verified 2026-08-05 by `scripts/combinator-research/pair-classes.mjs`:
 * 18 cross-world pairs predicted, 18 correct, 0 missed. The three
 * gap-involution pairs above (A+G, B+H, C+I) were among the 18; the
 * remaining 15 correctly predicted 512.
 */
export function predictCrossWorldFingerprint(
  cardA: string,
  cardB: string
): 256 | 512 {
  return GAP_INVOLUTION_PARTNERS.has(pairKey(cardA, cardB)) ? 256 : 512;
}

/**
 * Single-letter card pairs, standard box, that cross alpha/beta/gamma worlds
 * and therefore need a bridge to close. Exactly the pairs
 * `predictCrossWorldFingerprint` applies to.
 *
 * A+G, B+H, C+I, A+S were re-measured live inside `pair-classes.mjs`'s own
 * scored PAIRS loop (18 pairs total, 18/18 correct — see the doc comment on
 * `predictCrossWorldFingerprint`). A+H, B+G and G+S are anchors carried in
 * that script's `KNOWN` table from the original 2026-08-05 handoff — printed
 * as a regression check but not independently re-run by the PAIRS loop
 * itself. Every other row below (A+I, C+G, B+I, C+H, C+U, C+V, I+V, A+U,
 * A+T, A+V, B+S, B+U, G+T, H+S) is one of the 18 pairs the loop actually
 * scored.
 */
export const CROSS_WORLD_PAIR_FINGERPRINTS: readonly PairFingerprint[] = [
  { cardA: "A", cardB: "G", words: 256 },
  { cardA: "B", cardB: "H", words: 256 },
  { cardA: "C", cardB: "I", words: 256 },
  { cardA: "A", cardB: "H", words: 512 },
  { cardA: "B", cardB: "G", words: 512 },
  { cardA: "A", cardB: "S", words: 512 },
  { cardA: "G", cardB: "S", words: 512 },
  { cardA: "A", cardB: "I", words: 512 },
  { cardA: "C", cardB: "G", words: 512 },
  { cardA: "B", cardB: "I", words: 512 },
  { cardA: "C", cardB: "H", words: 512 },
  { cardA: "C", cardB: "U", words: 512 },
  { cardA: "C", cardB: "V", words: 512 },
  { cardA: "I", cardB: "V", words: 512 },
  { cardA: "A", cardB: "U", words: 512 },
  { cardA: "A", cardB: "T", words: 512 },
  { cardA: "A", cardB: "V", words: 512 },
  { cardA: "B", cardB: "S", words: 512 },
  { cardA: "B", cardB: "U", words: 512 },
  { cardA: "G", cardB: "T", words: 512 },
  { cardA: "H", cardB: "S", words: 512 },
];

/**
 * Single-letter card pairs that share a world (both alpha, both beta, or
 * both gamma). No bridge is needed — every interleaving of the two cards is
 * legal — so the count explodes instead of following the 256/512 law.
 * `predictCrossWorldFingerprint` does NOT apply to these; they are a
 * different regime entirely (letter-gap-families.md calls it out
 * explicitly).
 */
export const SAME_WORLD_PAIR_FINGERPRINTS: readonly PairFingerprint[] = [
  { cardA: "A", cardB: "B", words: 7396 },
  { cardA: "G", cardB: "H", words: 7396 },
  { cardA: "S", cardB: "T", words: 23466 },
];

/**
 * Compound-card pairs (DJ, EK, FL, ΦΨ, MP, NQ span two gaps by construction),
 * so they always overlap their partner's world and never need a bridge —
 * the exploding regime, same as `SAME_WORLD_PAIR_FINGERPRINTS`, and NOT
 * covered by `predictCrossWorldFingerprint`. `theory-512.mjs`'s 2026-08-05
 * sweep is the only source for these numbers.
 *
 * The five 7620 entries are reported as a byte-identical five-way tie in
 * their length distribution too (3:21 4:326 5:1373 6:4000 7:1600 8:300) — a
 * card plus any opposite-direction-or-dash compound gives the same answer,
 * whichever card and whichever compound. Ditto the two 10456 entries.
 */
export const COMPOUND_CARD_PAIR_FINGERPRINTS: readonly PairFingerprint[] = [
  { cardA: "A", cardB: "DJ", words: 7620 },
  { cardA: "G", cardB: "EK", words: 7620 },
  { cardA: "A", cardB: "FL", words: 7620 },
  { cardA: "A", cardB: "ΦΨ", words: 7620 },
  { cardA: "G", cardB: "ΦΨ", words: 7620 },
  { cardA: "DJ", cardB: "EK", words: 10456 },
  { cardA: "DJ", cardB: "FL", words: 10456 },
  { cardA: "S", cardB: "MP", words: 78103 },
  { cardA: "MP", cardB: "NQ", words: 214795 },
];

/** Every recorded pair fingerprint, all three regimes concatenated. */
export const ALL_PAIR_FINGERPRINTS: readonly PairFingerprint[] = [
  ...CROSS_WORLD_PAIR_FINGERPRINTS,
  ...SAME_WORLD_PAIR_FINGERPRINTS,
  ...COMPOUND_CARD_PAIR_FINGERPRINTS,
];

// A+G count-bucket profile — scripts/combinator-research/by-count.mjs.

/**
 * A+G's count-bucket profile, standard box. Keyed by FULL CIRCLE length —
 * unit (walked) length x order of the closing transform (a plain/identity
 * closure is order 1; mirror, flip, and colour-swap closures are order 2; a
 * 90 or 270 degree rotation closure is order 4) — NOT by unit length.
 *
 * A single word can close via more than one transform and therefore land in
 * more than one bucket, so these nine values do NOT sum to the pair's
 * 256-word fingerprint (they sum to 460). Do not assert that they do — that
 * was checked and confirmed false while writing this fixture.
 */
export const A_G_COUNT_BUCKET_PROFILE: Readonly<Record<number, number>> = {
  4: 10,
  5: 18,
  6: 60,
  8: 32,
  10: 80,
  12: 144,
  16: 12,
  20: 50,
  24: 54,
};

/**
 * A+G's 4-count bucket, in full: a 4-step unit closing via the identity
 * transform (order 1, so full-circle length = unit length = 4). Every one is
 * a "plain closure" — no rotation, reflection, or colour-swap needed to
 * close the loop. This list's length equals
 * `A_G_COUNT_BUCKET_PROFILE[4]` exactly (checked in oracle-fixtures.test.ts).
 */
export const A_G_FOUR_COUNT_WORDS: readonly string[] = [
  "AJGD",
  "AJGE",
  "AJGF",
  "AKGD",
  "AKGE",
  "AKGF",
  "ALGD",
  "ALGE",
  "ALGF",
  "AΨGΦ",
];

/**
 * A+G's complete 16-count bucket: 4-step units closing via a 90/270 degree
 * rotation (order 4, so full-circle length = 4 x 4 = 16), each one a "mixed
 * crossing" — one connector drawn from the shift family (D/E/F/J/K/L) and the
 * other from the dash family (Φ/Ψ), never two of the same family.
 *
 * Twelve, not six. The second six are the PHASES of the first six — the same
 * unit entered at a different step (`AJGΦ` and `JGΦA` are one cycle, two entry
 * points), and both survive canonicalisation. Resolved by direct measurement
 * 2026-08-05: `node scripts/combinator-research/by-count.mjs` prints all twelve
 * under `--- 16-count ---`, closing as rotated90(12), rotated270(12),
 * rotated90/swapped(12), rotated270/swapped(12).
 *
 * Worth knowing: the 4-count bucket has NO phase duplicates while every
 * 16-count entry has exactly one. That asymmetry is the open equivalence-relation
 * question (loose end #3) showing up in real data — whether a quartered loop
 * entered at a different quarter is one result or two is a decision nobody has
 * made yet. Do not read these twelve as twelve distinct ideas.
 */
export const A_G_SIXTEEN_COUNT_WORDS: readonly string[] = [
  "AJGΦ",
  "AKGΦ",
  "ALGΦ",
  "AΨGD",
  "AΨGE",
  "AΨGF",
  // phases of the six above
  "JGΦA",
  "KGΦA",
  "LGΦA",
  "ΨGDA",
  "ΨGEA",
  "ΨGFA",
];

/**
 * The base-sequence registry: the ingredient vocabulary of the combination
 * engine's ambient layer.
 *
 * Every entry's `letters` (the primitive letter cycle) and `edges` (their
 * canonical placement-family transitions, in cycle order) are grounded in the
 * canonical diamond dataframe
 * (`static/data/pictographs/DiamondPictographDataframe.csv`) — verified
 * directly against it in
 * `tests/unit/combination/base-sequence-registry.test.ts`
 * (per `verify-at-canonical-source.md`). `rosterConfirmed` tracks a SEPARATE
 * question: whether Austen has blessed this base's MEMBERSHIP in his 19-base
 * roster. The `rosterConfirmed: false` placeholders (CC, II, UU, VV, WΣYΘ,
 * XΔZΩ) already have fully canon-grounded `letters`/`edges` — the only open
 * question for them is roster membership, not the underlying letter data.
 *
 * Known incomplete: the 2026-08-05 algebra handoff puts the full roster at 24
 * (19 Type 1 + 2 Type 2 + 2 Type 3 + 1 Type 4). This file holds 19. Absent are
 * both Type 3 sequences (Σ-Y-Θ-W-, Δ-Z-Ω-X-) and the Type 4. Do not read
 * `BASE_SEQUENCES` as the complete connector vocabulary yet.
 * Ambient eligibility (`ambientEligibleBases`) is gated on `rosterConfirmed`
 * only, so an unconfirmed placeholder's canon-correct edges never leak into
 * ambient use.
 *
 * `word` is Austen's roster display NAME (his two/four-letter naming
 * convention for a base, e.g. "GG", "DJ", "WΣYΘ") — NOT a rendering
 * instruction. Any user-visible rendering of a sequence word routes through
 * `simplifyRepeatedWord` (`$lib/shared/foundation/utils/word-simplifier.ts`,
 * per `simplified-word-display.md`); `word` here is roster identity, and
 * display simplification (e.g. a realized "GGGGGGGG" -> "G") is that
 * utility's job, not this registry's.
 */

import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { LetterEdge } from "../services/letter-calculus";

const A = GridPlacementGroup.ALPHA;
const B = GridPlacementGroup.BETA;
const G = GridPlacementGroup.GAMMA;

const edge = (
  letter: Letter,
  from: GridPlacementGroup,
  to: GridPlacementGroup
): LetterEdge => ({ letter, from, to });

export interface BaseSequenceEntry {
  /** Austen's roster display name (his two/four-letter naming convention).
   * Roster IDENTITY, not a rendering instruction — see module doc comment. */
  readonly word: string;
  /** The primitive letter cycle, first-class data — e.g. `["G"]` for GG,
   * `["D","J"]` for DJ, `["W","Σ","Y","Θ"]` for WΣYΘ. */
  readonly letters: readonly Letter[];
  /** Canonical placement-family transitions, one per entry in `letters`, in
   * cycle order: `edges[i].to === edges[(i+1) % edges.length].from`.
   * Grounded in the diamond dataframe — see module doc comment. */
  readonly edges: readonly LetterEdge[];
  /** Whether Austen has blessed this base's MEMBERSHIP in his 19-base roster.
   * The ONLY open question for the 4 `false` placeholders below — their
   * `letters`/`edges` are already canon-grounded. */
  readonly rosterConfirmed: boolean;
  readonly note: string;
}

export const BASE_SEQUENCES: readonly BaseSequenceEntry[] = [
  {
    word: "AA",
    letters: [Letter.A],
    edges: [edge(Letter.A, A, A)],
    rosterConfirmed: true,
    note: "pro/pro alpha cycle",
  },
  {
    word: "BB",
    letters: [Letter.B],
    edges: [edge(Letter.B, A, A)],
    rosterConfirmed: true,
    note: "anti/anti alpha cycle",
  },
  {
    word: "GG",
    letters: [Letter.G],
    edges: [edge(Letter.G, B, B)],
    rosterConfirmed: true,
    note: "pro/pro beta cycle",
  },
  {
    word: "HH",
    letters: [Letter.H],
    edges: [edge(Letter.H, B, B)],
    rosterConfirmed: true,
    note: "anti/anti beta cycle",
  },
  {
    word: "DJ",
    letters: [Letter.D, Letter.J],
    edges: [edge(Letter.D, B, A), edge(Letter.J, A, B)],
    rosterConfirmed: true,
    note: "β↔α compound (MCP)",
  },
  {
    word: "EK",
    letters: [Letter.E, Letter.K],
    edges: [edge(Letter.E, B, A), edge(Letter.K, A, B)],
    rosterConfirmed: true,
    note: "β↔α compound (MCP)",
  },
  {
    word: "FL",
    letters: [Letter.F, Letter.L],
    edges: [edge(Letter.F, B, A), edge(Letter.L, A, B)],
    rosterConfirmed: true,
    note: "β↔α compound (MCP)",
  },
  {
    word: "ΦΨ",
    letters: [Letter.PHI, Letter.PSI],
    edges: [edge(Letter.PHI, B, A), edge(Letter.PSI, A, B)],
    rosterConfirmed: true,
    note: "dash cycle; promoted to first-class base 2026-08-04",
  },
  {
    word: "MP",
    letters: [Letter.M, Letter.P],
    edges: [edge(Letter.M, G, G), edge(Letter.P, G, G)],
    rosterConfirmed: true,
    note: "gamma compound (MCP)",
  },
  {
    word: "NQ",
    letters: [Letter.N, Letter.Q],
    edges: [edge(Letter.N, G, G), edge(Letter.Q, G, G)],
    rosterConfirmed: true,
    note: "gamma compound (MCP)",
  },
  {
    word: "OR",
    letters: [Letter.O, Letter.R],
    edges: [edge(Letter.O, G, G), edge(Letter.R, G, G)],
    rosterConfirmed: true,
    note: "gamma compound (MCP)",
  },
  // Quarter-SAME. Added 2026-08-05: quarter-opposite (M–R) was fully rostered
  // while quarter-same was absent entirely — not unconfirmed, simply never
  // entered. All four are canon-grounded gamma→gamma 4-cycles in the diamond
  // dataframe (gamma1→gamma3→gamma5→gamma7→gamma1), the same shape as AA and GG.
  //
  // There are FOUR of these where alpha and beta get three apiece, because
  // gamma occupies two of the four gap slots (`docs/reference/letter-gap-families.md`).
  // S and T are their own gamma partner; C's character splits across two names,
  // and those two are U and V — the pair TKA already calls leader/follower
  // (U leader=pro, V leader=anti, per packages/domain rotation-invariant.ts).
  //
  // Confirmation follows the pattern the rest of this file already sets: the
  // non-hybrids are confirmed (as AA/BB/GG/HH are), the hybrids await review
  // (as CC/II do). U and V are the hybrid family's two gamma names.
  {
    word: "SS",
    letters: [Letter.S],
    edges: [edge(Letter.S, G, G)],
    rosterConfirmed: true,
    note: "pro/pro gamma cycle — the gamma face of AA and GG",
  },
  {
    word: "TT",
    letters: [Letter.T],
    edges: [edge(Letter.T, G, G)],
    rosterConfirmed: true,
    note: "anti/anti gamma cycle — the gamma face of BB and HH",
  },
  {
    word: "CC",
    letters: [Letter.C],
    edges: [edge(Letter.C, A, A)],
    rosterConfirmed: false,
    note: "awaiting roster review",
  },
  {
    word: "II",
    letters: [Letter.I],
    edges: [edge(Letter.I, B, B)],
    rosterConfirmed: false,
    note: "awaiting roster review",
  },
  {
    word: "UU",
    letters: [Letter.U],
    edges: [edge(Letter.U, G, G)],
    rosterConfirmed: false,
    note: "awaiting roster review — hybrid gamma cycle, leader pro",
  },
  {
    word: "VV",
    letters: [Letter.V],
    edges: [edge(Letter.V, G, G)],
    rosterConfirmed: false,
    note: "awaiting roster review — hybrid gamma cycle, leader anti",
  },
  {
    // Θ is U+0398 (uppercase, a Type-2 Shift letter per the Letter model's
    // TYPE2_LETTERS — Type-6 statics are the lowercase α β γ ζ η τ set) —
    // never lowercase θ (U+03B8), which denotes nothing in TKA canon (see
    // admin/migrate-theta for the last such leak).
    word: "WΣYΘ",
    letters: [Letter.W, Letter.SIGMA, Letter.Y, Letter.THETA],
    edges: [
      edge(Letter.W, G, A),
      edge(Letter.SIGMA, A, G),
      edge(Letter.Y, G, B),
      edge(Letter.THETA, B, G),
    ],
    rosterConfirmed: false,
    note: "Austen-promoted base 2026-08-04; roster membership unconfirmed",
  },
  {
    word: "XΔZΩ",
    letters: [Letter.X, Letter.DELTA, Letter.Z, Letter.OMEGA],
    edges: [
      edge(Letter.X, G, A),
      edge(Letter.DELTA, A, G),
      edge(Letter.Z, G, B),
      edge(Letter.OMEGA, B, G),
    ],
    rosterConfirmed: false,
    note: "Austen-promoted base 2026-08-04; roster membership unconfirmed",
  },
];

export function rosterConfirmedBases(): BaseSequenceEntry[] {
  return BASE_SEQUENCES.filter((b) => b.rosterConfirmed);
}

/** Bases the combinator may draw ambient material from. */
export function ambientEligibleBases(): BaseSequenceEntry[] {
  return rosterConfirmedBases();
}

/**
 * Letters available as ambient material (for option filtering).
 *
 * Read off `base.letters` — the SAME field {@link ambientBaseForLetter} matches
 * on, deliberately. The two used to disagree in principle: this set was built
 * from `base.edges[].letter` while the reverse lookup scanned `base.letters`,
 * so a registry entry whose edges and letters ever drifted apart would have
 * admitted a letter no base could then own, and the combinator would have
 * filtered a step IN and immediately failed to tag it. One field, one answer.
 * (`base-sequence-registry.test.ts` also pins edges and letters to agree, which
 * makes the drift unreachable — this makes it harmless as well.)
 */
export function ambientLetterSet(): ReadonlySet<Letter> {
  const letters = new Set<Letter>();
  for (const base of ambientEligibleBases())
    for (const letter of base.letters) letters.add(letter);
  return letters;
}

/**
 * Reverse lookup: which roster-confirmed base owns this letter — for
 * ambientWord tagging (Task 9). Gated on `ambientEligibleBases` (i.e.
 * `rosterConfirmed` only), so an unconfirmed placeholder's letter (e.g. Θ,
 * C) never resolves here even though its edges are canon-grounded. Null when
 * the letter belongs to no ambient-eligible base's cycle.
 */
export function ambientBaseForLetter(letter: Letter): BaseSequenceEntry | null {
  for (const base of ambientEligibleBases()) {
    if (base.letters.includes(letter)) return base;
  }
  return null;
}

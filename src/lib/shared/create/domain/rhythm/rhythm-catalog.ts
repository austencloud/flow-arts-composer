/**
 * Shared rhythm catalog. A rhythm is a per-period symbol unit describing which
 * hand (or, single-lane, which step) is ACTIVE on each step. Tiled to a period.
 *
 * Symbols: P both · R red only · B blue only · - none.
 * Shared by the Turns and (Phase 2) Reversals drawers. ids intentionally match
 * the reversal pattern ids in shared/foundation/domain/sequence-patterns/reversal-patterns.ts.
 */
export interface RhythmDef {
  readonly id: string;
  readonly label: string;
  /**
   * How the shortcut reads to someone who has never met the canonical name.
   * "Book" is real TKA vocabulary from the reversal patterns, and it teaches a
   * newcomer nothing about turns, so the picker shows this underneath the name
   * rather than in place of it — the name is what they will hear other people
   * use. Equal to `label` when the canonical name is already plain, in which
   * case the picker prints it once.
   */
  readonly plainLabel: string;
  /** One period unit; tiled across the pattern length. */
  readonly sym: string;
  /**
   * Optional fixed period. When set, the rhythm only stamps at exactly this
   * period (the strip resizes to it on apply) and is only compatible with
   * lengths divisible by it. When absent, the rhythm tiles to any chosen
   * period (the default for the simple rhythms). `sym.length` must equal it.
   */
  readonly period?: number;
}

/** Per-hand catalog (Turns + Reversals). */
export const PER_HAND_RHYTHMS: readonly RhythmDef[] = [
  { id: "book", label: "Book", plainLabel: "Every step", sym: "P" },
  { id: "long-book", label: "Long Book", plainLabel: "Every other", sym: "P-" },
  { id: "alternating", label: "Alternating", plainLabel: "Trade off", sym: "RB" },
  { id: "red-book", label: "Red Book", plainLabel: "Right only", sym: "R" },
  { id: "blue-book", label: "Blue Book", plainLabel: "Left only", sym: "B" },
  // Solo family (canonical: shared/foundation/domain/sequence-patterns/reversal-patterns.ts → solo-1).
  // One hand per step across an 8-step cycle; never both, never neither.
  {
    id: "solo-1",
    label: "Solo 1",
    plainLabel: "One at a time",
    sym: "RBBRBRRB",
    period: 8,
  },
];

/** The "no rhythm" entry — all steps continuous / inactive. */
export const CONTINUOUS: RhythmDef = {
  id: "continuous",
  label: "Continuous",
  plainLabel: "Continuous",
  sym: "-",
};

/** Single-lane accent catalog (Duration — which steps are held longer). */
export const DURATION_RHYTHMS: readonly RhythmDef[] = [
  { id: "every", label: "Every step", plainLabel: "Every step", sym: "P" },
  { id: "every-other", label: "Every other", plainLabel: "Every other", sym: "P-" },
  { id: "downbeat", label: "First step", plainLabel: "First step", sym: "P---" },
  { id: "last", label: "Last step", plainLabel: "Last step", sym: "---P" },
];

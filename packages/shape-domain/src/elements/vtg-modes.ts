/** The six VTG modes: timing (Split/Together/Quarter) × direction (Same/Opp). */
export type VtgMode = "SS" | "TS" | "QS" | "SO" | "TO" | "QO";

/** Canonical display order: same-direction trio, then opposite-direction trio. */
export const MODE_ORDER: readonly VtgMode[] = [
  "SS",
  "TS",
  "QS",
  "SO",
  "TO",
  "QO",
];

export const MODE_LABEL: Record<VtgMode, string> = {
  SS: "Split · Same",
  TS: "Together · Same",
  QS: "Quarter · Same",
  SO: "Split · Opp",
  TO: "Together · Opp",
  QO: "Quarter · Opp",
};

/**
 * The two words a mode is made of, spelled out for a chip that stacks them:
 * timing on one line, direction on the next. A chip has room for the full
 * word where the code line had to abbreviate.
 */
export const MODE_WORDS: Record<
  VtgMode,
  { timing: "Split" | "Together" | "Quarter"; direction: "Same" | "Opposite" }
> = {
  SS: { timing: "Split", direction: "Same" },
  TS: { timing: "Together", direction: "Same" },
  QS: { timing: "Quarter", direction: "Same" },
  SO: { timing: "Split", direction: "Opposite" },
  TO: { timing: "Together", direction: "Opposite" },
  QO: { timing: "Quarter", direction: "Opposite" },
};

/** The words as a chip prints them: Together and Opposite are the two that
 *  overrun a narrow chip, and Tog / Opp are how flow artists already say
 *  them. Accessible names keep the full words. */
export const MODE_SHORT_WORDS: Record<
  VtgMode,
  { timing: "Split" | "Tog" | "Quarter"; direction: "Same" | "Opp" }
> = {
  SS: { timing: "Split", direction: "Same" },
  TS: { timing: "Tog", direction: "Same" },
  QS: { timing: "Quarter", direction: "Same" },
  SO: { timing: "Split", direction: "Opp" },
  TO: { timing: "Tog", direction: "Opp" },
  QO: { timing: "Quarter", direction: "Opp" },
};

/** Diamond-grid VTG mode → canonical TnD family. */
export const MODE_FAMILY_ID: Record<VtgMode, string> = {
  SS: "split-same",
  TS: "tog-same",
  QS: "quarter-same",
  SO: "split-opp",
  TO: "tog-opp",
  QO: "quarter-opp",
};

import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { loadDiamondEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import type { FlowerStyle } from "../domain/flower-signature";

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

export interface Realization {
  mode: VtgMode;
  modeLabel: string;
  /** Representative TKA letter for this mode — drives the sequence build. */
  letter: string;
  timing: string;
  direction: string;
  edge: CsvEdge;
}

/** Map a CSV (timing, direction) pair to a VTG mode code. Tolerates both the
 *  abbreviated ("tog"/"opp") and full ("together"/"opposite") spellings. */
function modeOf(timing: string, direction: string): VtgMode {
  const t = timing.includes("split") ? "S" : timing.includes("tog") ? "T" : "Q";
  const d = direction.includes("opp") ? "O" : "S";
  return `${t}${d}` as VtgMode;
}

/**
 * One realization PER VTG MODE (not per letter) for a cell's style pair. A cell
 * is a pure shape pairing, so every mode that traces those two flowers is a
 * distinct way to accomplish it; collapsing to letters hid that several modes
 * (e.g. D's split-opp and tog-opp) share a letter. Returns ≤6 rows ordered by
 * MODE_ORDER, each carrying the first letter seen for that mode as its seed.
 */
export function filterRealizations(
  edges: CsvEdge[],
  leftStyle: FlowerStyle,
  rightStyle: FlowerStyle
): Realization[] {
  const byMode = new Map<VtgMode, Realization>();
  for (const e of edges) {
    if (e.leftMotionType !== leftStyle || e.rightMotionType !== rightStyle)
      continue;
    const mode = modeOf(e.timing, e.direction);
    if (byMode.has(mode)) continue;
    byMode.set(mode, {
      mode,
      modeLabel: MODE_LABEL[mode],
      letter: e.letter,
      timing: e.timing,
      direction: e.direction,
      edge: e,
    });
  }
  return MODE_ORDER.filter((m) => byMode.has(m)).map((m) => byMode.get(m)!);
}

/** Runtime convenience: load the diamond edges then filter. */
export async function loadRealizations(
  leftStyle: FlowerStyle,
  rightStyle: FlowerStyle
): Promise<Realization[]> {
  return filterRealizations(await loadDiamondEdges(), leftStyle, rightStyle);
}

import type { CsvEdge } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { loadDiamondEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import {
  MODE_LABEL,
  MODE_ORDER,
  type FlowerStyle,
  type VtgMode,
} from "@tka/shape-domain";

// The modes themselves live in @tka/shape-domain; re-exported for the
// engine's own importers of this module.
export {
  MODE_FAMILY_ID,
  MODE_LABEL,
  MODE_ORDER,
  MODE_SHORT_WORDS,
  MODE_WORDS,
  type VtgMode,
} from "@tka/shape-domain";

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

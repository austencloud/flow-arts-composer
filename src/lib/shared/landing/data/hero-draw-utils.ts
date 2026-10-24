/**
 * Hero draw helpers shared by every constructed hero source (the shape-matrix
 * flowers and the authored CAP and Zan's Diamond strips). Each source has to
 * land its draw where the previous one left off, hold the stage long enough,
 * and label its element from what actually plays, so these live once here
 * rather than in each pool.
 *
 * Firebase-free on purpose: the landing bundle reaches this through dynamic
 * imports and must stay that way.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import { rotateSequenceGeometry } from "#lib/shared/create/services/sequence-derived-fields.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import { TnDMode } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  TND_BY_FAMILY,
  type TnDElement,
} from "#lib/features/choreo-card/domain/tnd-element.js";

/** Derived TnD mode → element family id (pure; the tainted copies in
 *  deck-composer/browse-filter can't be imported on a firebase-free page). */
const TND_MODE_TO_FAMILY: Readonly<Record<TnDMode, string>> = {
  [TnDMode.SPLIT_SAME]: "split-same",
  [TnDMode.TOG_SAME]: "tog-same",
  [TnDMode.QUARTER_SAME]: "quarter-same",
  [TnDMode.SPLIT_OPP]: "split-opp",
  [TnDMode.TOG_OPP]: "tog-opp",
  [TnDMode.QUARTER_OPP]: "quarter-opp",
};

/** Key identifying a start pose by its two hands' start locations (what rotation
 *  actually moves). Two poses with the same key are the same grid position. */
export function startLocKey(
  sp: StartPlacementData | undefined | null
): string | null {
  const b = sp?.motions?.left?.startLocation;
  const r = sp?.motions?.right?.startLocation;
  return b && r ? `${b}|${r}` : null;
}

/**
 * Rotate a draw so its start pose matches `targetKey`, using only 90° steps
 * (even 45° counts) so its grid identity (diamond/box) is preserved — an odd
 * 45° step would toggle it. Returns null when no quarter-rotation of this draw
 * lands on the target (e.g. wrong position family).
 */
export function rotateToStartKey(
  seq: SequenceData,
  targetKey: string
): SequenceData | null {
  for (const steps of [0, 2, 4, 6]) {
    const rotated = steps === 0 ? seq : rotateSequenceGeometry(seq, steps);
    if (startLocKey(rotated.startPlacement) === targetKey) return rotated;
  }
  return null;
}

/**
 * Tile a closed loop `times` times into one longer sequence. A closed loop
 * ends back on its start pose, so copy k+1's first step begins exactly where
 * copy k's last step ended — the tiled play chains seamlessly. Step numbers
 * renumber and ids get a per-copy suffix so nothing downstream keys two steps
 * to the same id.
 */
export function tileClosedLoop(seq: SequenceData, times: number): SequenceData {
  const steps: (typeof seq.steps)[number][] = [];
  for (let k = 0; k < times; k++) {
    for (const s of seq.steps) {
      steps.push({ ...s, id: `${s.id}-r${k}`, stepNumber: steps.length + 1 });
    }
  }
  return {
    ...seq,
    steps,
    sequenceLength: steps.length,
    word: (seq.word ?? "").repeat(times),
  };
}

/** Re-derive the TnD element from the final played geometry (first visible step). */
export function elementOf(seq: SequenceData): TnDElement | null {
  const step = seq.steps.find((s) => !s.isBlank) ?? seq.steps[0];
  if (!step) return null;
  const { tndMode } = deriveTnDFromPictograph(step as never);
  if (!tndMode) return null;
  const family = TND_MODE_TO_FAMILY[tndMode];
  return family ? (TND_BY_FAMILY[family] ?? null) : null;
}

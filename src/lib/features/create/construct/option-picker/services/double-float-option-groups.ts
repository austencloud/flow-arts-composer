import {
  MotionType,
  type ElementalType,
  type TnDMode,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";

export interface DoubleFloatPathOption<T extends PictographData> {
  readonly id: string;
  readonly option: T;
  readonly originalIndex: number;
}

export interface DoubleFloatOptionRow<T extends PictographData> {
  readonly mode: TnDMode;
  readonly elementalType: ElementalType;
  readonly options: readonly DoubleFloatPathOption<T>[];
}

function isFloat(motion: MotionData | null | undefined): motion is MotionData {
  return (
    isVisibleMotion(motion) &&
    motion.motionType === MotionType.FLOAT &&
    motion.turns === "fl"
  );
}

/**
 * Groups double-float options by their elemental mode without collapsing any
 * pre-float identity. In All mode M/N/O remain separate pictograph actions; in
 * Continuous mode the upstream direction filter naturally leaves the one base
 * identity that continues each hand path.
 */
export function buildDoubleFloatOptionRows<T extends PictographData>(
  options: readonly T[]
): readonly DoubleFloatOptionRow<T>[] | null {
  if (options.length === 0) return null;

  const categorized = options.map((option, originalIndex) => {
    const letter = option.letter ? String(option.letter) : "";
    const left = option.motions.left;
    const right = option.motions.right;
    const { tndMode, elementalType } = deriveTnDFromPictograph(option);

    if (
      !letter ||
      !isFloat(left) ||
      !isFloat(right) ||
      !tndMode ||
      !elementalType
    ) {
      return null;
    }

    return {
      mode: tndMode,
      elementalType,
      option,
      originalIndex,
    };
  });

  // A mixed collection should keep the ordinary grid. Partial grouping would
  // make some options disappear into rows while their neighbors stayed loose.
  if (categorized.some((entry) => entry === null)) return null;

  const rows = new Map<
    TnDMode,
    { elementalType: ElementalType; options: DoubleFloatPathOption<T>[] }
  >();
  for (const entry of categorized) {
    if (!entry) continue;
    const row = rows.get(entry.mode) ?? {
      elementalType: entry.elementalType,
      options: [],
    };
    row.options.push({
      id: `${entry.mode}|${entry.originalIndex}`,
      option: entry.option,
      originalIndex: entry.originalIndex,
    });
    rows.set(entry.mode, row);
  }

  return [...rows].map(([mode, row]) => ({ mode, ...row }));
}

export function countDoubleFloatPathGroups(
  rows: readonly DoubleFloatOptionRow<PictographData>[]
): number {
  return rows.reduce((total, row) => total + row.options.length, 0);
}

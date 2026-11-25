import type { OptionLoader } from "#lib/features/create/construct/option-picker/services/option-loader.js";
import {
  convertToStartPlacement,
  convertToStep,
} from "#lib/features/create/generate/shared/services/step-converter.js";
import type { LOOPValidator } from "#lib/features/create/shared/services/loop-validator.js";
import type { SequenceExtender } from "#lib/features/create/shared/services/sequence-extender.js";
import { recalculateAllOrientations } from "#lib/shared/create/services/orientation-propagation.js";
import type { StartPlacementManager } from "#lib/shared/create/services/start-placement-manager.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  LOOP_FAMILIES,
  rowChange,
  variantFor,
  type LoopFamily,
  type LoopVariant,
  type RowChange,
  type StepLocations,
} from "../domain/loop-families";

/** Where a person's hands start, in the words the picker uses. */
export type StartGroup = "apart" | "together" | "adjacent";

/** One step a person could add next, and which LOOPs it would make possible. */
export interface LoopOption {
  pictograph: PictographData;
  makes: ReadonlySet<LoopFamily>;
}

/** A finished LOOP, ready to show: the steps, the row length, the row changes. */
export interface MadeLoop {
  family: LoopFamily;
  variant: LoopVariant;
  /** The steps the person built, before the repeat was added. */
  seed: SequenceData;
  sequence: SequenceData;
  /** How many steps repeat. */
  partLength: number;
  /** How each row below the first differs from the row above it. */
  changes: RowChange[];
}

/**
 * Tells which kind of LOOP a run of steps can become and turns it into one.
 * The rules are the app's own: Extend's validity check and Extend's
 * completion. Nothing here decides what a LOOP is, and nothing here adds a
 * step the person didn't choose. The explainer also builds its own example
 * here, on the diamond grid, from the start picker's poses and Construct's
 * options.
 */
export class LoopStepWorkshop {
  private readonly gridMode = GridMode.DIAMOND;

  constructor(
    private readonly startPlacements: StartPlacementManager,
    private readonly optionLoader: OptionLoader,
    private readonly validator: LOOPValidator,
    private readonly extender: SequenceExtender
  ) {}

  startPoses(): Record<StartGroup, PictographData[]> {
    const poses: Record<StartGroup, PictographData[]> = {
      apart: [],
      together: [],
      adjacent: [],
    };
    for (const pose of this.startPlacements.getAllStartPlacementVariations(
      this.gridMode
    )) {
      const placement = String(pose.startPlacement ?? "");
      if (placement.startsWith("alpha")) poses.apart.push(pose);
      else if (placement.startsWith("beta")) poses.together.push(pose);
      else poses.adjacent.push(pose);
    }
    return poses;
  }

  begin(pose: PictographData): SequenceData {
    return createSequenceData({
      startPlacement: convertToStartPlacement(pose, this.gridMode),
      steps: [],
      gridMode: this.gridMode,
    });
  }

  addStep(sequence: SequenceData, option: PictographData): SequenceData {
    const step = convertToStep(
      { ...option, id: crypto.randomUUID() },
      sequence.steps.length + 1,
      this.gridMode
    );
    return recalculateAllOrientations({
      ...sequence,
      steps: [...sequence.steps, step],
    });
  }

  /** The form a family would take if the person stopped here. */
  variantAt(sequence: SequenceData, family: LoopFamily): LoopVariant | null {
    if (sequence.steps.length === 0) return null;
    return this.variantForEnd(sequence, family, endOf(sequence));
  }

  /** True when adding this step would let these steps become this LOOP. */
  closesWith(
    sequence: SequenceData,
    family: LoopFamily,
    step: PictographData
  ): boolean {
    return (
      this.variantForEnd(sequence, family, String(step.endPlacement ?? "")) !==
      null
    );
  }

  async loadOptions(sequence: SequenceData): Promise<LoopOption[]> {
    const pictographs = await this.optionLoader.loadOptions(
      path(sequence),
      this.gridMode
    );
    const options = pictographs.map((pictograph) => ({
      pictograph,
      makes: new Set(
        LOOP_FAMILIES.filter(({ id }) =>
          this.variantForEnd(
            sequence,
            id,
            String(pictograph.endPlacement ?? "")
          )
        ).map(({ id }) => id)
      ),
    }));
    // Steps where both hands travel come first: they are the ones a newcomer
    // recognises as a move.
    return options
      .map((option, index) => ({ option, index }))
      .sort(
        (a, b) =>
          rank(a.option.pictograph) - rank(b.option.pictograph) ||
          a.index - b.index
      )
      .map(({ option }) => option);
  }

  /**
   * The LOOP these steps make, or null when they don't end where this kind
   * of LOOP can repeat from.
   */
  async make(
    sequence: SequenceData,
    family: LoopFamily
  ): Promise<MadeLoop | null> {
    const variant = this.variantAt(sequence, family);
    if (!variant) return null;
    const finished = await this.complete(sequence, variant);
    return finished ? this.describe(family, variant, finished, sequence) : null;
  }

  /** A finished LOOP as the grid holds it now, turns changed by hand included. */
  describe(
    family: LoopFamily,
    variant: LoopVariant,
    finished: SequenceData,
    seed: SequenceData
  ): MadeLoop {
    const partLength = seed.steps.length;
    const rows = Math.ceil(finished.steps.length / partLength);
    const changes = Array.from({ length: rows - 1 }, (_, row) =>
      rowChange(
        family,
        locations(finished.steps[row * partLength]),
        locations(finished.steps[(row + 1) * partLength])
      )
    );
    return { family, variant, seed, sequence: finished, partLength, changes };
  }

  /** True when the last step leaves both props exactly where they started. */
  closes(sequence: SequenceData): boolean {
    const start = startPose(sequence);
    const last = sequence.steps.at(-1);
    if (!start || !last || endOf(sequence) !== startOf(sequence)) return false;
    return (["left", "right"] as const).every(
      (hand) =>
        last.motions?.[hand]?.endOrientation ===
        start.motions?.[hand]?.endOrientation
    );
  }

  /** True when this step would come right after the steps so far. */
  follows(sequence: SequenceData, step: PictographData): boolean {
    return String(step.startPlacement ?? "") === endOf(sequence);
  }

  private variantForEnd(
    sequence: SequenceData,
    family: LoopFamily,
    end: string
  ): LoopVariant | null {
    return variantFor(family, startOf(sequence), end, (type, pair, period) =>
      this.validator.isLOOPValidForPlacementPair(type, pair, period)
    );
  }

  private async complete(
    sequence: SequenceData,
    variant: LoopVariant
  ): Promise<SequenceData | null> {
    try {
      return await this.extender.extendSequence(sequence, {
        loopType: variant.loopType,
        period: variant.period,
      });
    } catch {
      // The ending is right but this exact run can't close: the engine checks
      // more than placements. To the person that is simply not a LOOP yet.
      return null;
    }
  }
}

// Construct's sequences still carry the start under its older name.
function startPose(sequence: SequenceData) {
  return sequence.startPlacement ?? sequence.startingPlacement;
}

function path(sequence: SequenceData): PictographData[] {
  const start = startPose(sequence);
  return start ? [start, ...sequence.steps] : [...sequence.steps];
}

function startOf(sequence: SequenceData): string {
  return String(startPose(sequence)?.endPlacement ?? "");
}

function endOf(sequence: SequenceData): string {
  return String(sequence.steps.at(-1)?.endPlacement ?? startOf(sequence));
}

function rank(pictograph: PictographData): number {
  const types = [
    pictograph.motions.left?.motionType,
    pictograph.motions.right?.motionType,
  ];
  const travels = types.filter(
    (type) => type === MotionType.PRO || type === MotionType.ANTI
  ).length;
  if (travels === 2) return 0;
  return types.some((type) => type === MotionType.DASH) ? 2 : 1;
}

function locations(step: StepData | undefined): StepLocations | null {
  const left = step?.motions?.left;
  const right = step?.motions?.right;
  if (!left || !right) return null;
  return {
    leftStart: left.startLocation,
    leftEnd: left.endLocation,
    rightStart: right.startLocation,
    rightEnd: right.endLocation,
  };
}

import type { BuilderStep } from "#lib/features/assemble-lab/state/assemble-state.svelte.js";
import { stepToMotion } from "#lib/features/assemble-lab/services/builder-step-converter.js";
import {
  turnValuesForLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import { isSeamlesslyLoopable } from "#lib/shared/foundation/services/sequence-loopability-checker.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

export type BuiltFusePathFailure =
  | "empty"
  | "incomplete"
  | "too-long"
  | "open-location"
  | "open-orientation";

export type BuiltFusePathResult =
  | {
      readonly ok: true;
      readonly sequence: SequenceData;
      readonly solo: SoloPropData;
    }
  | {
      readonly ok: false;
      readonly reason: BuiltFusePathFailure;
      readonly message: string;
    };

function builderTurnValue(value: TurnValue): number {
  return value === "fl" ? -0.5 : value;
}

/** Turn choices for one manually built Fuse step, bounded by the live recipe. */
export function fuseBuilderTurnCounts(
  level: number,
  maxTurnIntensity: number
): readonly number[] {
  if (level <= 1) return [0];
  return turnValuesForLevel(level)
    .filter(
      (value) =>
        value === "fl" ||
        (typeof value === "number" && value <= maxTurnIntensity)
    )
    .map(builderTurnValue);
}

function toSoloStep(step: BuilderStep, gridMode: GridMode): SoloPropStepData {
  const motion = stepToMotion(step, HandSide.LEFT, gridMode);
  return {
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    turns: motion.turns,
    handPath: motion.handPath,
    skewSteps: motion.skewSteps,
    skewDir: motion.skewDir,
    duration: 1,
    ...(motion.prefloatMotionType
      ? { prefloatMotionType: motion.prefloatMotionType }
      : {}),
  };
}

/**
 * Convert Assemble's canonical one-hand builder steps into a Fuse source.
 * Fuse accepts the result only when the selected count and the full start pose
 * close, so playback has no location or orientation jump at the seam.
 */
export function buildFusePathSource({
  steps,
  expectedLength,
  gridMode,
  side,
}: {
  steps: readonly BuilderStep[];
  expectedLength: number;
  gridMode: GridMode;
  side: FuseSide;
}): BuiltFusePathResult {
  if (steps.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: t("fuse_builder_msg_empty"),
    };
  }
  if (steps.length < expectedLength) {
    return {
      ok: false,
      reason: "incomplete",
      message: t(
        expectedLength - steps.length === 1
          ? "fuse_builder_msg_steps_left_one"
          : "fuse_builder_msg_steps_left_other",
        { count: expectedLength - steps.length }
      ),
    };
  }
  if (steps.length > expectedLength) {
    return {
      ok: false,
      reason: "too-long",
      message: t("fuse_builder_msg_too_long", { count: expectedLength }),
    };
  }

  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  if (last.endLocation !== first.startLocation) {
    return {
      ok: false,
      reason: "open-location",
      message: t("fuse_builder_msg_open_location"),
    };
  }
  if (last.endOrientation !== first.startOrientation) {
    return {
      ok: false,
      reason: "open-orientation",
      message: t("fuse_builder_msg_open_orientation"),
    };
  }

  const soloSteps = steps.map((step) => toSoloStep(step, gridMode));
  const label = `${side === "left" ? "Left" : "Right"} built LOOP`;
  const solo = createSoloProp(
    soloSteps,
    first.startLocation,
    first.startOrientation,
    { name: label, notes: "Built in Fuse" }
  );
  const sequence = soloPropToSequence(solo, side);

  if (!isSeamlesslyLoopable(sequence)) {
    return {
      ok: false,
      reason: "open-orientation",
      message: t("fuse_builder_msg_not_closed"),
    };
  }

  return { ok: true, sequence, solo };
}

import {
  buildCustomizeSummary,
  ORIENTATION_SHORT,
} from "$lib/features/create/generate/components/cards/customize-summary";
import type { TurnLevel } from "$lib/shared/create/services/level-turn-values";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type {
  SoloLoopGenerationRecipe,
  SoloLoopTraversalDirection,
} from "../services/solo-loop-generator";
import type { FuseMode } from "../state/fuse-state.svelte";
import type { FuseRule } from "./fuse-rule";
import { fuseRuleMode, fuseTnDModeLabel } from "./fuse-tnd-rule";
import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
import type { FuseRecipeDestination } from "./fuse-recipe-destination";
import { DEFAULT_GENERATION_STYLE } from "$lib/shared/create/domain/generation-style";

const LOCATION_LABELS: Partial<Record<GridLocation, string>> = {
  [GridLocation.NORTH]: "North",
  [GridLocation.EAST]: "East",
  [GridLocation.SOUTH]: "South",
  [GridLocation.WEST]: "West",
  [GridLocation.NORTHEAST]: "Northeast",
  [GridLocation.SOUTHEAST]: "Southeast",
  [GridLocation.SOUTHWEST]: "Southwest",
  [GridLocation.NORTHWEST]: "Northwest",
};

export interface FuseRecipeSummaryInput {
  requestedLength: number;
  generationLevel: TurnLevel;
  maxTurnIntensity: number;
  gridMode: GridMode;
  constraintPreset: SoloLoopGenerationRecipe["constraintPreset"];
  handPathMode: SoloLoopGenerationRecipe["handPathMode"];
  motionTypeFilter: SoloLoopGenerationRecipe["motionTypeFilter"];
  startLocation: GridLocation | null;
  startOrientation: Orientation | null;
  traversalDirection: SoloLoopTraversalDirection | null;
  mode: FuseMode;
  driverSide: FuseSide;
  rule: FuseRule;
}

export type FuseRecipeSummaries = Record<FuseRecipeDestination, string>;

export function buildFuseRecipeSummaries(
  input: FuseRecipeSummaryInput
): FuseRecipeSummaries {
  const style = buildCustomizeSummary(
    {
      constraintPreset: input.constraintPreset,
      handPathMode: input.handPathMode,
      motionTypeFilter: input.motionTypeFilter,
    },
    DEFAULT_GENERATION_STYLE
  );
  const location = input.startLocation
    ? (LOCATION_LABELS[input.startLocation] ?? input.startLocation)
    : "Random";
  const orientation = input.startOrientation
    ? (ORIENTATION_SHORT[input.startOrientation] ?? input.startOrientation)
    : "Random";
  const travel = input.traversalDirection
    ? input.traversalDirection === "clockwise"
      ? "CW"
      : "CCW"
    : "Random";
  const allStartingConditionsRandom =
    input.startLocation === null &&
    input.startOrientation === null &&
    input.traversalDirection === null;
  const driver = input.driverSide === "left" ? "Left" : "Right";
  const follower = input.driverSide === "left" ? "Right" : "Left";
  // The rule is named by the timing and direction it pins, as the Rule card
  // and the follower footer name it; the operations are detail for the editor.
  const transform = fuseTnDModeLabel(fuseRuleMode(input.rule));
  const turnLabel = input.maxTurnIntensity === 1 ? "turn" : "turns";

  return {
    length: `${input.requestedLength} steps`,
    level:
      input.generationLevel === 1
        ? "Level 1 · no turns"
        : `Level ${input.generationLevel} · ≤${input.maxTurnIntensity} ${turnLabel}`,
    grid: input.gridMode === GridMode.BOX ? "Box" : "Diamond",
    style: style.isDefault ? "Default" : style.facts.join(" · "),
    starting: allStartingConditionsRandom
      ? "Random"
      : `${location} · ${orientation} · ${travel}`,
    pairing:
      input.mode === "shuffle"
        ? "Separate"
        : `${driver} → ${transform} → ${follower}`,
  };
}

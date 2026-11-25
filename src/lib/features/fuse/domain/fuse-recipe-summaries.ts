import { ORIENTATION_SHORT } from "#lib/features/create/generate/components/cards/customize-summary.js";
import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type {
  SoloLoopGenerationRecipe,
  SoloLoopTraversalDirection,
} from "../services/solo-loop-generator";
import type {
  GenerationDashChoice,
  GenerationStyleAxis,
} from "#lib/shared/create/domain/generation-style.js";
import {
  GENERATION_DASH_OPTIONS,
  GENERATION_STYLE_OPTIONS,
} from "#lib/shared/create/domain/generation-style-display.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { FuseMode } from "../state/fuse-state.svelte";
import type { FuseRule } from "./fuse-rule";
import {
  FUSE_TND_MODES,
  fuseRuleMode,
  fuseTnDModeLabel,
  type FuseTnDMode,
} from "./fuse-tnd-rule";
import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
import type { FuseRecipeGroup } from "./fuse-recipe-destination";

const LOCATION_SHORT: Partial<Record<GridLocation, string>> = {
  [GridLocation.NORTH]: "N",
  [GridLocation.EAST]: "E",
  [GridLocation.SOUTH]: "S",
  [GridLocation.WEST]: "W",
  [GridLocation.NORTHEAST]: "NE",
  [GridLocation.SOUTHEAST]: "SE",
  [GridLocation.SOUTHWEST]: "SW",
  [GridLocation.NORTHWEST]: "NW",
};

export interface FuseRecipeFactsInput {
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
}

// Getters, so the words follow the language when they are read.
export const FUSE_RECIPE_GROUP_LABELS: Record<FuseRecipeGroup, string> = {
  get path() {
    return t("fuse_recipe_group_path");
  },
  get style() {
    return t("fuse_recipe_group_style");
  },
  get start() {
    return t("fuse_recipe_group_start");
  },
};

/** One setting and its value now. */
export interface FuseRecipeFact {
  name: string;
  value: string;
}

export type FuseRecipeFacts = Record<
  FuseRecipeGroup,
  readonly FuseRecipeFact[]
>;

export interface FusePairingSummaryInput {
  mode: FuseMode;
  driverSide: FuseSide;
  rule: FuseRule;
}

function fusePairingLine(driverSide: FuseSide, mode: FuseTnDMode): string {
  const driver =
    driverSide === "left" ? t("fuse_side_left") : t("fuse_side_right");
  const follower =
    driverSide === "left" ? t("fuse_side_right") : t("fuse_side_left");
  return `${driver} → ${fuseTnDModeLabel(mode)} → ${follower}`;
}

/** Every line a Linked rule can read as: each mode, either side leading. */
export function listFusePairingLines(): string[] {
  return (["left", "right"] as const).flatMap((driverSide) =>
    FUSE_TND_MODES.map((mode) => fusePairingLine(driverSide, mode))
  );
}

/** "Separate", or the Linked rule named by the timing and direction it pins. */
export function buildFusePairingSummary(
  input: FusePairingSummaryInput
): string {
  if (input.mode === "shuffle") return t("fuse_mode_separate");
  return fusePairingLine(input.driverSide, fuseRuleMode(input.rule));
}

function styleLabel(value: GenerationStyleAxis): string {
  return (
    GENERATION_STYLE_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

function dashLabel(filter: FuseRecipeFactsInput["motionTypeFilter"]): string {
  const value: GenerationDashChoice =
    filter === "no-dash" || filter === "prefer-dash" ? filter : "mixed";
  return GENERATION_DASH_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** What each group is set to, under the names its rows carry in the form. */
export function buildFuseRecipeFacts(
  input: FuseRecipeFactsInput
): FuseRecipeFacts {
  return {
    path: [
      {
        name: t("fuse_recipe_fact_length"),
        value: String(input.requestedLength),
      },
      {
        name: t("fuse_recipe_fact_level"),
        value: String(input.generationLevel),
      },
      {
        name: t("fuse_recipe_fact_max_turns"),
        value:
          input.generationLevel === 1
            ? t("fuse_none")
            : String(input.maxTurnIntensity),
      },
      {
        name: t("fuse_recipe_fact_grid"),
        value:
          input.gridMode === GridMode.BOX
            ? t("fuse_grid_box")
            : t("fuse_grid_diamond"),
      },
    ],
    style: [
      { name: t("create_ui_props"), value: styleLabel(input.constraintPreset) },
      { name: t("create_ui_hands"), value: styleLabel(input.handPathMode) },
      { name: t("create_ui_dashes"), value: dashLabel(input.motionTypeFilter) },
    ],
    start: [
      {
        name: t("fuse_recipe_fact_start_point"),
        value: input.startLocation
          ? (LOCATION_SHORT[input.startLocation] ?? input.startLocation)
          : t("fuse_any"),
      },
      {
        name: t("fuse_recipe_fact_orientation"),
        value: input.startOrientation
          ? (ORIENTATION_SHORT[input.startOrientation] ??
            input.startOrientation)
          : t("fuse_any"),
      },
      {
        name: t("fuse_recipe_fact_travel"),
        value:
          input.traversalDirection === null
            ? t("fuse_any")
            : input.traversalDirection === "clockwise"
              ? t("fuse_travel_cw")
              : t("fuse_travel_ccw"),
      },
    ],
  };
}

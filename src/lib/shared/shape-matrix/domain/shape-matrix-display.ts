import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { VtgMode } from "../services/shape-matrix-realizations";
import type { Flower } from "./flower-signature";
import { ratioLabel } from "./flower-signature";
import type { TheoryFlower } from "./theory-flower";
import { isFloatRatio, isStationaryRatio } from "./theory-flower";
import { theoryRatioLabel } from "./theory-ratio";
import type { MatrixLabelMode } from "./matrix-turn-band";
import type { TurnValue } from "$lib/shared/create/services/level-turn-values";
import type { TurnLevel } from "$lib/shared/create/services/level-turn-values";

export function localizedLevelDescription(level: TurnLevel): {
  name: string;
  blurb: string;
} {
  switch (level) {
    case 1:
      return {
        name: t("shape_engine_level_1_name"),
        blurb: t("shape_engine_level_1_blurb"),
      };
    case 2:
      return {
        name: t("shape_engine_level_2_name"),
        blurb: t("shape_engine_level_2_blurb"),
      };
    case 3:
      return {
        name: t("shape_engine_level_3_name"),
        blurb: t("shape_engine_level_3_blurb"),
      };
    case 4:
      return {
        name: t("shape_engine_level_4_name"),
        blurb: t("shape_engine_level_4_blurb"),
      };
  }
}

/** Translate the mode's displayed words without changing its canonical code. */
export function localizedModeWords(
  mode: VtgMode,
  short = false
): {
  timing: string;
  direction: string;
} {
  const timing =
    mode[0] === "S"
      ? t("shape_engine_mode_split")
      : mode[0] === "T"
        ? short
          ? t("shape_engine_mode_tog_short")
          : t("shape_engine_mode_together")
        : t("shape_engine_mode_quarter");
  const direction =
    mode[1] === "S"
      ? t("shape_engine_mode_same")
      : short
        ? t("shape_engine_mode_opp_short")
        : t("shape_engine_mode_opposite");
  return { timing, direction };
}

export function localizedElementName(element: string): string {
  switch (element.toLowerCase()) {
    case "water":
      return t("shape_engine_element_water");
    case "earth":
      return t("shape_engine_element_earth");
    case "sun":
      return t("shape_engine_element_sun");
    case "fire":
      return t("shape_engine_element_fire");
    case "air":
      return t("shape_engine_element_air");
    case "moon":
      return t("shape_engine_element_moon");
    default:
      return element.charAt(0).toUpperCase() + element.slice(1);
  }
}

export function localizedModeName(mode: VtgMode): string {
  const words = localizedModeWords(mode);
  return `${words.timing}–${words.direction}`;
}

export function localizedMatrixTurnSpokenLabel(
  turn: TurnValue,
  mode: MatrixLabelMode
): string {
  if (mode === "ratios")
    return t("shape_engine_spoken_ratio", { value: ratioLabel(turn) });
  if (turn === "fl") return t("shape_engine_float");
  return t(
    turn === 1
      ? "shape_engine_spoken_turn_one"
      : "shape_engine_spoken_turn_many",
    { value: turn }
  );
}

function localizedOrientation(ori: string): string {
  return ori === "in"
    ? t("shape_engine_orientation_in")
    : t("shape_engine_orientation_out");
}

export function localizedFlowerLabel(flower: Flower): string {
  const ratio = ratioLabel(flower.turns);
  const orientation = localizedOrientation(flower.ori);
  if (flower.style === "float")
    return t("shape_engine_flower_float", { ratio, orientation });
  const grid =
    flower.grid === "diamond"
      ? t("shape_engine_grid_diamond")
      : t("shape_engine_grid_box");
  return t("shape_engine_flower_label", {
    ratio,
    orientation,
    grid,
    petals: flower.petals,
  });
}

export function localizedTheoryFlowerLabel(flower: TheoryFlower): string {
  const ratio = theoryRatioLabel(flower.ratio);
  if (isStationaryRatio(flower.ratio))
    return t("shape_engine_theory_stationary", { ratio });
  if (isFloatRatio(flower.ratio))
    return t("shape_engine_theory_float", {
      ratio,
      orientation: localizedOrientation(flower.ori),
    });
  const style =
    flower.style === "pro"
      ? t("shape_engine_prospin")
      : t("shape_engine_antispin");
  return t("shape_engine_theory_flower", {
    ratio,
    style,
    orientation: localizedOrientation(flower.ori),
    petals: flower.petals,
  });
}

export function localizedTheoryRatioSpokenLabel(
  handCycles: number,
  propRotations: number
): string {
  const ratio = `${handCycles}:${propRotations}`;
  if (handCycles === 0) return t("shape_engine_theory_stationary", { ratio });
  if (propRotations === 0)
    return t("shape_engine_theory_float_ratio", { ratio });
  return t(
    handCycles === 1
      ? "shape_engine_theory_closes_one"
      : "shape_engine_theory_closes_many",
    { ratio, cycles: handCycles }
  );
}

import { s as t } from "../strings.svelte.js";
import type { PetalAnchor } from "./flower-petal-anchor.js";
import {
  isFloatRatio,
  isStationaryRatio,
  ratioLabel,
  theoryRatioLabel,
  type Flower,
  type MatrixLabelMode,
  type TheoryFlower,
  type TurnLevel,
  type TurnValue,
  type VtgMode,
} from "@tka/shape-domain";

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

/** One system's reading of a flower, its name kept apart from what it says. */
export interface SoloFlowerReading {
  system: string;
  value: string;
}

export interface SoloFlowerDescription {
  /** Which hand is playing alone. */
  hand: string;
  /** The flower's name the way a spinner says it: no system owns these words. */
  headline: string;
  note: string | null;
  /** What the mode word in the headline means; null when none is shown. */
  modeMeaning: string | null;
  /** Turns and spin direction are TKA's. */
  tka: SoloFlowerReading;
  /** The hand:prop ratio is VTG's, never TKA's. */
  vtg: SoloFlowerReading;
}

function soloVtgReading(flower: Flower): SoloFlowerReading {
  return {
    system: t("shape_engine_solo_reading_vtg"),
    value: ratioLabel(flower.turns),
  };
}

function floatOrientationWord(ori: Flower["ori"]): string {
  if (ori === "clock") return t("shape_engine_orientation_clock");
  if (ori === "counter") return t("shape_engine_orientation_counter");
  return localizedOrientation(ori);
}

/**
 * Box and diamond only name a flower with one petal per quarter or three: 8
 * petals point both ways at once, and other counts line up with neither.
 */
function soloMode(
  petals: number,
  anchor: PetalAnchor | null
): { word: string; meaning: string } | null {
  if (!anchor || petals % 4 !== 0 || petals % 8 === 0) return null;
  return anchor === "diagonal"
    ? {
        word: t("shape_engine_grid_box"),
        meaning: t("shape_engine_solo_mode_box"),
      }
    : {
        word: t("shape_engine_grid_diamond"),
        meaning: t("shape_engine_solo_mode_diamond"),
      };
}

/**
 * The grid a flower alone belongs on: a box-mode flower's petals are the box's
 * corners, so it gets the box grid whichever grid its sequence was written on.
 * A flower with no mode word stays on its own grid (null).
 */
export function soloFlowerGrid(
  flower: Flower,
  anchor: PetalAnchor | null
): "box" | "diamond" | null {
  if (!soloMode(flower.petals, anchor)) return null;
  return anchor === "diagonal" ? "box" : "diamond";
}

export function describeSoloFlower(
  flower: Flower,
  hand: "left" | "right",
  anchor: PetalAnchor | null
): SoloFlowerDescription {
  const handWord = t(
    hand === "left"
      ? "shape_engine_solo_hand_left"
      : "shape_engine_solo_hand_right"
  );
  if (flower.style === "float") {
    return {
      hand: handWord,
      headline: t("shape_engine_float"),
      note: t("shape_engine_solo_float_note"),
      modeMeaning: null,
      tka: {
        system: t("shape_engine_solo_reading_tka"),
        value: t("shape_engine_solo_tka_float", {
          orientation: floatOrientationWord(flower.ori),
        }),
      },
      vtg: soloVtgReading(flower),
    };
  }

  const { petals, style } = flower;
  const mode = soloMode(petals, anchor);
  let headline: string;
  if (style === "pro" && petals === 0) {
    headline = t("shape_engine_solo_extension");
  } else if (style === "pro") {
    headline = mode
      ? t("shape_engine_solo_pro_mode", { petals, mode: mode.word })
      : t("shape_engine_solo_pro", { petals });
  } else {
    headline = mode
      ? t("shape_engine_solo_anti_mode", { petals, mode: mode.word })
      : t("shape_engine_solo_anti", { petals });
  }
  return {
    hand: handWord,
    headline,
    note: null,
    modeMeaning: mode?.meaning ?? null,
    tka: {
      system: t("shape_engine_solo_reading_tka"),
      value: t("shape_engine_solo_tka_value", {
        style: t(
          style === "pro" ? "shape_engine_prospin" : "shape_engine_antispin"
        ),
        turns: t(
          flower.turns === 1
            ? "shape_engine_spoken_turn_one"
            : "shape_engine_spoken_turn_many",
          { value: flower.turns }
        ),
      }),
    },
    vtg: soloVtgReading(flower),
  };
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

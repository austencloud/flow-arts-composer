/**
 * Placement Identification Quiz data constants
 */

import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { shuffleArray } from "./shared-types";

export { type PlacementType } from "./shared-types";
import type { PlacementType } from "./shared-types";
// 8-point cardinal+intercardinal union (distinct from the 4-point HandPosition
// in the staff/motion files — see shared-types.ts).
export type HandPosition = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface PlacementQuestion {
  left: HandPosition;
  right: HandPosition;
  gridMode: GridMode;
  type: PlacementType;
}

export interface PlacementTypeInfo {
  symbol: string;
  label: string;
}

export const PLACEMENT_TYPE_INFO: Record<PlacementType, PlacementTypeInfo> = {
  alpha: { symbol: "α", label: "Alpha" },
  beta: { symbol: "β", label: "Beta" },
  gamma: { symbol: "γ", label: "Gamma" },
};

export const ALPHA_PLACEMENTS: { left: HandPosition; right: HandPosition; gridMode: GridMode }[] = [
  { left: "N", right: "S", gridMode: GridMode.DIAMOND },
  { left: "E", right: "W", gridMode: GridMode.DIAMOND },
  { left: "NE", right: "SW", gridMode: GridMode.BOX },
  { left: "NW", right: "SE", gridMode: GridMode.BOX },
];

export const BETA_PLACEMENTS: { left: HandPosition; right: HandPosition; gridMode: GridMode }[] = [
  { left: "N", right: "N", gridMode: GridMode.DIAMOND },
  { left: "E", right: "E", gridMode: GridMode.DIAMOND },
  { left: "S", right: "S", gridMode: GridMode.DIAMOND },
  { left: "NW", right: "NW", gridMode: GridMode.BOX },
];

export const GAMMA_PLACEMENTS: { left: HandPosition; right: HandPosition; gridMode: GridMode }[] = [
  { left: "N", right: "E", gridMode: GridMode.DIAMOND },
  { left: "N", right: "W", gridMode: GridMode.DIAMOND },
  { left: "S", right: "E", gridMode: GridMode.DIAMOND },
  { left: "S", right: "W", gridMode: GridMode.DIAMOND },
  { left: "NE", right: "SE", gridMode: GridMode.BOX },
  { left: "NE", right: "NW", gridMode: GridMode.BOX },
];

export function generatePlacementQuestions(): PlacementQuestion[] {
  const questions: PlacementQuestion[] = [];

  // Add 3 of each type
  for (let i = 0; i < 3; i++) {
    const alphaIdx = Math.floor(Math.random() * ALPHA_PLACEMENTS.length);
    questions.push({ ...ALPHA_PLACEMENTS[alphaIdx]!, type: "alpha" });

    const betaIdx = Math.floor(Math.random() * BETA_PLACEMENTS.length);
    questions.push({ ...BETA_PLACEMENTS[betaIdx]!, type: "beta" });

    const gammaIdx = Math.floor(Math.random() * GAMMA_PLACEMENTS.length);
    questions.push({ ...GAMMA_PLACEMENTS[gammaIdx]!, type: "gamma" });
  }

  // Shuffle (Fisher-Yates; unbiased)
  return shuffleArray(questions);
}

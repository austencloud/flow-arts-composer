import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";

/** The four Kinetic Alphabet levels the matrix can show, in order. */
export const SHAPE_MATRIX_LEVELS: readonly TurnLevel[] = [1, 2, 3, 4];

/** What each level adds, for the level selector's description line. */
export const SHAPE_MATRIX_LEVEL_DESCRIPTIONS: Record<
  TurnLevel,
  { name: string; blurb: string }
> = {
  1: { name: "Base Motions", blurb: "Base paths with zero turns" },
  2: { name: "Whole Turns", blurb: "Adds whole-turn possibilities" },
  3: { name: "Half Turns + Float", blurb: "Adds half turns and Float" },
  4: { name: "Quarter Turns", blurb: "Adds finer quarter-turn increments" },
};

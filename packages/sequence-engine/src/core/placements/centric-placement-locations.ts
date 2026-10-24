/**
 * Centric placements: the 17 placements with a hand at the center point.
 *
 * Each entry is [blue (left) hand location, red (right) hand location].
 * tau1-8 put blue at center with red at N, NE, E, SE, S, SW, W, NW (45° per
 * index, clockwise); tau9-16 are the same with red at center; terra1 has both
 * hands at center.
 *
 * This is the one owner of that numbering. The engine's GridPlacementDeriver,
 * the app's grid-placement-deriver and the Levels lab all read it. The
 * numbering was first written in the app's Levels lab
 * (`level5-placement-data.ts`); see question Q4 in
 * `docs/superpowers/specs/2026-10-22-center-point-beyond-level-3.md`.
 */
export const CENTRIC_PLACEMENT_LOCATIONS: Readonly<
  Record<string, readonly [string, string]>
> = {
  tau1: ["c", "n"],
  tau2: ["c", "ne"],
  tau3: ["c", "e"],
  tau4: ["c", "se"],
  tau5: ["c", "s"],
  tau6: ["c", "sw"],
  tau7: ["c", "w"],
  tau8: ["c", "nw"],
  tau9: ["n", "c"],
  tau10: ["ne", "c"],
  tau11: ["e", "c"],
  tau12: ["se", "c"],
  tau13: ["s", "c"],
  tau14: ["sw", "c"],
  tau15: ["w", "c"],
  tau16: ["nw", "c"],
  terra1: ["c", "c"],
};

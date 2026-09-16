import type { MajorLevel } from "../types/curriculum.js";

export function getLevelConstraints(majorLevel: MajorLevel): string {
  const constraints: string[] = [];

  if (majorLevel >= 1) {
    constraints.push(
      "Level 1 terms: grid, diamond, box, cardinal, intercardinal, alpha, beta, gamma, placement, static, shift, dash, motion, pro, anti, prospin, antispin, orientation, in, out, Type 1-6, pictograph, arrow, sequence, LOOP, reversal"
    );
  }
  if (majorLevel >= 2) {
    constraints.push("Level 2 terms: turn, turn number, 180°, whole turn, orientation swap");
  }
  if (majorLevel >= 3) {
    constraints.push("Level 3 terms: half turn, 90°, non-radial, clock, counter, cw, ccw, float");
  }
  if (majorLevel >= 4) {
    constraints.push("Level 4 terms: interradial, clockIn, clockOut, counterIn, counterOut, quarter turn, 45°, 8-point radial cycle");
  }
  if (majorLevel >= 5) {
    constraints.push("Level 5 terms: skew, skewed, mixed grid, +/-, double skew, zeta, eta, 8-point grid");
  }
  if (majorLevel >= 6) {
    constraints.push("Level 6 terms: center, center point, 9-point grid, centric, hash, half-dash, tau, terra");
  }
  if (majorLevel >= 7) {
    constraints.push("Level 7 terms: conjoined, dual grid, junction point, dash+, dash++, extended dash, inter-grid placement");
  }
  if (majorLevel >= 8) {
    constraints.push("Level 8 terms: plane, wall plane, wheel plane, overhead plane, multi-plane, atomic");
  }
  if (majorLevel >= 9) {
    constraints.push("Level 9 terms: inter-plane, 3D grid point, plane intersection, rubiks cube, cross-plane skew");
  }

  return constraints.join("\n");
}

export function getExplanationGuidance(majorLevel: MajorLevel): string {
  switch (majorLevel) {
    case 1:
      return `The user is at Level 1 (Foundation). They know:
- Grid points and placements (alpha, beta, gamma)
- Motion types (static, shift, dash)
- Rotation directions (pro, anti)
- The 6 letter types
- How to read pictographs
- Sequences and LOOPs

DO NOT use concepts from Level 2+ (turns, half turns, float, skews, etc.).
Focus on the foundational concepts.`;

    case 2:
      return `The user is at Level 2 (Whole Turns). They know all of Level 1 plus:
- Whole-number turns (180° rotations, values 0-3)
- How turns swap orientations (even preserves, odd reverses)
- Turn variations

DO NOT use concepts from Level 3+ (half turns, float, clock/counter, skews, etc.).`;

    case 3:
      return `The user is at Level 3 (Half Turns + Float). They know Levels 1-2 plus:
- Half turns (90° units, values 0.5, 1.5, 2.5)
- Clock/counter orientations
- Float motion type (prop holds absolute spatial angle)
- Expanded placement variations

DO NOT use concepts from Level 4+ (quarter turns, interradials, skews, center point, etc.).`;

    case 4:
      return `The user is at Level 4 (Interradial Orientations). They know Levels 1-3 plus:
- 8 orientations (4 cardinal + 4 interradial)
- Quarter turns producing interradial orientations
- Complete orientation freedom, still on the 4-point grid

DO NOT use concepts from Level 5+ (skewed grid, zeta/eta, center point, conjoined, etc.).`;

    case 5:
      return `The user is at Level 5 (Skewed Grid). They know Levels 1-4 plus:
- 8-point grid (mixing diamond/box)
- Zeta and eta placements
- Skew modifiers (+/-)
- Extended and shortened shift arcs

DO NOT use concepts from Level 6+ (center point, hash, tau/terra, conjoined grids, etc.).`;

    case 6:
      return `The user is at Level 6 (Centric). They know Levels 1-5 plus:
- Center grid point (9-point grid)
- Hash hand path (straight line to/from center)
- Tau and terra placements
- Center orientations (compass-based, absolute rather than center-relative)

DO NOT use concepts from Level 7+ (conjoined grids, extended dashes, 3D, etc.).`;

    case 7:
      return `The user is at Level 7 (Conjoined Grids). They know all 2D concepts:
- All previous levels (complete orientation freedom)
- Dual grids sharing a junction point
- Extended dashes (dash+, dash++)
- Inter-grid placements and cross-grid paths

DO NOT use concepts from Level 8+ (3D planes, atomics, etc.).`;

    case 8:
      return `The user is at Level 8 (Atomics). They know all 2D + basic 3D:
- All previous levels (complete 2D)
- Spinning planes (wall, wheel, overhead)
- Multi-plane patterns

DO NOT use concepts from Level 9 (Rubik's cube / cross-plane skews).`;

    case 9:
      return `The user is at Level 9 (Rubik's Cube). They know ALL TKA concepts:
- All previous levels
- Inter-plane grid points
- 3D skewed placements
- Complete 3D mastery

You can use any TKA terminology.`;
  }
}

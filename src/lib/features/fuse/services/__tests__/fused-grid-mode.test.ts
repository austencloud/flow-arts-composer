/**
 * Fused grid-mode resolution.
 *
 * The combined sequence's `gridMode` is the frame the pair lives in. Which
 * source the caller passes as `left` is a hand assignment, not a frame, so the
 * resolution must be symmetric — and it must agree with the canonical
 * classifiers (`grid-mode-deriver` for motions, `hand-path-factory` for paths)
 * about what "skewed" and "centric" mean.
 *
 * The old table only knew the diamond+box pair and otherwise fell through to
 * the LEFT source's frame, so a skewed source read as diamond when it arrived
 * on the right and as skewed when it arrived on the left.
 */
import { describe, it, expect } from "vitest";
import { fuseSequences } from "../sequence-fuser";
import { createSoloProp } from "$lib/shared/foundation/services/solo-prop-factory";
import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
import type { SoloPropData } from "$lib/shared/foundation/domain/models/solo-prop-data";
import type { SoloPropStepData } from "$lib/shared/foundation/domain/models/solo-prop-step-data";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/** Build a closed path from a ring of locations (last entry re-enters the first). */
function ringSolo(ring: readonly GridLocation[]): SoloPropData {
  const steps: SoloPropStepData[] = ring.map((start, index) => ({
    startLocation: start,
    endLocation: ring[(index + 1) % ring.length]!,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    duration: 1,
  }));
  return createSoloProp(steps, ring[0]!, Orientation.IN);
}

const { NORTH, EAST, SOUTH, WEST } = GridLocation;
const { NORTHEAST, SOUTHEAST, SOUTHWEST, NORTHWEST } = GridLocation;

// Eight steps each, so the fuse tiles 1:1 and only the frames differ.
const DIAMOND_RING = [NORTH, EAST, SOUTH, WEST, NORTH, EAST, SOUTH, WEST];
const BOX_RING = [
  NORTHEAST,
  SOUTHEAST,
  SOUTHWEST,
  NORTHWEST,
  NORTHEAST,
  SOUTHEAST,
  SOUTHWEST,
  NORTHWEST,
];
const SKEWED_RING = [
  NORTH,
  NORTHEAST,
  EAST,
  SOUTHEAST,
  SOUTH,
  SOUTHWEST,
  WEST,
  NORTHWEST,
];
const CENTRIC_RING = [
  NORTH,
  GridLocation.CENTER,
  EAST,
  GridLocation.CENTER,
  SOUTH,
  GridLocation.CENTER,
  WEST,
  GridLocation.CENTER,
];

describe("fused grid mode", () => {
  it("reads the sources as the frames the canonical path factory assigns", () => {
    expect(ringSolo(DIAMOND_RING).impliedGridMode).toBe(GridMode.DIAMOND);
    expect(ringSolo(BOX_RING).impliedGridMode).toBe(GridMode.BOX);
    expect(ringSolo(SKEWED_RING).impliedGridMode).toBe(GridMode.SKEWED);
    expect(ringSolo(CENTRIC_RING).impliedGridMode).toBe(GridMode.CENTRIC);
  });

  it("does not depend on which source is passed as the left hand", () => {
    const pairs: readonly [GridLocation[], GridLocation[]][] = [
      [DIAMOND_RING, SKEWED_RING],
      [BOX_RING, SKEWED_RING],
      [DIAMOND_RING, BOX_RING],
      [DIAMOND_RING, CENTRIC_RING],
    ];

    for (const [a, b] of pairs) {
      const forward = fuseSequences(ringSolo(a), ringSolo(b)).gridMode;
      const reverse = fuseSequences(ringSolo(b), ringSolo(a)).gridMode;
      expect(forward).toBe(reverse);
    }
  });

  it("calls a skewed source's pairing skewed from either side", () => {
    expect(
      fuseSequences(ringSolo(DIAMOND_RING), ringSolo(SKEWED_RING)).gridMode
    ).toBe(GridMode.SKEWED);
    expect(
      fuseSequences(ringSolo(SKEWED_RING), ringSolo(DIAMOND_RING)).gridMode
    ).toBe(GridMode.SKEWED);
    expect(
      fuseSequences(ringSolo(BOX_RING), ringSolo(SKEWED_RING)).gridMode
    ).toBe(GridMode.SKEWED);
  });

  it("keeps matching frames and a center-touching frame intact", () => {
    expect(
      fuseSequences(ringSolo(DIAMOND_RING), ringSolo(DIAMOND_RING)).gridMode
    ).toBe(GridMode.DIAMOND);
    expect(fuseSequences(ringSolo(BOX_RING), ringSolo(BOX_RING)).gridMode).toBe(
      GridMode.BOX
    );
    expect(
      fuseSequences(ringSolo(DIAMOND_RING), ringSolo(CENTRIC_RING)).gridMode
    ).toBe(GridMode.CENTRIC);
  });

  it("agrees with the canonical motion deriver on a diamond/box pairing", () => {
    const fused = fuseSequences(ringSolo(DIAMOND_RING), ringSolo(BOX_RING));
    const perStep = fused.steps.map((step) =>
      deriveGridMode(step.motions.left!, step.motions.right!)
    );

    expect(new Set(perStep)).toEqual(new Set([GridMode.SKEWED]));
    expect(fused.gridMode).toBe(GridMode.SKEWED);
  });
});

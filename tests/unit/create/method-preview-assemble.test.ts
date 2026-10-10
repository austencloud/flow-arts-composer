/**
 * The Create front door's Assemble preview: the hops come from Assemble's own
 * sequence loader, the crop keeps every grid point whole, and the finger's
 * taps land on Assemble's own hit targets. The beats fit four taps and the
 * last hop into a turn.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveBuilderMotionGeometry } from "#lib/features/assemble-lab/services/builder-motion-geometry.js";
import { BUILDER_HOP_MS } from "#lib/features/assemble-lab/services/svg-prop-animator.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { METHOD_PREVIEW_TIMING } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
import {
  ASSEMBLE_CROP,
  ASSEMBLE_STEPS,
  ASSEMBLE_VIEW_BOX,
  assembleHops,
  assemblePoint,
  standingHop,
} from "#lib/features/create/shared/components/method-previews/method-preview-assemble.js";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import { SCENE_TAP } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";

/** The attract ghost's shortest glide (attract-ghost.svelte.ts). */
const SHORTEST_GLIDE_MS = 300;

function at(x: number, y: number, size: number) {
  return { x, y, size };
}

function expectPoint(
  point: { x: number; y: number } | null,
  x: number,
  y: number
): void {
  expect(point).not.toBeNull();
  expect(point?.x).toBeCloseTo(x, 2);
  expect(point?.y).toBeCloseTo(y, 2);
}

describe("Assemble preview hops", () => {
  it("are the demo's N and M steps, blue then red", () => {
    expect(assembleHops(DEMO_SEQUENCE, HandSide.LEFT)).toEqual([
      {
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.NORTH,
        rotationDirection: RotationDirection.CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
      {
        startLocation: GridLocation.NORTH,
        endLocation: GridLocation.EAST,
        rotationDirection: RotationDirection.CLOCKWISE,
        turnCount: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
    ]);
    expect(assembleHops(DEMO_SEQUENCE, HandSide.RIGHT)).toEqual([
      {
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
      },
      {
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.SOUTH,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turnCount: 1,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.OUT,
      },
    ]);
  });

  it("bring blue back to the pose it started in, so the ghost starts where blue ended", () => {
    const [first, last] = assembleHops(DEMO_SEQUENCE, HandSide.LEFT);
    expect(last?.endLocation).toBe(first?.startLocation);
    expect(last?.endOrientation).toBe(first?.startOrientation);
  });

  it("read a float the way Assemble does", () => {
    const floated: SequenceData = {
      ...DEMO_SEQUENCE,
      steps: DEMO_SEQUENCE.steps.map((step, index) => {
        const left = step.motions[HandSide.LEFT];
        if (index !== ASSEMBLE_STEPS.from || !left) return step;
        return {
          ...step,
          motions: {
            ...step.motions,
            [HandSide.LEFT]: { ...left, turns: "fl" as const },
          },
        };
      }),
    };
    expect(assembleHops(floated, HandSide.LEFT)[0]?.turnCount).toBe(-0.5);
  });

  it("can stand a prop on its start pose", () => {
    const [first] = assembleHops(DEMO_SEQUENCE, HandSide.RIGHT);
    expect(first).toBeDefined();
    const hop = standingHop(first!);
    expect(hop).toMatchObject({
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
      turnCount: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
    });
    const geometry = deriveBuilderMotionGeometry(
      hop.startLocation,
      hop.endLocation,
      hop.startOrientation,
      hop.rotationDirection,
      hop.turnCount
    );
    expect(geometry.isSamePoint).toBe(true);
    expect(geometry.staffRotationDelta).toBeCloseTo(0);
  });
});

describe("Assemble preview grid", () => {
  it("crops to the grid with every point whole", () => {
    expect(ASSEMBLE_VIEW_BOX).toBe("135 135 680 680");
    const svg = readFileSync(
      resolve(process.cwd(), "static/images/grid/diamond_grid.svg"),
      "utf8"
    );
    const circles = [...svg.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => {
      const read = (name: string) =>
        Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);
      return { cx: read("cx"), cy: read("cy"), r: read("r") };
    });
    expect(circles.length).toBeGreaterThan(0);
    const low = ASSEMBLE_CROP.origin;
    const high = ASSEMBLE_CROP.origin + ASSEMBLE_CROP.size;
    for (const { cx, cy, r } of circles) {
      expect(Math.min(cx, cy) - r).toBeGreaterThanOrEqual(low);
      expect(Math.max(cx, cy) + r).toBeLessThanOrEqual(high);
    }
  });

  it("places Assemble's points in the card", () => {
    const square = at(0, 0, 200);
    expectPoint(assemblePoint(square, GridLocation.NORTH), 100, 57.91);
    expectPoint(assemblePoint(square, GridLocation.EAST), 142.09, 100);
    expectPoint(assemblePoint(square, GridLocation.SOUTH), 100, 142.09);
    expectPoint(assemblePoint(square, GridLocation.WEST), 57.91, 100);
    expectPoint(assemblePoint(at(49, 0, 48), GridLocation.NORTH), 73, 13.9);
  });

  it("has no point the diamond lacks", () => {
    expect(assemblePoint(at(0, 0, 200), GridLocation.NORTHEAST)).toBeNull();
  });
});

describe("Assemble preview beats", () => {
  it("lets each hop land before the finger presses again", () => {
    expect(SHORTEST_GLIDE_MS + SCENE_TAP.considerMs).toBeGreaterThanOrEqual(
      BUILDER_HOP_MS
    );
  });

  it("fits four taps and the last hop in a turn, with room for slower glides", () => {
    const tap = SHORTEST_GLIDE_MS + SCENE_TAP.considerMs + SCENE_TAP.pressMs;
    expect(4 * tap + BUILDER_HOP_MS).toBeLessThanOrEqual(
      METHOD_PREVIEW_TIMING.turnMs - 300
    );
  });
});

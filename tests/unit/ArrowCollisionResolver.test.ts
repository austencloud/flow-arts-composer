/**
 * ArrowCollisionResolver Tests
 *
 * When two hands end at the same grid location, their arrows visually stack
 * and become unreadable. A wrong offset direction or a missed collision would
 * be silent — the card would just look broken. These tests lock in the
 * detector's behavior for both collision and non-collision cases, and for
 * the diagonal offset logic that fans colliding arrows apart.
 */

import { describe, it, expect } from "vitest";
import { resolveCollisions } from "#lib/features/choreo-card/services/arrow-collision-resolver.js";
import { buildFromTrace } from "#lib/features/choreo-card/services/hand-path-data-builder.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { HandPathTrace } from "#lib/features/choreo-card/services/contracts/IHandPathDataBuilder";

const { N, E, S, W } = {
  N: GridLocation.NORTH,
  E: GridLocation.EAST,
  S: GridLocation.SOUTH,
  W: GridLocation.WEST,
};

describe("ArrowCollisionResolver", () => {
  it("does not modify beats where arrows end at different locations", () => {
    const trace: HandPathTrace = {
      left: [N, E, E, S, S, W, W, N, N],
      right:  [S, W, W, N, N, E, E, S, S],
    };
    const beats = buildFromTrace(trace);
    const resolved = resolveCollisions(beats);

    for (const beat of resolved) {
      expect(beat.motions.left!.arrowPlacementData.manualAdjustmentX).toBe(0);
      expect(beat.motions.left!.arrowPlacementData.manualAdjustmentY).toBe(0);
      expect(beat.motions.right!.arrowPlacementData.manualAdjustmentX).toBe(0);
      expect(beat.motions.right!.arrowPlacementData.manualAdjustmentY).toBe(0);
    }
  });

  it("applies opposite offsets when both arrows end at same location", () => {
    const trace: HandPathTrace = {
      left: [N, E, N, E, N, E, N, E, N],
      right:  [N, E, N, E, N, E, N, E, N],
    };
    const beats = buildFromTrace(trace);
    const resolved = resolveCollisions(beats);

    const b = resolved[0].motions.left!.arrowPlacementData;
    const r = resolved[0].motions.right!.arrowPlacementData;

    // Offsets must be symmetric: blue and red sum to zero on each axis.
    // Use addition rather than negation to avoid IEEE 754 negative-zero
    // comparisons (Object.is treats 0 and -0 as different values).
    expect((b.manualAdjustmentX ?? 0) + (r.manualAdjustmentX ?? 0)).toBe(0);
    expect((b.manualAdjustmentY ?? 0) + (r.manualAdjustmentY ?? 0)).toBe(0);
    expect(b.manualAdjustmentX).not.toBe(0);
  });

  it("pushes diagonally for cardinal collisions", () => {
    const trace: HandPathTrace = {
      left: [N, N, N, N, N, N, N, N, N],
      right:  [N, N, N, N, N, N, N, N, N],
    };
    const beats = buildFromTrace(trace);
    const resolved = resolveCollisions(beats);

    const b = resolved[0].motions.left!.arrowPlacementData;
    // Cardinals now push diagonally — both axes get an offset
    expect(b.manualAdjustmentX).not.toBe(0);
    expect(b.manualAdjustmentY).not.toBe(0);
    expect(b.manualAdjustmentY).toBeLessThan(0); // outward component = up = negative Y
  });

  it("handles alternating collision pattern from real deck data", () => {
    // HP #17: collides on even beats
    const trace: HandPathTrace = {
      left: [S, S, W, W, N, N, E, E, S],
      right:  [S, W, W, N, N, E, E, S, S],
    };
    const beats = buildFromTrace(trace);
    const resolved = resolveCollisions(beats);

    // Beat 0: blue S→S, red S→W — different endLocations — no collision
    expect(resolved[0].motions.left!.arrowPlacementData.manualAdjustmentX).toBe(0);

    // Beat 1: blue S→W, red W→W — both end at W — collision!
    expect(resolved[1].motions.left!.arrowPlacementData.manualAdjustmentX).not.toBe(0);

    // Beat 3: blue W→N, red N→N — both end at N — collision!
    expect(resolved[3].motions.left!.arrowPlacementData.manualAdjustmentY).not.toBe(0);
  });
});

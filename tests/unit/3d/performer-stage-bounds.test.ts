import { describe, expect, it } from "vitest";

import {
  createStageBoundsStabilizer,
  getAddedPerformerStageGrowth,
  getCanonicalPerformerStageBounds,
  getCanonicalStagePositions,
  getStageBoundsForExtent,
  resolveCircularStageRadius,
} from "#lib/shared/3d/environments/domain/performer-stage-bounds.js";

const boundsFor = (count: number) =>
  getCanonicalPerformerStageBounds(count, {
    performerClearance: 1.5,
  });

describe("stage bounds", () => {
  it("does not move while the cast walks", () => {
    // The reported bug: the deck was measured from live positions, so it grew
    // as a formation opened out and shrank as it closed. Three performers are
    // three performers wherever they are standing.
    const holding = boundsFor(3);
    const walking = boundsFor(3);

    expect(walking).toEqual(holding);
  });

  it("holds every formation a cast of that size can be asked to form", () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { width, depth } = boundsFor(count);
      for (const spot of getCanonicalStagePositions(count)) {
        expect(Math.abs(spot.x)).toBeLessThanOrEqual(width / 2);
        expect(Math.abs(spot.z)).toBeLessThanOrEqual(depth / 2);
      }
    }
  });

  it("grows at every edge whenever a performer is added", () => {
    let previous = boundsFor(1);
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const bounds = boundsFor(count);
      if (count > 1) {
        expect(bounds.width).toBeGreaterThan(previous.width);
        expect(bounds.depth).toBeGreaterThan(previous.depth);
        expect(bounds.radius).toBeGreaterThan(previous.radius);
      }
      previous = bounds;
    }
  });

  it("adds cast growth above a circular scene's authored solo radius", () => {
    const duo = boundsFor(2);
    const authoredSoloRadius = 5;

    expect(
      resolveCircularStageRadius(
        duo.radius,
        authoredSoloRadius,
        undefined,
        getAddedPerformerStageGrowth(2)
      )
    ).toBeGreaterThan(authoredSoloRadius);
    expect(resolveCircularStageRadius(duo.radius, authoredSoloRadius)).toBe(
      authoredSoloRadius
    );
    expect(getAddedPerformerStageGrowth(3)).toBe(
      getAddedPerformerStageGrowth(2) * 2
    );
  });

  it("keeps a floor under a solo performer", () => {
    // A single performer standing on the origin must not collapse the deck to
    // a disc the width of their own clearance.
    expect(boundsFor(1).width).toBeGreaterThanOrEqual(6);
    expect(boundsFor(0).width).toBeGreaterThanOrEqual(6);
  });

  it("uses an authored stage as given, corners included", () => {
    // The Stage draws a 10x8 floor on its drill chart and clamps every spot to
    // it. The deck is that floor — not that floor plus room to grow.
    const bounds = getStageBoundsForExtent({ width: 10, depth: 8 });

    expect(bounds.width).toBe(10);
    expect(bounds.depth).toBe(8);
    // A circular deck still has to carry a performer standing in a corner.
    expect(bounds.radius).toBeCloseTo(Math.hypot(5, 4), 6);
  });
});

describe("stage bounds stabilizer", () => {
  // The reported bug: during playback, per-frame prop invalidation re-ran the
  // viewer's stage-bounds derived every frame. The values never changed, but
  // each run returned a fresh object, so every consumer downstream — including
  // Threlte geometry args — saw a "new" stage and rebuilt ~29 BoxGeometries
  // per frame, leaking ~1,700 GL buffers a second and dragging playback to
  // ~18fps. The stabilizer hands back the previous object when nothing
  // actually changed, restoring identity-level equality for the whole chain.
  it("returns the same reference for equal-valued fresh bounds", () => {
    const stabilize = createStageBoundsStabilizer();
    const first = stabilize(getCanonicalPerformerStageBounds(2));
    const second = stabilize(getCanonicalPerformerStageBounds(2));

    expect(second).toBe(first);
  });

  it("passes through a genuinely changed deck", () => {
    const stabilize = createStageBoundsStabilizer();
    const duo = stabilize(getCanonicalPerformerStageBounds(2));
    const trio = stabilize(getCanonicalPerformerStageBounds(3));

    expect(trio).not.toBe(duo);
    expect(trio.width).toBeGreaterThan(duo.width);
    // And the new deck becomes the stable reference in turn.
    expect(stabilize(getCanonicalPerformerStageBounds(3))).toBe(trio);
  });
});

/**
 * Cat dog puts a different prop in each hand, and a mixed pair (staff and
 * bigstaff, say) has two different reaches. The Theory tiles must trace each
 * hand's own reach, the same way the live stage beside them does (see
 * ShapeMatrixTheoryDetail's per-hand `data.reach`). A shared reach drew the
 * short-reach hand's shape as if it held the long prop.
 */
import { describe, expect, it } from "vitest";
import { makeSpinRatio } from "@vtg/domain";
import type { TheoryFlower } from "$lib/shared/shape-matrix/domain/theory-flower";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import type { ShapeMatrixArtworkPainter } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
import {
  theoryCellArtworkSrc,
  theoryHeaderArtworkSrc,
} from "$lib/shared/shape-matrix/services/theory-matrix-artwork";

const leftFlower: TheoryFlower = {
  ratio: makeSpinRatio(3, 2),
  style: "pro",
  ori: "in",
  petals: 1,
};

const rightFlower: TheoryFlower = {
  ratio: makeSpinRatio(1, 4),
  style: "anti",
  ori: "out",
  petals: 1,
};

/**
 * Records what it was asked to paint instead of drawing anything, so a test
 * can inspect the exact geometry and scale each call received. Each stub
 * gets its own cache key so its rasters never collide with another test's in
 * the module's shared raster cache.
 */
function stubPainter(cacheKey: string) {
  const cellCalls: Array<{
    left: MandalaPaths;
    right: MandalaPaths;
    sizePx: number;
    scale: number;
  }> = [];
  const headerCalls: Array<{
    paths: MandalaPaths;
    hand: "left" | "right";
    sizePx: number;
    scale: number;
  }> = [];
  let count = 0;
  const painter: ShapeMatrixArtworkPainter = {
    cell: (left, right, sizePx, scale) => {
      cellCalls.push({ left, right, sizePx, scale });
      count += 1;
      return `${cacheKey}-cell-${count}`;
    },
    header: (paths, hand, sizePx, scale) => {
      headerCalls.push({ paths, hand, sizePx, scale });
      count += 1;
      return `${cacheKey}-header-${count}`;
    },
    cacheKey,
  };
  return { painter, cellCalls, headerCalls };
}

describe("theory matrix artwork", () => {
  it("traces each hand's cell geometry at its own reach, not the pair's larger one", () => {
    const mixed = stubPainter("mixed-cell");
    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 126, right: 300 },
      300,
      64,
      mixed.painter
    );

    const bothShort = stubPainter("both-short-cell");
    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 126, right: 126 },
      126,
      64,
      bothShort.painter
    );

    const bothLong = stubPainter("both-long-cell");
    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 300, right: 300 },
      300,
      64,
      bothLong.painter
    );

    const mixedLeftPath = mixed.cellCalls[0]?.left;
    const shortLeftPath = bothShort.cellCalls[0]?.left;
    const longLeftPath = bothLong.cellCalls[0]?.left;

    // The mixed pair's left hand (reach 126) draws the same shape as a
    // single-prop matrix built entirely at 126.
    expect(mixedLeftPath).toEqual(shortLeftPath);
    // It does not draw the shape a 300-reach hand would.
    expect(mixedLeftPath).not.toEqual(longLeftPath);
  });

  it("keys the header raster cache on reach, so a reach change repaints", () => {
    const { painter, headerCalls } = stubPainter("header-reach-cache");

    theoryHeaderArtworkSrc(leftFlower, "left", 126, 126, 64, painter);
    theoryHeaderArtworkSrc(leftFlower, "left", 300, 300, 64, painter);

    expect(headerCalls).toHaveLength(2);
    expect(headerCalls[0]?.scale).toBe(126);
    expect(headerCalls[1]?.scale).toBe(300);

    // The same request again is a cache hit, not a third paint call.
    theoryHeaderArtworkSrc(leftFlower, "left", 126, 126, 64, painter);
    expect(headerCalls).toHaveLength(2);
  });
});

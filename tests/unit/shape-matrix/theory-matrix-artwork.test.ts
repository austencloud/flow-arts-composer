/**
 * Cat dog puts a different prop in each hand, and a mixed pair (staff and
 * bigstaff, say) has two different reaches. The Theory tiles must trace each
 * hand's own reach, the same way the live stage beside them does (see
 * ShapeMatrixTheoryDetail's per-hand `data.reach`). A shared reach drew the
 * short-reach hand's shape as if it held the long prop.
 */
import { describe, expect, it } from "vitest";
import { makeSpinRatio } from "@vtg/domain";
import {
  theoryKnobs,
  traceScaledPath,
  type TheoryFlower,
  type VtgMode,
} from "@tka/shape-domain";
import { MANDALA_GRID_RADIUS } from "#lib/shared/mandala/domain/mandala-constants.js";
import { mandalaGuideScale } from "#lib/shared/mandala/services/mandala-guide-image.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import type { ShapeMatrixArtworkPainter } from "@tka/shape-engine/services/shape-matrix-artwork.js";
import {
  THEORY_STAGE_VIEW,
  theoryCellArtworkSrc,
  theoryHeaderArtworkSrc,
  theoryStageExtentBoxRatio,
  theoryStagePaths,
} from "@tka/shape-engine/services/theory-matrix-artwork.js";

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
    // `scale` stays the pair's larger reach regardless of which hand traces
    // at which reach: it only ever fits the cell to the canvas, it never
    // feeds the geometry.
    expect(mixed.cellCalls[0]?.scale).toBe(300);
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

  it("keys the cell raster cache on each hand's reach, so a reach change repaints", () => {
    const { painter, cellCalls } = stubPainter("cell-reach-cache");

    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 126, right: 126 },
      126,
      64,
      painter
    );
    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 300, right: 300 },
      300,
      64,
      painter
    );

    expect(cellCalls).toHaveLength(2);
    expect(cellCalls[0]?.scale).toBe(126);
    expect(cellCalls[1]?.scale).toBe(300);

    // The same request again is a cache hit, not a third paint call.
    theoryCellArtworkSrc(
      leftFlower,
      rightFlower,
      { left: 126, right: 126 },
      126,
      64,
      painter
    );
    expect(cellCalls).toHaveLength(2);
  });
});

describe("the Ratio Playground stage's still", () => {
  /** The live stage's guide for one hand of a pairing, in stage units. */
  function stageGuide(
    flower: TheoryFlower,
    hand: "left" | "right",
    mode: VtgMode,
    reachInHandRadii: number
  ) {
    return traceScaledPath(theoryKnobs(flower, hand, mode), {
      hand: 1,
      prop: reachInHandRadii,
    });
  }

  it("is the paired guide the canvas draws, one hand per side", () => {
    const left = stageGuide(leftFlower, "left", "TO", 0.84);
    const right = stageGuide(rightFlower, "right", "TO", 0.84);
    const paths = theoryStagePaths([
      { side: "left", guide: left },
      { side: "right", guide: right },
      { side: "right", guide: null },
    ]);

    expect(paths.left).toHaveLength(1);
    expect(paths.right).toHaveLength(1);
    const [x, y] = paths.right[0]!.d.slice(1).split(" ")[0]!.split(",");
    expect(Number(x)).toBeCloseTo(right[0]!.x * MANDALA_GRID_RADIUS, 1);
    expect(Number(y)).toBeCloseTo(right[0]!.y * MANDALA_GRID_RADIUS, 1);
  });

  it("puts every guide point on the pixel the live canvas draws it at", () => {
    // A staff, and a long prop whose path runs past the standard extent, so
    // both of the extent fit's branches are exercised.
    for (const reach of [0.84, 1.9]) {
      const guides = [
        {
          side: "left" as const,
          guide: stageGuide(leftFlower, "left", "QS", reach),
        },
        {
          side: "right" as const,
          guide: stageGuide(rightFlower, "right", "QS", reach),
        },
      ];
      const paths = theoryStagePaths(guides);
      const tipDx = 126;
      for (const square of [212, 360, 731]) {
        // The still: an extent-fit raster in a box `ratio` of the square,
        // centred in it, which is how MandalaHeroLayer lays it out.
        const box = square * theoryStageExtentBoxRatio(paths, tipDx);
        const stillScale = mandalaGuideScale(paths, {
          size: box,
          fit: "extent",
          show: "both",
          tipDx,
        });
        // The live stage: the square's side is 2 * THEORY_STAGE_VIEW units.
        const liveScale = square / (2 * THEORY_STAGE_VIEW);
        for (const { guide } of guides) {
          for (const point of [
            guide[0]!,
            guide[Math.floor(guide.length / 3)]!,
          ]) {
            expect(point.x * MANDALA_GRID_RADIUS * stillScale).toBeCloseTo(
              point.x * liveScale,
              6
            );
            expect(point.y * MANDALA_GRID_RADIUS * stillScale).toBeCloseTo(
              point.y * liveScale,
              6
            );
          }
        }
      }
    }
  });
});

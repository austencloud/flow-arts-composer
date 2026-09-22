/**
 * Theory tiles, painted by the Shape Matrix's own painter.
 *
 * The Matrix builds its geometry by realizing a flower as a real TKA sequence
 * and running it through the mandala calculator. A ratio like 4:9 has no
 * sequence to realize — that is the entire reason the Theory surface exists —
 * so its geometry comes from the QfT model instead.
 *
 * Everything downstream of the path stays shared: the grid's own
 * `ShapeMatrixArtworkPainter`, the same hand colours (the account's, when it
 * has saved a pair), the same 2.5px stroke, the same purple overlap, the same
 * extent fit. A Theory tile is a Matrix tile whose curve was computed a
 * different way, which is the point.
 *
 * Each hand is drawn in its own frame, with no pairing in it. That is the
 * Matrix's rule too: a tile is the blue hand's shape against the red hand's,
 * and timing and direction belong to the realization chosen beside the
 * animation rather than to the shape.
 */
import type {
  MandalaPaths,
  SVGPathData,
} from "$lib/shared/mandala/domain/mandala-types";
import {
  ENGINE_GRID_RADIUS,
  MANDALA_GRID_RADIUS,
} from "$lib/shared/mandala/domain/mandala-constants";
import { traceScaledPath } from "$lib/shared/notation/qft/qft-model";
import {
  CLUB_ARTWORK_PAINTER,
  type ShapeMatrixArtworkPainter,
} from "./shape-matrix-artwork";
import {
  theoryFlowerKey,
  theorySoloKnobs,
  type TheoryFlower,
} from "../domain/theory-flower";

/**
 * A path that never leaves one point is not a path. The 1:1 prospin isolation
 * collapses to the axis of rotation exactly, and a zero-length polyline is
 * dropped by the painter's degenerate-path guard — so the still point is drawn
 * as a small disc instead, the same fact the index thumbnails show.
 */
const STILL_POINT_SPAN = 0.5;
const STILL_POINT_RADIUS = MANDALA_GRID_RADIUS * 0.055;

/**
 * How far the prop reaches, measured in hand-orbit radii.
 *
 * The engine puts a hand point at `ENGINE_GRID_RADIUS` and the prop's tracked
 * tip `reach` out from it, so this ratio is the one thing a drawing needs
 * to place a prop against a hand at any scale. A staff reads about 0.84, not
 * 1: the tip stops short of the outer grid point rather than landing on it.
 * `reach` is this hand's own reach, not necessarily the pair's larger one —
 * cat dog draws each hand's prop at its own length.
 */
export function propReachInHandRadii(reach: number): number {
  return reach / ENGINE_GRID_RADIUS;
}

function propReachFor(reach: number): number {
  return MANDALA_GRID_RADIUS * propReachInHandRadii(reach);
}

function traceFlower(
  flower: TheoryFlower,
  reach: number
): Array<{ x: number; y: number }> {
  // The two radii are separate so the drawing carries the real prop reach of
  // the selected prop, the same one the Matrix tiles are drawn at.
  return traceScaledPath(theorySoloKnobs(flower), {
    hand: MANDALA_GRID_RADIUS,
    prop: propReachFor(reach),
  });
}

function toPathData(points: Array<{ x: number; y: number }>): SVGPathData[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (Math.max(maxX - minX, maxY - minY) < STILL_POINT_SPAN) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const r = STILL_POINT_RADIUS;
    return [
      {
        d:
          `M${(cx - r).toFixed(2)},${cy.toFixed(2)} ` +
          `a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(r * 2).toFixed(2)},0 ` +
          `a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(-r * 2).toFixed(2)},0 Z`,
        tipIndex: 0,
      },
    ];
  }

  const d = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`
    )
    .join(" ");
  return [{ d, tipIndex: 0 }];
}

export function theoryFlowerPaths(
  flower: TheoryFlower,
  hand: "left" | "right",
  reach: number
): MandalaPaths {
  const traced = toPathData(traceFlower(flower, reach));
  return hand === "left"
    ? { left: traced, right: [], purple: [] }
    : { left: [], right: traced, purple: [] };
}

/** Rasters are per size and DPR; keep the recent ones, drop the rest. */
const ARTWORK_CACHE_LIMIT = 512;
const artwork = new Map<string, string>();
const geometry = new Map<string, MandalaPaths>();

function remember(key: string, paint: () => string): string {
  const hit = artwork.get(key);
  if (hit !== undefined) {
    artwork.delete(key);
    artwork.set(key, hit);
    return hit;
  }
  const url = paint();
  if (!url) return url;
  artwork.set(key, url);
  if (artwork.size > ARTWORK_CACHE_LIMIT) {
    const oldest = artwork.keys().next().value;
    if (oldest !== undefined) artwork.delete(oldest);
  }
  return url;
}

function pathsFor(
  flower: TheoryFlower,
  hand: "left" | "right",
  reach: number
): MandalaPaths {
  const key = `${hand}:${theoryFlowerKey(flower)}:${reach}`;
  const cached = geometry.get(key);
  if (cached) return cached;
  const built = theoryFlowerPaths(flower, hand, reach);
  geometry.set(key, built);
  return built;
}

function currentDpr(): number {
  return typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;
}

/*
 * The painter is the grid's: the same one the Matrix tiles are painted with,
 * carrying the account's saved hand inks and a cache key that tells one
 * palette's rasters from another's. Without it every Theory tile stayed in
 * the hero palette while the Matrix beside it followed the user's colours.
 *
 * `reach` traces this hand's own geometry — a staff-handed tile must draw the
 * staff's shape, not the other hand's longer or shorter prop. `scale` is a
 * separate value (the pair's larger reach) passed through to the painter so
 * every tile in the grid, regardless of which hand's prop is shorter, shares
 * one extent fit.
 */
export function theoryHeaderArtworkSrc(
  flower: TheoryFlower,
  hand: "left" | "right",
  reach: number,
  scale: number,
  sizePx: number,
  painter: ShapeMatrixArtworkPainter = CLUB_ARTWORK_PAINTER
): string {
  const size = Math.round(sizePx);
  const dpr = currentDpr();
  const ink = painter.cacheKey ?? "hero";
  const key = `h:${ink}:${hand}:${theoryFlowerKey(flower)}:${reach}:${scale}:${size}:${dpr}`;
  return remember(key, () =>
    painter.header(pathsFor(flower, hand, reach), hand, size, scale)
  );
}

export function theoryCellArtworkSrc(
  left: TheoryFlower,
  right: TheoryFlower,
  reach: { left: number; right: number },
  scale: number,
  sizePx: number,
  painter: ShapeMatrixArtworkPainter = CLUB_ARTWORK_PAINTER
): string {
  const size = Math.round(sizePx);
  const dpr = currentDpr();
  const ink = painter.cacheKey ?? "hero";
  const key =
    `c:${ink}:${theoryFlowerKey(left)}__${theoryFlowerKey(right)}` +
    `:${reach.left}:${reach.right}:${scale}:${size}:${dpr}`;
  return remember(key, () =>
    painter.cell(
      pathsFor(left, "left", reach.left),
      pathsFor(right, "right", reach.right),
      size,
      scale
    )
  );
}

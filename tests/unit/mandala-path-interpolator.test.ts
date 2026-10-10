import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  MandalaPaths,
  MandalaPoint,
  SVGPathData,
} from "#lib/shared/mandala/domain/mandala-types.js";
import { pointsToSVGPath } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { parsePoints } from "#lib/shared/mandala/services/mandala-fingerprint.js";
import {
  createMandalaMorph,
  interpolateMandalaPaths,
  mandalaPathsEqual,
} from "#lib/shared/mandala/services/mandala-path-interpolator.js";

const workspaceGridSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte"
  ),
  "utf8"
);

function path(tipIndex: number, points: MandalaPoint[]): SVGPathData {
  return { d: pointsToSVGPath(points), tipIndex };
}

function paths(left: SVGPathData[], right: SVGPathData[]): MandalaPaths {
  return { left, right, purple: [] };
}

describe("mandala path interpolation", () => {
  it("keeps an unchanged hand exactly fixed during a single-hand morph", () => {
    const left = path(0, [
      { x: -20, y: 0 },
      { x: 20, y: 0 },
    ]);
    const from = paths(
      [left],
      [
        path(0, [
          { x: 0, y: -20 },
          { x: 0, y: 20 },
        ]),
      ]
    );
    const to = paths(
      [left],
      [
        path(0, [
          { x: -20, y: -20 },
          { x: 20, y: 20 },
        ]),
      ]
    );

    const halfway = interpolateMandalaPaths(from, to, 0.5);

    expect(halfway.left[0]).toBe(left);
    expect(parsePoints(halfway.right[0]!.d)).toEqual([
      { x: -10, y: -20 },
      { x: 10, y: 20 },
    ]);
  });

  it("normalizes unequal sample counts instead of cutting to the new path", () => {
    const from = paths(
      [
        path(0, [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
        ]),
      ],
      []
    );
    const to = paths(
      [
        path(0, [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
          { x: 20, y: 40 },
        ]),
      ],
      []
    );

    const halfwayPoints = parsePoints(
      interpolateMandalaPaths(from, to, 0.5).left[0]!.d
    );

    expect(halfwayPoints).toHaveLength(3);
    expect(halfwayPoints[1]).toEqual({ x: 10, y: 10 });
    expect(halfwayPoints[2]).toEqual({ x: 20, y: 20 });
  });

  it("preserves exact endpoints and detects geometry-only duplicates", () => {
    const from = paths(
      [
        path(0, [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      ],
      []
    );
    const to = paths(
      [
        path(0, [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ]),
      ],
      []
    );

    expect(interpolateMandalaPaths(from, to, 0)).toBe(from);
    expect(interpolateMandalaPaths(from, to, 1)).toBe(to);
    expect(mandalaPathsEqual(from, from)).toBe(true);
    expect(mandalaPathsEqual(from, to)).toBe(false);
  });

  it("leaves earlier frames intact while later frames are drawn", () => {
    const from = paths(
      [
        path(0, [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
        ]),
      ],
      []
    );
    const to = paths(
      [
        path(0, [
          { x: 0, y: 40 },
          { x: 40, y: 40 },
        ]),
      ],
      []
    );
    const morph = createMandalaMorph(from, to);

    const quarter = morph(0.25);
    const threeQuarters = morph(0.75);

    expect(parsePoints(quarter.left[0]!.d)).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
    ]);
    expect(parsePoints(threeQuarters.left[0]!.d)).toEqual([
      { x: 0, y: 30 },
      { x: 40, y: 30 },
    ]);
    expect(morph(0.25)).toEqual(interpolateMandalaPaths(from, to, 0.25));
  });

  it("opts the Create workspace into component-owned morphing", () => {
    expect(workspaceGridSource).toContain("morphChanges");
    expect(workspaceGridSource).not.toContain("handNode.animate(");
    expect(workspaceGridSource).not.toContain("registerMandalaCell");
  });
});

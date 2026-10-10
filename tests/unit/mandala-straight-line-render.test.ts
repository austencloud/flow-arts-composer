import { describe, expect, it } from "vitest";
import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";

const STRAIGHT_LINE_SEQUENCE: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "n",
        turns: 0,
        startOrientation: "in",
        endOrientation: "out",
      },
      right: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "s",
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "n",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "n",
        turns: 0,
        startOrientation: "in",
        endOrientation: "out",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "in",
      },
      right: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "n",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "s",
        turns: 0,
        startOrientation: "in",
        endOrientation: "in",
      },
      right: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "in",
      },
    },
  },
];

function coordinates(path: string): Array<{ x: number; y: number }> {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index]!, y: values[index + 1]! });
  }
  return points;
}

describe("straight-line mandala SVG rendering", () => {
  it("uses user-space effects so an axis-aligned mandala remains visible", () => {
    const paths = calculate(STRAIGHT_LINE_SEQUENCE, "staff", "staff");
    const allPoints = [...paths.left, ...paths.right].flatMap(({ d }) =>
      coordinates(d)
    );

    expect(allPoints.length).toBeGreaterThan(0);
    expect(allPoints.every(({ x }) => Math.abs(x) < 0.01)).toBe(true);

    const svg = renderMandalaSVG(paths, {
      size: 240,
      style: "stroke",
      show: "both",
    });

    expect(svg).toMatch(
      /<filter id="glow" filterUnits="userSpaceOnUse" x="-[\d.]+" y="-[\d.]+" width="[\d.]+" height="[\d.]+">/
    );
    expect(svg).toMatch(
      /<mask id="bom\d+" maskUnits="userSpaceOnUse" x="-[\d.]+" y="-[\d.]+" width="[\d.]+" height="[\d.]+">/
    );
  });
});

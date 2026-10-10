import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import {
  MANDALA_STANDARD_TIP_DX,
  ENGINE_GRID_RADIUS,
  MANDALA_GRID_RADIUS,
  BASE_SAMPLES_PER_BEAT,
} from "#lib/shared/mandala/domain/mandala-constants.js";
import { normalizeLegacySteps } from "@tka/tka-types";

/**
 * Extract all curve endpoint coordinates from an SVG path "d" string.
 *
 * Handles "M x y" and "C cx1 cy1, cx2 cy2, x y" commands.
 * Returns the on-curve points in order (M start + each C endpoint).
 * Control points are intentionally excluded — they are not on the curve.
 */
function parseSVGEndpoints(d: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  // Match M command: M x y
  const mMatch = d.match(/^M\s+([-\d.]+)\s+([-\d.]+)/);
  if (mMatch) {
    points.push({ x: parseFloat(mMatch[1]!), y: parseFloat(mMatch[2]!) });
  }

  // Match each C command: C cx1 cy1, cx2 cy2, x y
  // The endpoint (third pair) is the only on-curve point.
  const cRegex =
    /C\s+[-\d.]+\s+[-\d.]+,\s+[-\d.]+\s+[-\d.]+,\s+([-\d.]+)\s+([-\d.]+)/g;
  let cMatch: RegExpExecArray | null;
  while ((cMatch = cRegex.exec(d)) !== null) {
    points.push({ x: parseFloat(cMatch[1]!), y: parseFloat(cMatch[2]!) });
  }

  return points;
}

/**
 * Count how many "M" commands appear in a path string.
 * A continuous path has exactly one M; gaps force additional M commands.
 */
function countMoveToCommands(d: string): number {
  return (d.match(/M\s/g) ?? []).length;
}

/**
 * Measure the Euclidean distance between two points.
 */
function dist(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Find the maximum gap between beat-junction points in the combined SVG path.
 *
 * The calculator concatenates all beats into one point array before converting
 * to SVG. Each beat contributes (samplesPerBeat + 1) on-curve points: indices
 * 0..samplesPerBeat. The junction between beat N and beat N+1 is:
 *   - last point of beat N: index (N+1) * (samplesPerBeat+1) - 1
 *   - first point of beat N+1: index (N+1) * (samplesPerBeat+1)
 *
 * In a correctly chained sequence these two points are identical (same (x,y)),
 * so the gap is 0. We extract the on-curve points from SVG and check each
 * cross-beat boundary.
 *
 * NOTE: "maxConsecutiveGap" is NOT the right metric here — normal inter-sample
 * distances along a curve can be arbitrarily large. Instead we check only the
 * specific junction indices.
 */
function maxBeatJunctionGap(
  d: string,
  samplesPerBeat: number,
  stepCount: number
): number {
  const pts = parseSVGEndpoints(d);
  // Points per beat in the SVG: samplesPerBeat + 1 on-curve points from M + C commands.
  // The M command is point[0] (first point of first beat).
  // Each beat produces samplesPerBeat C commands, so (samplesPerBeat+1) points total
  // including the shared start. Beat boundaries sit at indices:
  //   beatSize * 1 - 1 and beatSize * 1  (end of beat 0 / start of beat 1)
  //   beatSize * 2 - 1 and beatSize * 2  (end of beat 1 / start of beat 2)
  //   ...
  // where beatSize = samplesPerBeat + 1.
  // But the last point of beat N and first of beat N+1 are the SAME point in a
  // continuous path — they're emitted at t=1 and t=0 respectively.
  // So in the merged array they appear at consecutive indices:
  //   endOfBeatN = (N+1) * samplesPerBeat   (the Nth beat's last sample at t=1)
  //   startOfBeatN1 = same index + 1        (beat N+1 starts at t=0 = same pos)
  //
  // Wait — actually generatePathPoints does NOT deduplicate the t=1/t=0 boundary.
  // Beat N emits samples i=0..samplesPerBeat (total = samplesPerBeat+1 points).
  // Beat N+1 also starts at i=0 (t=0), which SHOULD equal beat N's i=samplesPerBeat (t=1).
  // Those two points sit at SVG endpoint indices:
  //   (N+1)*(samplesPerBeat+1) - 1   ← last of beat N
  //   (N+1)*(samplesPerBeat+1)       ← first of beat N+1
  const beatSize = samplesPerBeat + 1;
  let maxGap = 0;
  for (let b = 1; b < stepCount; b++) {
    const endOfPrev = b * beatSize - 1;
    const startOfNext = b * beatSize;
    if (endOfPrev < pts.length && startOfNext < pts.length) {
      const gap = dist(pts[endOfPrev]!, pts[startOfNext]!);
      if (gap > maxGap) maxGap = gap;
    }
  }
  return maxGap;
}

/**
 * ALΦ sequence (3-beat seed + 180° rotation copies = 6 beats).
 *
 * Beat 1: blue=pro(s→w), red=pro(n→e)      — both arc quarter-turn
 * Beat 2: blue=anti(w→s), red=pro(e→s)     — blue anti, red pro
 * Beat 3: blue=dash(s→n), red=static(s→s)  — the tricky beat (was 160px bug)
 * Beats 4-6: locations rotated 180°
 */
const ALPHI_BEATS: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "anti",
        rotationDirection: "cw",
        startLocation: "w",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "n",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
  // Rotated 180° copies
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
  {
    motions: {
      left: {
        motionType: "anti",
        rotationDirection: "cw",
        startLocation: "e",
        endLocation: "n",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "w",
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
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
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
];

/** Single PRO beat: south → west, 0 turns, out/out */
const SINGLE_PRO_STEP: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
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
];

/** Single DASH beat: south → north (through center), 0 turns */
const SINGLE_DASH_STEP: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "dash",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "n",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "e",
        endLocation: "e",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
];

/** Single STATIC beat: hand stays at south the whole beat */
const SINGLE_STATIC_STEP: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "static",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "s",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
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
];

/**
 * Single FLOAT beat — s→w shift with prop holding absolute spatial angle.
 *
 * Float only exists on shifts (curved hand path). The hand arcs from s to w
 * like pro/anti, but the prop does not rotate at all — it holds its start
 * orientation's world-frame angle throughout the motion.
 */
const SINGLE_FLOAT_STEP: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "float",
        rotationDirection: "noRotation",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "clock",
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
];

/** High-turn beat to test adaptive sampling */
const HIGH_TURN_STEP: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 1.5,
        startOrientation: "out",
        endOrientation: "out",
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
];

/** Anti vs pro sign test — ANTI uses opposite center movement sign */
const ANTI_PRO_PAIR: StepLike[] = [
  {
    motions: {
      left: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
      right: {
        motionType: "anti",
        rotationDirection: "cw",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
        startOrientation: "out",
        endOrientation: "out",
      },
    },
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The fixture is at scripts/test-sequence.json relative to project root.
// __dirname is tests/unit/, so we go up two levels.
const fixtureJson = JSON.parse(
  readFileSync(join(__dirname, "../../scripts/test-sequence.json"), "utf-8")
) as { steps: StepLike[] };

const SIXTEEN_BEAT_STEPS = normalizeLegacySteps(fixtureJson.steps).filter(
  (s) => s.motions?.left || s.motions?.right
);

describe("MandalaGeometryCalculator", () => {
  // The class collapsed into a standalone `calculate` function. Bind it to an
  // object so the existing `calc.calculate(...)` call sites are unchanged.
  const calc = { calculate };

  describe("junction continuity", () => {
    it("produces a single continuous path (one M command) for a 2-beat sequence", () => {
      const twoBeat: StepLike[] = [ALPHI_BEATS[0]!, ALPHI_BEATS[1]!];
      const result = calc.calculate(twoBeat);
      // Both tips of blue should be single continuous paths
      for (const path of result.left) {
        expect(countMoveToCommands(path.d)).toBe(1);
      }
    });

    it("beat-junction gap < 0.02px for a 3-beat sequence", () => {
      const threeBeat = ALPHI_BEATS.slice(0, 3);
      const result = calc.calculate(threeBeat);
      for (const path of [...result.left, ...result.right]) {
        // Check only the actual beat junction points (not all consecutive pairs).
        // toFixed(2) introduces up to 0.005px rounding per coordinate, so 0.02px
        // is a tight but achievable threshold.
        const gap = maxBeatJunctionGap(path.d, BASE_SAMPLES_PER_BEAT, 3);
        expect(gap).toBeLessThan(0.02);
      }
    });
  });

  describe("PRO motion produces arc", () => {
    it("blue tip path maintains approximately constant radius for s→w PRO beat", () => {
      const result = calc.calculate(SINGLE_PRO_STEP);
      // We expect 2 blue paths (left tip and right tip)
      expect(result.left.length).toBeGreaterThan(0);

      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);
      expect(pts.length).toBeGreaterThan(4);

      // Compute the radius of each sampled endpoint from origin (0,0)
      const radii = pts.map((p) => Math.sqrt(p.x ** 2 + p.y ** 2));
      const minR = Math.min(...radii);
      const maxR = Math.max(...radii);

      // All tip points should lie at roughly the same radius.
      // The tip is offset from the hand position by MANDALA_STANDARD_TIP_DX (130)
      // scaled to mandala space. This is approximately:
      //   130 * (80/150) = 130 * 0.533 ≈ 69.3px
      // Allow a generous tolerance for numerical rounding (±2px).
      expect(maxR - minR).toBeLessThan(2);
    });
  });

  describe("DASH motion passes through center", () => {
    it("blue hand at t=0.5 is near origin for s→n DASH", () => {
      const result = calc.calculate(SINGLE_DASH_STEP);
      expect(result.left.length).toBeGreaterThan(0);

      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);
      expect(pts.length).toBeGreaterThan(4);

      // The midpoint of the path should be near center (0,0) for a s→n dash.
      // The tip offset means the endpoint won't be at exactly 0, but the hand
      // traverses through center, and with a 0-turn staff angle, the tip
      // sweeps through near-zero as well.
      const midIndex = Math.floor(pts.length / 2);
      const mid = pts[midIndex]!;

      // The dash goes from s(90°) to n(-90°) through center. At t=0.5:
      // handX=0, handY=0. The staff angle at mid-dash (out→out, 0 turns) maps
      // to a perpendicular angle (clock/counter from out at center = ±90°).
      // The tip offset applies perpendicular to the staff — so the tip center
      // distance from 0,0 should be less than the full tip offset magnitude.
      const distFromCenter = Math.sqrt(mid.x ** 2 + mid.y ** 2);

      // The hand is at center at t=0.5, so tip is offset purely by staff rotation.
      // Full tip magnitude = (150-20) * (80/150) ≈ 69.3px
      // The hand position contributes 0, so distFromCenter ≈ tipOffset ≈ 69px.
      // This confirms the dash goes through center (hand.x≈0, hand.y≈0 at midpoint).
      //
      // We verify this is much less than the full grid radius (80px = south position),
      // meaning the hand DID pass through center rather than staying at perimeter.
      expect(distFromCenter).toBeLessThan(MANDALA_GRID_RADIUS);
    });

    it("path starts and ends at opposite perimeter positions for s→n DASH", () => {
      const result = calc.calculate(SINGLE_DASH_STEP);
      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);

      const first = pts[0]!;
      const last = pts[pts.length - 1]!;

      // Start and end tips should be at approximately equal distance from origin
      // (both at perimeter) but roughly opposite directions.
      const r1 = Math.sqrt(first.x ** 2 + first.y ** 2);
      const r2 = Math.sqrt(last.x ** 2 + last.y ** 2);
      expect(Math.abs(r1 - r2)).toBeLessThan(2);

      // The displacement vector should point in approximately opposite directions.
      // Dot product of normalized vectors should be negative (opposite half-space).
      const dot = (first.x * last.x + first.y * last.y) / (r1 * r2);
      expect(dot).toBeLessThan(0);
    });
  });

  describe("STATIC motion", () => {
    it("all tip points share the same x coordinate for static hand at south", () => {
      const result = calc.calculate(SINGLE_STATIC_STEP);
      expect(result.left.length).toBeGreaterThan(0);

      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);
      expect(pts.length).toBeGreaterThan(2);

      // The south location is at angle 90° (x=0 in unit circle).
      // All hand positions should have x ≈ 0. With a 0-turn staff, the tip
      // may shift in x, but all points should share the same x because the
      // hand doesn't move and the staff angle is constant (no rotation).
      const xs = pts.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      // With 0 turns static, staff angle = startStaffAngle = constant.
      // So tip x = handX + dx*cos(staffAngle) = constant. All x values match.
      expect(maxX - minX).toBeLessThan(0.02);
    });

    it("all tip points share the same y coordinate for static hand at south", () => {
      const result = calc.calculate(SINGLE_STATIC_STEP);
      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);

      const ys = pts.map((p) => p.y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      expect(maxY - minY).toBeLessThan(0.02);
    });
  });

  describe("FLOAT motion produces an arc with constant prop angle", () => {
    it("blue produces a path (float is a shift, it must be drawn)", () => {
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      expect(result.left.length).toBeGreaterThan(0);
    });

    it("blue path traces an arc between start and end locations (s→w)", () => {
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);
      expect(pts.length).toBeGreaterThan(4);

      // First point should be near south (y > 0), last near west (x < 0).
      // The south grid location is at angle 90° (unit circle: cos=0, sin=1).
      // The west location is at 180° (cos=-1, sin=0).
      // Grid radius scales these; tip offset shifts but preserves quadrant.
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;

      // First point is in the "south" half (positive y side of the grid)
      expect(first.y).toBeGreaterThan(0);
      // Last point is in the "west" half (negative x side of the grid)
      expect(last.x).toBeLessThan(0);
    });

    it("path traverses a wide range of positions (arc, not static)", () => {
      // A static motion produces a zero-area path (all points at the same
      // hand position, only staff angle may differ — but staff is also
      // constant during 0-turn static, so all tip points are identical).
      // A float arc must carry the hand across the grid, so the bounding
      // box of tip points must be substantial.
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      const path = result.left[0]!;
      const pts = parseSVGEndpoints(path.d);

      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const xSpan = Math.max(...xs) - Math.min(...xs);
      const ySpan = Math.max(...ys) - Math.min(...ys);

      // An arc from s→w covers roughly one grid-radius in each axis (~56px).
      // Require at least half that to confirm the hand is moving, not static.
      expect(xSpan).toBeGreaterThan(MANDALA_GRID_RADIUS / 2);
      expect(ySpan).toBeGreaterThan(MANDALA_GRID_RADIUS / 2);
    });

    it("prop holds its absolute spatial angle throughout the arc (float definition)", () => {
      // Float's defining property: prop does not rotate. In world frame,
      // the staff angle is constant across all samples. We verify this by
      // checking that the two tips (tipIndex 0 and 1) maintain a constant
      // separation vector — if the staff rotated, the vector between the
      // two tips would rotate too.
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      expect(result.left).toHaveLength(2);

      const tipA = parseSVGEndpoints(result.left[0]!.d);
      const tipB = parseSVGEndpoints(result.left[1]!.d);
      expect(tipA.length).toBe(tipB.length);

      // For each sample, the vector from tipA to tipB represents the staff
      // orientation at that moment. If the staff doesn't rotate, all these
      // vectors point in the same direction.
      const separationAngles = tipA.map((a, i) => {
        const b = tipB[i]!;
        return Math.atan2(b.y - a.y, b.x - a.x);
      });

      const minAngle = Math.min(...separationAngles);
      const maxAngle = Math.max(...separationAngles);
      // Staff angle variation should be negligible (< 0.01 rad, effectively 0)
      expect(maxAngle - minAngle).toBeLessThan(0.01);
    });

    it("red static path is still produced alongside float blue path", () => {
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      expect(result.right.length).toBeGreaterThan(0);
    });

    it("path is a single continuous curve (one M command)", () => {
      const result = calc.calculate(SINGLE_FLOAT_STEP);
      for (const path of result.left) {
        expect(countMoveToCommands(path.d)).toBe(1);
      }
    });
  });

  describe("authored skew hand paths", () => {
    const makeDirectedFloat = (handPath: "cw" | "ccw"): StepLike[] => [
      {
        motions: {
          left: {
            motionType: "float",
            rotationDirection: "noRotation",
            startLocation: "s",
            endLocation: "e",
            handPath,
            turns: 0,
            startOrientation: "out",
            endOrientation: "out",
          },
        },
      },
    ];

    it("draws an authored clockwise long-way arc instead of the shortest arc", () => {
      const result = calc.calculate(
        makeDirectedFloat("cw"),
        undefined,
        undefined,
        undefined,
        { dx: 0, dy: 0 }
      );
      const points = parseSVGEndpoints(result.left[0]!.d);
      const midpoint = points[Math.floor((points.length - 1) / 2)]!;

      // Clockwise s→e travels through the west and north sides of the grid.
      // Shortest-path interpolation incorrectly travels through southeast.
      expect(midpoint.x).toBeLessThan(0);
      expect(midpoint.y).toBeLessThan(0);
    });

    it("keeps opposite authored hand paths distinct in the geometry cache", () => {
      const clockwise = calc.calculate(makeDirectedFloat("cw"));
      const counterClockwise = calc.calculate(makeDirectedFloat("ccw"));

      expect(clockwise.left[0]!.d).not.toBe(counterClockwise.left[0]!.d);
    });
  });

  describe("interradial orientations", () => {
    it("uses the authored 45-degree orientation in prop-tip geometry", () => {
      const makeStatic = (orientation: "out" | "clockIn"): StepLike[] => [
        {
          motions: {
            left: {
              motionType: "static",
              rotationDirection: "noRotation",
              startLocation: "s",
              endLocation: "s",
              turns: 0,
              startOrientation: orientation,
              endOrientation: orientation,
            },
          },
        },
      ];

      const cardinal = calc.calculate(
        makeStatic("out"),
        undefined,
        undefined,
        undefined,
        { dx: 120, dy: 0 }
      );
      const interradial = calc.calculate(
        makeStatic("clockIn"),
        undefined,
        undefined,
        undefined,
        { dx: 120, dy: 0 }
      );

      expect(interradial.left[1]!.d).not.toBe(cardinal.left[1]!.d);
      expect(parseSVGEndpoints(interradial.left[1]!.d)[0]!.x).toBeLessThan(-1);
    });
  });

  describe("tip offset applied (MANDALA_STANDARD_TIP_DX)", () => {
    it("tip radius matches MANDALA_STANDARD_TIP_DX scaled to mandala space", () => {
      // The calculator uses MANDALA_STANDARD_TIP_DX (130) as the tip offset
      // in engine coordinates, scaled to mandala space by
      // (MANDALA_GRID_RADIUS / ENGINE_GRID_RADIUS).

      const result = calc.calculate(SINGLE_STATIC_STEP);
      expect(result.left.length).toBeGreaterThan(0);

      const path = result.left[1]!; // right tip (tipIndex 1, dx = +MANDALA_STANDARD_TIP_DX)
      const pts = parseSVGEndpoints(path.d);
      const maxDist = Math.max(
        ...pts.map((p) => Math.sqrt(p.x ** 2 + p.y ** 2))
      );

      // Expected max reach = gridRadius + MANDALA_STANDARD_TIP_DX * scale
      const scale = MANDALA_GRID_RADIUS / ENGINE_GRID_RADIUS;
      const tipReach = MANDALA_GRID_RADIUS + MANDALA_STANDARD_TIP_DX * scale;
      const fullReach = MANDALA_GRID_RADIUS + ENGINE_GRID_RADIUS * scale;

      // The standardized tip dx (130) is less than ENGINE_GRID_RADIUS (150),
      // so the tip reach is less than the full staff reach
      expect(tipReach).toBeLessThan(fullReach);
      // The actual tip is within the expected reach
      expect(maxDist).toBeLessThanOrEqual(tipReach + 0.1);
      // And it's larger than gridRadius alone (so there IS a tip offset)
      expect(maxDist).toBeGreaterThan(MANDALA_GRID_RADIUS);
    });

    it("MANDALA_STANDARD_TIP_DX is 120 (pin the constant)", () => {
      // If someone changes this constant, the visual output changes significantly.
      // Pin it explicitly so any change requires updating the tests too.
      // Canonical source: src/lib/shared/mandala/domain/mandala-constants.ts:3 (130→120 in commit 3e6c69a73b).
      expect(MANDALA_STANDARD_TIP_DX).toBe(120);
    });
  });

  describe("staff angle chaining — ALΦ beat 2→3 transition", () => {
    it("beat 2→3 junction gap < 0.02px for blue (this was the 160px bug)", () => {
      // Without staff-angle chaining, beat 3 (dash) starts with an orientation-
      // derived staff angle that doesn't match beat 2's end angle, producing a
      // ~160px visual gap. With chaining, the gap is 0.
      const result = calc.calculate(ALPHI_BEATS);
      expect(result.left.length).toBeGreaterThan(0);

      for (const path of result.left) {
        // All junctions should be continuous — including the critical beat 2→3
        expect(countMoveToCommands(path.d)).toBe(1);
        // Check only beat junction indices, not all consecutive pairs
        const gap = maxBeatJunctionGap(
          path.d,
          BASE_SAMPLES_PER_BEAT,
          ALPHI_BEATS.length
        );
        expect(gap).toBeLessThan(0.02);
      }
    });

    it("6-beat ALΦ red paths are continuous throughout", () => {
      const result = calc.calculate(ALPHI_BEATS);
      for (const path of result.right) {
        expect(countMoveToCommands(path.d)).toBe(1);
        const gap = maxBeatJunctionGap(
          path.d,
          BASE_SAMPLES_PER_BEAT,
          ALPHI_BEATS.length
        );
        expect(gap).toBeLessThan(0.02);
      }
    });
  });

  describe("full 16-beat loop junction continuity", () => {
    it("Ω-YΩXΩ-YΩX sequence has all paths as single continuous curves", () => {
      expect(SIXTEEN_BEAT_STEPS.length).toBeGreaterThan(0);
      const result = calc.calculate(SIXTEEN_BEAT_STEPS);

      const allPaths = [...result.left, ...result.right];
      expect(allPaths.length).toBeGreaterThan(0);

      for (const path of allPaths) {
        expect(countMoveToCommands(path.d)).toBe(1);
      }
    });

    it("Ω-YΩXΩ-YΩX sequence has max junction gap < 0.02px across all paths", () => {
      const result = calc.calculate(SIXTEEN_BEAT_STEPS);
      const allPaths = [...result.left, ...result.right];
      const stepCount = SIXTEEN_BEAT_STEPS.length;

      for (const path of allPaths) {
        const gap = maxBeatJunctionGap(
          path.d,
          BASE_SAMPLES_PER_BEAT,
          stepCount
        );
        expect(gap).toBeLessThan(0.02);
      }
    });
  });

  describe("ANTI motion staff rotation is opposite to PRO", () => {
    it("anti and pro from same start/end produce different tip paths", () => {
      const result = calc.calculate(ANTI_PRO_PAIR);

      // Blue is PRO (s→w), red is ANTI (s→w, same locations).
      // PRO: staffDelta = centerMovement + 0 = -π/2 (quarter arc CW)
      // ANTI: staffDelta = -centerMovement + 0 = +π/2 (opposite)
      // The two hands start at the same location. Their tip paths should differ
      // because their staff angles evolve in opposite directions.
      expect(result.left.length).toBeGreaterThan(0);
      expect(result.right.length).toBeGreaterThan(0);

      const leftPts = parseSVGEndpoints(result.left[0]!.d);
      const rightPts = parseSVGEndpoints(result.right[0]!.d);

      // Midpoints should differ (staff angles diverge)
      const leftMid = leftPts[Math.floor(leftPts.length / 2)]!;
      const rightMid = rightPts[Math.floor(rightPts.length / 2)]!;

      const midDist = dist(leftMid, rightMid);
      // They should be measurably different (at least 1px apart at midpoint)
      expect(midDist).toBeGreaterThan(1);
    });

    it("anti tip at end is at a different angle than pro tip for same s→w motion", () => {
      const result = calc.calculate(ANTI_PRO_PAIR);

      const leftEnd = parseSVGEndpoints(result.left[0]!.d).at(-1)!;
      const rightEnd = parseSVGEndpoints(result.right[0]!.d).at(-1)!;

      // Both hands reach w (same center position), but their staff angles differ.
      // They should end at different tip positions.
      const endDist = dist(leftEnd, rightEnd);
      expect(endDist).toBeGreaterThan(1);
    });
  });

  describe("adaptive sampling", () => {
    it("1.5-turn motion produces more SVG C commands than 0-turn motion", () => {
      // The calculator generates BASE_SAMPLES_PER_BEAT points for 0-turn motions
      // and BASE_SAMPLES_PER_BEAT * ceil(turns) for high-turn motions.
      // More samples → more C commands in the SVG path.
      const zeroTurnResult = calc.calculate(SINGLE_PRO_STEP);
      const highTurnResult = calc.calculate(HIGH_TURN_STEP);

      const countC = (d: string) => (d.match(/\bC\b/g) ?? []).length;

      // 0-turn: 64 samples → 64 C commands
      // 1.5-turn: ceil(1.5)=2, 64*2=128 samples → 128 C commands
      const zeroTurnC = countC(zeroTurnResult.left[0]!.d);
      const highTurnC = countC(highTurnResult.left[0]!.d);

      expect(highTurnC).toBeGreaterThan(zeroTurnC);
    });

    it("1.5-turn beat produces at least 2× more C commands than 0-turn beat", () => {
      const zeroTurnResult = calc.calculate(SINGLE_PRO_STEP);
      const highTurnResult = calc.calculate(HIGH_TURN_STEP);

      const countC = (d: string) => (d.match(/\bC\b/g) ?? []).length;

      const zeroC = countC(zeroTurnResult.left[0]!.d);
      const highC = countC(highTurnResult.left[0]!.d);

      expect(highC).toBeGreaterThanOrEqual(zeroC * 2);
    });
  });

  // ─── Bonus: Return shape validation ─────────────────────────────────────

  describe("return shape", () => {
    it("returns { blue, red } with SVGPathData arrays", () => {
      const result = calc.calculate(SINGLE_PRO_STEP);
      expect(Array.isArray(result.left)).toBe(true);
      expect(Array.isArray(result.right)).toBe(true);
    });

    it("each path entry has a non-empty d string and tipIndex 0 or 1", () => {
      const result = calc.calculate(SINGLE_PRO_STEP);
      for (const path of [...result.left, ...result.right]) {
        expect(path.d.length).toBeGreaterThan(0);
        expect(path.tipIndex === 0 || path.tipIndex === 1).toBe(true);
      }
    });

    it("blue produces 2 paths (left tip + right tip)", () => {
      const result = calc.calculate(SINGLE_PRO_STEP);
      expect(result.left).toHaveLength(2);
    });

    it("returns empty arrays for steps with no motions", () => {
      const result = calc.calculate([{ motions: null }]);
      expect(result.left).toHaveLength(0);
      expect(result.right).toHaveLength(0);
    });
  });

  // ─── Prop-aware tip ends (single- vs dual-ended) ─────────────────────────
  // A two-ended prop (staff) traces both tips; a single-ended prop (club/fan)
  // traces ONLY the outer staff end — same staff geometry, inner (pinky) locus
  // dropped — so a club sequence's mandala isn't the double-staff figure.

  describe("prop-aware tip ends", () => {
    it("default (no options) traces both tips → blue has 2 path-sets", () => {
      const result = calc.calculate(SINGLE_PRO_STEP);
      expect(result.left).toHaveLength(2);
    });

    it("tipEnds:1 traces one tip → blue and red each have 1 path-set", () => {
      const result = calc.calculate(SINGLE_PRO_STEP, undefined, undefined, {
        tipEnds: 1,
      });
      expect(result.left).toHaveLength(1);
      expect(result.right).toHaveLength(1);
    });

    it("the single-ended path IS the outer (+dx) tip of the dual render", () => {
      // Dual emits [innerTip(-dx), outerTip(+dx)]; single keeps exactly +dx.
      // Identical `d` proves the geometry is unchanged — only the inner tip is
      // dropped (staff geometry preserved, no per-prop reshaping).
      const dual = calc.calculate(SINGLE_STATIC_STEP);
      const single = calc.calculate(SINGLE_STATIC_STEP, undefined, undefined, {
        tipEnds: 1,
      });
      expect(single.left[0]!.d).toBe(dual.left[1]!.d);
    });

    it("pairTipEnds maps single-ended props → 1, staff family → 2", () => {
      expect(pairTipEnds("club", "club")).toBe(1);
      expect(pairTipEnds("fan", "fan")).toBe(1);
      expect(pairTipEnds("triad", "triad")).toBe(1);
      expect(pairTipEnds("staff", "staff")).toBe(2);
      expect(pairTipEnds("buugeng", "buugeng")).toBe(2);
    });

    it("big chicken is bilateral (2); regular chicken is single-ended (1)", () => {
      expect(pairTipEnds("bigchicken", "bigchicken")).toBe(2);
      expect(pairTipEnds("chicken", "chicken")).toBe(1);
    });

    it("a mixed pair keeps the staff hand's second tip (→ 2)", () => {
      expect(pairTipEnds("club", "staff")).toBe(2);
      expect(pairTipEnds("staff", "club")).toBe(2);
    });

    it("an unspecified prop defaults to the two-ended staff render", () => {
      expect(pairTipEnds(undefined, undefined)).toBe(2);
    });
  });
});

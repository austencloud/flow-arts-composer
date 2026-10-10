import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { setTrailPointOverrideProvider } from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
import {
  CLUB_TIP_REACH,
  setTipPointOverrideProvider,
} from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { resolveTrailPointConfig } from "#lib/shared/animation-engine/domain/types/trail-point-types.js";
import { ENGINE_GRID_RADIUS } from "#lib/shared/mandala/domain/mandala-constants.js";
import {
  computeEngineAlignedMandalaScale,
  resolveMandalaTipOffsets,
} from "#lib/shared/mandala/services/mandala-path-preparer.js";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import type {
  MandalaTipOverrides,
  StepLike,
} from "#lib/shared/mandala/services/types.js";

// Both derive from the prop's own pictograph viewBox half-width — the animation
// canvas draws that artwork, so the traced tip sits on its visible end.
const STAFF_TIP_REACH = 252.8 / 2;
const sequenceMandalaSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/mandala/components/SequenceMandala.svelte"
  ),
  "utf8"
);

afterEach(() => {
  setTrailPointOverrideProvider(null);
  setTipPointOverrideProvider(null);
});

function staticEastStep(): StepLike {
  const motion = {
    motionType: "static",
    rotationDirection: "noRotation",
    startLocation: "e",
    endLocation: "e",
    turns: 0,
    startOrientation: "out",
    endOrientation: "out",
  };
  return {
    motions: {
      left: { ...motion },
      right: { ...motion },
    },
  };
}

function zeroTurnAntiStep(): StepLike {
  return {
    motions: {
      left: {
        motionType: "anti",
        rotationDirection: "ccw",
        startLocation: "w",
        endLocation: "n",
        turns: 0,
        startOrientation: "in",
        endOrientation: "out",
      },
    },
  };
}

function firstPoint(path: string): { x: number; y: number } {
  const match = /^M (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/.exec(path);
  if (!match) throw new Error(`Expected SVG move command, received: ${path}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe("animation mandala trail-point alignment", () => {
  it("keeps the animated club short of the grid center and aligned with its traced tip", () => {
    const dimensions = getPropDimensions("club");
    const clubSvg = readFileSync(
      // The pictograph family is what the animation canvas fetches now
      // (svg-generator's resolvePropSvgPath). The club's two files are
      // byte-identical — it was the first prop converged onto this family.
      resolve(process.cwd(), "static/images/props/pictograph/club.svg"),
      "utf8"
    );
    const viewBox = /viewBox=["']0 0 ([\d.]+) ([\d.]+)["']/.exec(clubSvg);
    const tracedTip = resolveMandalaTipOffsets(
      "club",
      TrackingMode.RIGHT_END
    )[0]!;

    expect(dimensions).toEqual({ width: 258.67, height: 34.17 });
    expect(viewBox?.slice(1).map(Number)).toEqual([
      dimensions.width,
      dimensions.height,
    ]);
    expect(150 - dimensions.width / 2).toBeCloseTo(20.665, 3);
    expect(tracedTip.dx).toBe(CLUB_TIP_REACH);
  });

  // The mandala traces the point the trail draws from. It used to read the
  // baseline table while the trail read the override table, and the two order a
  // prop's arms differently, so the mandala came out rotated off the trail.
  it("traces the same point the trail system selected", () => {
    setTipPointOverrideProvider((propType) =>
      propType === "club" ? { points: [{ dx: 150, dy: 0 }] } : null
    );

    expect(resolveMandalaTipOffsets("club", TrackingMode.RIGHT_END)).toEqual([
      { dx: 150, dy: 0 },
    ]);
  });

  it("follows an override that reorders a prop's arms instead of tracing a different arm", () => {
    // Deliberately reorder the saved arms. The trail picks the index off the
    // saved list, so the mandala has to resolve it there too.
    const saved = [
      { dx: 124.4, dy: 0 },
      { dx: -62.2, dy: -107.8 },
      { dx: -62.2, dy: 107.8 },
    ];
    setTipPointOverrideProvider((propType) =>
      propType === "triad" ? { points: saved } : null
    );

    const [mandalaTip] = resolveMandalaTipOffsets(
      "triad",
      TrackingMode.RIGHT_END
    );
    const trail = resolveTrailPointConfig("triad");
    const trailSource = trail.right;
    expect(trailSource.type).toBe("tip");
    const trailTip = saved[(trailSource as { index: number }).index]!;

    expect(mandalaTip).toEqual({ dx: trailTip.dx, dy: trailTip.dy });
    expect(mandalaTip).toEqual({ dx: 124.4, dy: 0 });
  });

  it("keeps a zero-turn anti-spin club locus off center", () => {
    const [resolvedClubTip] = resolveMandalaTipOffsets(
      "club",
      TrackingMode.RIGHT_END
    );

    const resizedPaths = calculate(
      [zeroTurnAntiStep()],
      "club",
      undefined,
      undefined,
      {
        left: [resolvedClubTip!],
        right: [],
      }
    );
    const oldFullRadiusPaths = calculate(
      [zeroTurnAntiStep()],
      "club",
      undefined,
      undefined,
      {
        left: [{ dx: ENGINE_GRID_RADIUS, dy: 0 }],
        right: [],
      }
    );
    const scale = computeEngineAlignedMandalaScale(950);
    const resizedStart = firstPoint(resizedPaths.left[0]!.d);
    const oldStart = firstPoint(oldFullRadiusPaths.left[0]!.d);

    expect(Math.hypot(resizedStart.x, resizedStart.y) * scale).toBeCloseTo(
      ENGINE_GRID_RADIUS - CLUB_TIP_REACH,
      1
    );
    expect(Math.hypot(oldStart.x, oldStart.y) * scale).toBeCloseTo(0, 1);
  });

  it("uses the same physical endpoint selection as live trail tracking", () => {
    expect(resolveMandalaTipOffsets("club", TrackingMode.LEFT_END)).toEqual([
      { dx: CLUB_TIP_REACH, dy: 0 },
    ]);
    expect(resolveMandalaTipOffsets("staff", TrackingMode.LEFT_END)).toEqual([
      { dx: -STAFF_TIP_REACH, dy: 0 },
    ]);
    expect(resolveMandalaTipOffsets("staff", TrackingMode.RIGHT_END)).toEqual([
      { dx: STAFF_TIP_REACH, dy: 0 },
    ]);
    expect(resolveMandalaTipOffsets("staff", TrackingMode.BOTH_ENDS)).toEqual([
      { dx: -STAFF_TIP_REACH, dy: 0 },
      { dx: STAFF_TIP_REACH, dy: 0 },
    ]);
    // The fan's outer rib lands on the club's reach — the whole point of the
    // pictograph convergence.
    expect(resolveMandalaTipOffsets("fan", TrackingMode.RIGHT_END)).toEqual([
      { dx: 130, dy: 0 },
    ]);
    expect(resolveMandalaTipOffsets("staff", TrackingMode.HAND)).toEqual([
      { dx: 0, dy: 0 },
    ]);
  });

  it("keeps static sequence mandalas on each prop's canonical tips", () => {
    setTipPointOverrideProvider((propType) =>
      propType === "fan"
        ? {
            points: [
              { dx: 999, dy: -40 },
              { dx: 1_000, dy: 0 },
              { dx: 999, dy: 40 },
            ],
          }
        : null
    );

    const fanTips = resolveMandalaTipOffsets(
      "fan",
      TrackingMode.BOTH_ENDS,
      "baseline"
    );
    const staffTips = resolveMandalaTipOffsets(
      "staff",
      TrackingMode.BOTH_ENDS,
      "baseline"
    );
    const paths = calculate([staticEastStep()], "fan", "fan", undefined, {
      left: fanTips,
      right: fanTips,
    });

    expect(fanTips).toEqual([{ dx: 130, dy: 0 }]);
    expect(staffTips).toEqual([
      { dx: -STAFF_TIP_REACH, dy: 0 },
      { dx: STAFF_TIP_REACH, dy: 0 },
    ]);
    expect(paths.left).toHaveLength(1);
    expect(paths.right).toHaveLength(1);
    expect(sequenceMandalaSource).toContain("resolveMandalaTipOffsets");
    expect(sequenceMandalaSource).toMatch(
      /TrackingMode\.BOTH_ENDS,\s*"baseline"/
    );
    expect(sequenceMandalaSource).not.toContain(
      "getTipPointsBaseline(bluePropType).points"
    );
  });

  it("honors custom trail points instead of falling back to prop defaults", () => {
    setTrailPointOverrideProvider(() => ({
      left: { type: "custom", dx: -92, dy: 14 },
      right: { type: "custom", dx: 147, dy: -11 },
    }));

    expect(resolveMandalaTipOffsets("staff", TrackingMode.BOTH_ENDS)).toEqual([
      { dx: -92, dy: 14 },
      { dx: 147, dy: -11 },
    ]);
  });

  it("maps each hand's independent prop length onto the live engine pixels", () => {
    const overrides: MandalaTipOverrides = {
      left: [{ dx: CLUB_TIP_REACH, dy: 0 }],
      right: [{ dx: 300, dy: 0 }],
    };
    const paths = calculate(
      [staticEastStep()],
      "club",
      "bigstaff",
      undefined,
      overrides
    );
    const scale = computeEngineAlignedMandalaScale(950);
    const left = firstPoint(paths.left[0]!.d);
    const right = firstPoint(paths.right[0]!.d);

    expect(scale).toBeCloseTo(150 / 80, 12);
    expect(Math.hypot(left.x, left.y) * scale).toBeCloseTo(
      ENGINE_GRID_RADIUS + CLUB_TIP_REACH,
      1
    );
    expect(Math.hypot(right.x, right.y) * scale).toBeCloseTo(150 + 300, 1);
  });
});

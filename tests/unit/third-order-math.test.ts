import { describe, expect, it } from "vitest";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import {
  mapThirdOrderChildStep,
  resolveThirdOrderGridPose,
  THIRD_ORDER_CHILD_SCALE,
  wrapThirdOrderBeat,
} from "#lib/features/toys/tabs/third-order/domain/third-order-math.js";
import {
  sampleThirdOrderFlowerPose,
  thirdOrderFlowerClosureCycles,
  thirdOrderFlowerPetals,
  thirdOrderFlowerTotalBeats,
  thirdOrderRatioToSpinRatio,
  traceThirdOrderFlowerPath,
} from "#lib/features/toys/tabs/third-order/domain/third-order-flower-path.js";
import {
  THIRD_ORDER_FLOWER_RATIOS,
  type ThirdOrderCarrierPathDraft,
} from "#lib/features/toys/tabs/third-order/domain/third-order-composition.js";

const EAST: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };

const FLOWER: ThirdOrderCarrierPathDraft = {
  mode: "flower",
  ratio: "1:3",
  style: "anti",
  strength: 1,
  phase: 0,
  relationship: "SO",
  showConstruction: true,
};

describe("third-order coordinate math", () => {
  it("wraps the master clock in both directions", () => {
    expect(wrapThirdOrderBeat(17.25, 16)).toBeCloseTo(1.25);
    expect(wrapThirdOrderBeat(-0.5, 16)).toBeCloseTo(15.5);
  });

  it("fits one complete child phrase across one carrier phrase", () => {
    expect(mapThirdOrderChildStep(4, 8, 16, "phrase")).toBeCloseTo(2);
    expect(mapThirdOrderChildStep(12, 8, 16, "phrase")).toBeCloseTo(6);
  });

  it("fits the child phrase across the complete multi-cycle flower", () => {
    expect(mapThirdOrderChildStep(8, 8, 32, "phrase")).toBeCloseTo(2);
    expect(mapThirdOrderChildStep(24, 8, 32, "phrase")).toBeCloseTo(6);
  });

  it("does not accelerate an equal-length child phrase", () => {
    expect(mapThirdOrderChildStep(3.25, 16, 16, "phrase")).toBeCloseTo(3.25);
  });

  it("supports shared and independent child clocks", () => {
    expect(mapThirdOrderChildStep(5.5, 4, 16, "beats")).toBeCloseTo(1.5);
    expect(mapThirdOrderChildStep(5.5, 4, 16, "independent", 2)).toBeCloseTo(3);
  });

  it("places an east carrier hand at the canonical hand radius", () => {
    const pose = resolveThirdOrderGridPose(EAST, EAST, "world");
    expect(pose.centerX).toBeCloseTo(625);
    expect(pose.centerY).toBeCloseTo(475);
    expect(pose.scale).toBe(THIRD_ORDER_CHILD_SCALE);
    expect(pose.scale).toBe(0.5);
  });

  it("keeps world lock stable and distinguishes radial from tangent", () => {
    const southeast: PropState = {
      centerPathAngle: Math.PI / 4,
      staffRotationAngle: 0,
    };
    const world = resolveThirdOrderGridPose(EAST, southeast, "world");
    const radial = resolveThirdOrderGridPose(EAST, southeast, "radial");
    const tangent = resolveThirdOrderGridPose(EAST, southeast, "tangent");

    expect(world.rotation).toBe(0);
    expect(radial.rotation).not.toBeCloseTo(tangent.rotation);
  });
});

describe("third-order flower carrier", () => {
  it("maps the display ratio onto QfT's orbit-to-primary ratio", () => {
    expect(thirdOrderRatioToSpinRatio("2:5")).toEqual({
      propRotations: 5,
      handCycles: 2,
    });
    expect(thirdOrderFlowerClosureCycles("2:5")).toBe(2);
    expect(thirdOrderFlowerTotalBeats("2:5", 16)).toBe(32);
  });

  it("derives canonical lobe counts for prospin and antispin", () => {
    expect(thirdOrderFlowerPetals({ ratio: "2:3", style: "anti" })).toBe(5);
    expect(thirdOrderFlowerPetals({ ratio: "2:3", style: "pro" })).toBe(1);
  });

  it("keeps the summed path on the parent hand-point radius", () => {
    const sample = sampleThirdOrderFlowerPose(FLOWER, "left", 0, 16, "world");
    expect(sample.pose.centerX).toBeCloseTo(475);
    expect(sample.pose.centerY).toBeCloseTo(325);
    expect(sample.decomposition.primaryRadius).toBeCloseTo(75);
    expect(sample.decomposition.orbitRadius).toBeCloseTo(75);
  });

  it("applies the parent split-opposite relationship to the two grids", () => {
    const blue = sampleThirdOrderFlowerPose(FLOWER, "left", 0, 16, "world");
    const red = sampleThirdOrderFlowerPose(FLOWER, "right", 0, 16, "world");
    expect(blue.pose.centerY).toBeCloseTo(325);
    expect(red.pose.centerY).toBeCloseTo(625);
  });

  it("closes exact multi-cycle paths without accumulating drift", () => {
    for (const ratio of THIRD_ORDER_FLOWER_RATIOS) {
      const points = traceThirdOrderFlowerPath({ ...FLOWER, ratio }, "left");
      expect(points.at(-1)?.x).toBeCloseTo(points[0].x, 8);
      expect(points.at(-1)?.y).toBeCloseTo(points[0].y, 8);
    }
  });

  it("conserves the canonical hand radius across strength values", () => {
    for (const strength of [0, 0.25, 0.5, 0.75, 1]) {
      const { decomposition } = sampleThirdOrderFlowerPose(
        { ...FLOWER, strength },
        "left",
        0,
        16,
        "world"
      );
      expect(
        decomposition.primaryRadius + decomposition.orbitRadius
      ).toBeCloseTo(150);
    }
  });

  it("returns a finite tangent orientation at a flower cusp", () => {
    const sample = sampleThirdOrderFlowerPose(
      { ...FLOWER, ratio: "1:1" },
      "left",
      0,
      16,
      "tangent"
    );
    expect(Number.isFinite(sample.pose.rotation)).toBe(true);
  });
});

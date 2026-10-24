import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { nearestCommonReachTranslation, cylindricalGripReachBound, selectPalmReachBounds } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/geometry/CommonReachGeometry";
import { measureCylindricalGripChannel } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/geometry/CylindricalGripGeometry";
import { captureReachInputs, handDistanceBaseForRig } from "../../../src/lib/shared/3d/domain/performer-orbit-fit";
import { DEFAULT_PERFORMER_HAND_DISTANCE } from "../../../src/lib/shared/3d/domain/performer-hand-distance";
import { gridJoinScale3D, scalePerformerHandDistance3D } from "../../../src/lib/shared/3d/services/grid-join-3d";

describe("common calibrated palm reach", () => {
  it("projects into both reach balls with the minimum shared displacement", () => {
    const a = { center: new Vector3(-0.2, -0.4, 0), radius: 0.3 };
    const b = { center: new Vector3(0.2, -0.4, 0), radius: 0.3 };
    const shift = nearestCommonReachTranslation(a, b)!;
    expect(shift.x).toBeCloseTo(0, 10);
    expect(shift.y).toBeCloseTo(-0.4 + Math.sqrt(0.09 - 0.04), 10);
    for (const ball of [a, b])
      expect(shift.distanceTo(ball.center)).toBeLessThanOrEqual(
        ball.radius + 1e-10
      );
    expect(
      nearestCommonReachTranslation({ ...a, center: new Vector3(-1, 0, 0) }, b)
    ).toBeNull();
  });
  it("retains already reachable pairs and rejects malformed geometry", () => {
    expect(
      nearestCommonReachTranslation(
        { center: new Vector3(), radius: 1 },
        { center: new Vector3(), radius: 1 }
      )!.length()
    ).toBe(0);
    expect(
      nearestCommonReachTranslation(
        { center: new Vector3(), radius: NaN },
        { center: new Vector3(), radius: 1 }
      )
    ).toBeNull();
  });
  it("captures Composer with the Web orbit and stance inputs for each grid join", () => {
    const measurements = {
      upperArmM: 0.24,
      forearmM: 0.21,
      shoulderWidthM: 0.28,
      reachM: 0.45,
    };
    for (const scale of [
      gridJoinScale3D(null),
      gridJoinScale3D({ toward: "e", steps: 1 }),
      gridJoinScale3D({ toward: "e", steps: 2 }),
    ]) {
      const webHands = scalePerformerHandDistance3D(
        DEFAULT_PERFORMER_HAND_DISTANCE,
        scale
      );
      const composer = captureReachInputs("viewer", webHands, measurements);
      expect(composer.hands).toBe(webHands);
      expect(composer.measurements).toBeNull();
      const rigBase = handDistanceBaseForRig(composer.hands, scale, true);
      const rigEffective = scalePerformerHandDistance3D(rigBase, scale);
      expect(rigEffective.left.max).toBeCloseTo(webHands.left.max, 12);
      expect(rigEffective.right.max).toBeCloseTo(webHands.right.max, 12);
      expect(rigEffective.left.toward("wall" as never, 0.61))
        .toBeCloseTo(webHands.left.toward("wall" as never, 0.61), 12);
      expect(rigEffective.right.toward("wheel" as never, 2.41))
        .toBeCloseTo(webHands.right.toward("wheel" as never, 2.41), 12);

      const standaloneBase = handDistanceBaseForRig(DEFAULT_PERFORMER_HAND_DISTANCE, scale, false);
      expect(standaloneBase).toBe(DEFAULT_PERFORMER_HAND_DISTANCE);

      // Standalone performers keep the full grid and hand the body's reach
      // to the per-beat contact plan instead of shrinking the orbit.
      const standalone = captureReachInputs("measured", webHands, measurements);
      expect(standalone.hands).toBe(webHands);
      expect(standalone.measurements).toBe(measurements);
    }
  });
});


describe("confidence-bounded calibrated palm reach", () => {
  it("encloses articulated middle/index channels without the impossible rectangular bound", () => {
    const longitudinal = new Vector3(0, 1, 0);
    const normal = new Vector3(0, 0, 1);
    const transverse = new Vector3(1, 0, 0);
    const fallback = new Vector3(0, .065, 0);
    for (const lateral of [0, -.025, .025]) {
      const proximal = new Vector3(lateral, .1, 0);
      const secondLength = .045, thirdLength = .025;
      const bound = cylindricalGripReachBound(proximal, proximal.clone().add(new Vector3(0, secondLength, 0)), proximal.clone().add(new Vector3(0, secondLength + thirdLength, 0)), longitudinal, normal, transverse, fallback);
      expect(bound).toBeLessThan(.17);
      for (let a = -Math.PI; a <= Math.PI; a += .13) {
        for (let b = -Math.PI; b <= Math.PI; b += .19) {
          const middle = proximal.clone().add(new Vector3(0, Math.cos(a), Math.sin(a)).multiplyScalar(secondLength));
          const distal = middle.clone().add(new Vector3(0, Math.cos(b), Math.sin(b)).multiplyScalar(thirdLength));
          const actual = new Vector3();
          measureCylindricalGripChannel(proximal, middle, distal, longitudinal, normal, transverse, fallback, actual);
          expect(actual.length()).toBeLessThanOrEqual(bound + 1e-12);
        }
      }
    }
  });
});

describe("compatible orbit bound selection", () => {
 it("retains established bounds for every positive usable diameter", () => {
 const conservative = [.26, .26] as const, tight = [.16, .16] as const;
 expect(selectPalmReachBounds(.5200000001, conservative, tight)).toBe(conservative);
 expect(selectPalmReachBounds(1, conservative, tight)).toBe(conservative);
 });
 it("uses the rigorous bound only at an impossible established fit", () => {
 const conservative = [.26, .26] as const, tight = [.16, .16] as const;
 for (const diameter of [.52, .51]) {
 const selected = selectPalmReachBounds(diameter, conservative, tight);
 expect(selected).toBe(tight);
 expect(diameter - selected[0] - selected[1]).toBeGreaterThan(0);
 }
 });
});

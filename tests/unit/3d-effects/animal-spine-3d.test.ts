import { describe, expect, it } from "vitest";
import {
  animalBodyRadiusProfile,
  animalBuildMultiplier,
  animalSlitherMultiplier,
  applyAnimalSlither3D,
  createAnimalSpineDynamics3D,
  dampAnimalMotionBlend3D,
  stepAnimalSpineDynamics3D,
  writeAnimalRotationMinimizingFrames3D,
} from "#lib/shared/3d/effects/animal/animal-spine-3d.js";

function frameBuffers(count: number) {
  return {
    tangents: new Float32Array(count * 3),
    normals: new Float32Array(count * 3),
    binormals: new Float32Array(count * 3),
  };
}

describe("Animal 3D spine", () => {
  it("keeps the head pinned while slither grows toward the tail", () => {
    const points = new Float32Array([
      0, 0, 0, -1, 0, 0, -2, 0, 0, -3, 0, 0, -4, 0, 0,
    ]);
    const frames = frameBuffers(5);
    writeAnimalRotationMinimizingFrames3D(points, 5, frames);
    applyAnimalSlither3D(points, 5, frames, 0.7, 1, 0.6, 0.8);

    expect(Array.from(points.slice(0, 3))).toEqual([0, 0, 0]);
    expect(
      Math.hypot(points[12]! + 4, points[13]!, points[14]!)
    ).toBeGreaterThan(0.1);
  });

  it("settles a persistent fixed-length spine under its tracked head", () => {
    const target = new Float32Array([
      2, 4, 1, 1, 4, 1, 0, 4, 1, -1, 4, 1, -2, 4, 1,
    ]);
    const dynamics = createAnimalSpineDynamics3D(5);

    stepAnimalSpineDynamics3D(dynamics, target, 5, 1, 1, 1 / 60);
    for (let frame = 0; frame < 240; frame++) {
      stepAnimalSpineDynamics3D(dynamics, target, 5, 1, 0, 1 / 60);
    }

    expect(Array.from(dynamics.points.slice(0, 3))).toEqual([2, 4, 1]);
    expect(dynamics.points[12]).toBeCloseTo(2, 2);
    expect(dynamics.points[13]).toBeLessThan(0.05);
    expect(dynamics.points[14]).toBeCloseTo(1, 2);
    for (let segment = 1; segment < 5; segment++) {
      const i3 = segment * 3;
      expect(
        Math.hypot(
          dynamics.points[i3]! - dynamics.points[i3 - 3]!,
          dynamics.points[i3 + 1]! - dynamics.points[i3 - 2]!,
          dynamics.points[i3 + 2]! - dynamics.points[i3 - 1]!
        )
      ).toBeCloseTo(1, 6);
    }
  });

  it("does not wag the spine while its tracked endpoint is stationary", () => {
    const points = new Float32Array([
      0, 0, 0, 0, -1, 0, 0, -2, 0, 0, -3, 0, 0, -4, 0,
    ]);
    const before = points.slice();
    const frames = frameBuffers(5);
    writeAnimalRotationMinimizingFrames3D(points, 5, frames);

    applyAnimalSlither3D(points, 5, frames, 4.2, 1, 0.6, 0);

    expect(points).toEqual(before);
  });

  it("smooths motion entry and hold release consistently across frame rates", () => {
    let at60Fps = 1;
    let at30Fps = 1;
    for (let frame = 0; frame < 60; frame++) {
      at60Fps = dampAnimalMotionBlend3D(at60Fps, 0, 1 / 60);
    }
    for (let frame = 0; frame < 30; frame++) {
      at30Fps = dampAnimalMotionBlend3D(at30Fps, 0, 1 / 30);
    }
    expect(at60Fps).toBeCloseTo(at30Fps, 6);
    expect(at60Fps).toBeLessThan(0.02);

    const attacked = dampAnimalMotionBlend3D(at60Fps, 3, 1 / 15);
    expect(attacked).toBeGreaterThan(0.57);
  });

  it("keeps hold-entry links inextensible without scalar-blend reversals", () => {
    const count = 56;
    const spacing = 0.08;
    const target = new Float32Array(count * 3);
    for (let segment = 0; segment < count; segment++) {
      target[segment * 3] = -segment * spacing;
    }
    const dynamics = createAnimalSpineDynamics3D(count);
    stepAnimalSpineDynamics3D(dynamics, target, count, spacing, 1, 1 / 60);

    let motion = 1;
    for (let frame = 0; frame < 90; frame++) {
      motion = dampAnimalMotionBlend3D(motion, 0, 1 / 60);
      stepAnimalSpineDynamics3D(
        dynamics,
        target,
        count,
        spacing,
        motion,
        1 / 60
      );
      for (let segment = 1; segment < count; segment++) {
        const i3 = segment * 3;
        expect(
          Math.hypot(
            dynamics.points[i3]! - dynamics.points[i3 - 3]!,
            dynamics.points[i3 + 1]! - dynamics.points[i3 - 2]!,
            dynamics.points[i3 + 2]! - dynamics.points[i3 - 1]!
          )
        ).toBeCloseTo(spacing, 5);
      }
    }
  });

  it("settles to the same hanging curve at 30, 60, and 120 fps", () => {
    const count = 18;
    const spacing = 0.12;
    const target = new Float32Array(count * 3);
    for (let segment = 0; segment < count; segment++) {
      target[segment * 3] = -segment * spacing;
    }

    const settleAt = (fps: number): number[] => {
      const dynamics = createAnimalSpineDynamics3D(count);
      stepAnimalSpineDynamics3D(dynamics, target, count, spacing, 1, 1 / fps);
      for (let frame = 0; frame < fps * 2; frame++) {
        stepAnimalSpineDynamics3D(dynamics, target, count, spacing, 0, 1 / fps);
      }
      const tail = (count - 1) * 3;
      return Array.from(dynamics.points.slice(tail, tail + 3));
    };

    const at30 = settleAt(30);
    const at60 = settleAt(60);
    const at120 = settleAt(120);
    for (let axis = 0; axis < 3; axis++) {
      expect(at30[axis]).toBeCloseTo(at120[axis]!, 4);
      expect(at60[axis]).toBeCloseTo(at120[axis]!, 4);
    }
  });

  it("keeps finite orthonormal frames through vertical runs and inflections", () => {
    const points = new Float32Array([
      0, 0, 0, 0, -1, 0, 0.5, -2, 0.2, 0, -3, 0.4, -0.5, -4, 0.2, 0, -5, 0,
    ]);
    const frames = frameBuffers(6);
    writeAnimalRotationMinimizingFrames3D(points, 6, frames);

    for (let segment = 0; segment < 6; segment++) {
      const i3 = segment * 3;
      const tangent = frames.tangents.slice(i3, i3 + 3);
      const normal = frames.normals.slice(i3, i3 + 3);
      const binormal = frames.binormals.slice(i3, i3 + 3);
      for (const value of [...tangent, ...normal, ...binormal]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(Math.hypot(...tangent)).toBeCloseTo(1, 5);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
      expect(Math.hypot(...binormal)).toBeCloseTo(1, 5);
      expect(
        tangent[0]! * normal[0]! +
          tangent[1]! * normal[1]! +
          tangent[2]! * normal[2]!
      ).toBeCloseTo(0, 5);
    }
  });

  it("carries the head frame through a near-vertical tangent crossing", () => {
    const first = new Float32Array([
      0, 0, 0, 0.001, -1, 0, 0.001, -2, 0, 0.001, -3, 0,
    ]);
    const second = new Float32Array([
      0, 0, 0, -0.001, -1, 0, -0.001, -2, 0, -0.001, -3, 0,
    ]);
    const firstFrames = frameBuffers(4);
    const secondFrames = frameBuffers(4);
    writeAnimalRotationMinimizingFrames3D(first, 4, firstFrames);
    writeAnimalRotationMinimizingFrames3D(second, 4, secondFrames, {
      x: firstFrames.normals[0]!,
      y: firstFrames.normals[1]!,
      z: firstFrames.normals[2]!,
    });

    const dot =
      firstFrames.normals[0]! * secondFrames.normals[0]! +
      firstFrames.normals[1]! * secondFrames.normals[1]! +
      firstFrames.normals[2]! * secondFrames.normals[2]!;
    expect(dot).toBeGreaterThan(0.99);
  });

  it("uses distinct silhouettes for snake, dragon, and caterpillar", () => {
    expect(animalBuildMultiplier("dragon")).toBeGreaterThan(
      animalBuildMultiplier("snake")
    );
    expect(animalBuildMultiplier("caterpillar")).toBeGreaterThan(
      animalBuildMultiplier("dragon")
    );
    expect(animalBodyRadiusProfile("snake", 0.95)).toBeLessThan(
      animalBodyRadiusProfile("snake", 0.2)
    );
    expect(animalBodyRadiusProfile("caterpillar", 0.7)).toBeGreaterThan(
      animalBodyRadiusProfile("snake", 0.7)
    );
    expect(animalSlitherMultiplier("snake")).toBeLessThan(
      animalSlitherMultiplier("dragon") * 0.5
    );
  });
});

import { describe, expect, it } from "vitest";
import { createFormationFromPreset } from "@austencloud/scene-3d";

type Point = { x: number; z: number };

/** PerformerRig turns its local +Z to (sin(facing), cos(facing)). */
function forward(facingAngle: number): Point {
  return { x: Math.sin(facingAngle), z: Math.cos(facingAngle) };
}

/** Cosine between a performer's forward and the direction from it to `target`. */
function alignment(from: Point, facingAngle: number, target: Point): number {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const facing = forward(facingAngle);
  return (facing.x * dx + facing.z * dz) / Math.hypot(dx, dz);
}

describe("formation presets", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "turns every Circle performer toward the center (%i performers)",
    (count) => {
      const { slots } = createFormationFromPreset("circle", count);
      const center = {
        x: slots.reduce((sum, slot) => sum + slot.position.x, 0) / count,
        z: slots.reduce((sum, slot) => sum + slot.position.z, 0) / count,
      };

      for (const slot of slots) {
        expect(alignment(slot.position, slot.facingAngle!, center)).toBeCloseTo(
          1,
          6
        );
      }
    }
  );

  it("stands Back-to-Back performers 0.6 m apart with their backs together", () => {
    const slots = createFormationFromPreset("back-to-back", 2).slots;
    const [first, second] = slots;

    expect(
      Math.hypot(
        first!.position.x - second!.position.x,
        first!.position.z - second!.position.z
      )
    ).toBeCloseTo(0.6, 6);

    // Each performer faces straight away from the partner, so the gap lies
    // along the facing axis and their backs are toward each other.
    expect(
      alignment(first!.position, first!.facingAngle!, second!.position)
    ).toBeCloseTo(-1, 6);
    expect(
      alignment(second!.position, second!.facingAngle!, first!.position)
    ).toBeCloseTo(-1, 6);
  });
});

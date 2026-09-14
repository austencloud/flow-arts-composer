import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createEmberBoulderGeometry } from "$lib/shared/3d/environments/scenes/ember/ember-boulder-geometry";

describe("ember boulder geometry", () => {
  it("is a lumpy, bedded rock rather than a sphere", () => {
    const geometry = createEmberBoulderGeometry();
    const position = geometry.getAttribute("position");
    const point = new Vector3();
    let minRadius = Infinity;
    let maxRadius = 0;
    let lowest = 0;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      const radius = point.length();
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      lowest = Math.min(lowest, point.y);
      expect(Number.isFinite(radius)).toBe(true);
    }
    // An IcosahedronGeometry(1, 2) is a unit sphere to within a percent.
    expect(minRadius).toBeLessThan(0.82);
    expect(maxRadius).toBeGreaterThan(1.15);
    // Flattened underside: the seated quarter is squat, not a point.
    expect(lowest).toBeGreaterThan(-1);
    geometry.dispose();
  });

  it("displaces shared corners identically so the shell stays closed", () => {
    const geometry = createEmberBoulderGeometry();
    const position = geometry.getAttribute("position");
    const point = new Vector3();
    const byDirection = new Map<string, number>();
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      const radius = point.length();
      point.normalize();
      const key = [point.x, point.y, point.z]
        .map((value) => value.toFixed(4))
        .join(",");
      const seen = byDirection.get(key);
      if (seen !== undefined) expect(radius).toBeCloseTo(seen, 6);
      byDirection.set(key, radius);
    }
    // The non-indexed icosahedron repeats every corner across its faces.
    expect(byDirection.size).toBeLessThan(position.count);
    geometry.dispose();
  });

  it("is deterministic for a seed and differs across seeds", () => {
    const a = createEmberBoulderGeometry({ seed: 71 });
    const b = createEmberBoulderGeometry({ seed: 71 });
    const c = createEmberBoulderGeometry({ seed: 72 });
    expect(Array.from(a.getAttribute("position").array)).toEqual(
      Array.from(b.getAttribute("position").array)
    );
    expect(Array.from(a.getAttribute("position").array)).not.toEqual(
      Array.from(c.getAttribute("position").array)
    );
    for (const geometry of [a, b, c]) geometry.dispose();
  });
});

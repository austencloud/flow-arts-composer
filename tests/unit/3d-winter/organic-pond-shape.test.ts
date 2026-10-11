import { describe, expect, it } from "vitest";
import { createOrganicPondPoints } from "#lib/shared/3d/environments/primitives/organic-pond-shape.js";

describe("organic pond shape", () => {
  it("stays within the intended irregularity band", () => {
    const radiusX = 6;
    const radiusZ = 4.4;
    const points = createOrganicPondPoints({
      radiusX,
      radiusZ,
      seed: 2.6,
      pointCount: 48,
    });

    const normalizedRadii = points.map((point) =>
      Math.hypot(point.x / radiusX, point.y / radiusZ)
    );

    expect(Math.min(...normalizedRadii)).toBeGreaterThan(0.85);
    expect(Math.max(...normalizedRadii)).toBeLessThan(1.15);
    expect(points).toHaveLength(48);
  });

  it("is deterministic for a saved basin seed", () => {
    const options = { radiusX: 4.45, radiusZ: 3.35, seed: 4.2 };

    expect(createOrganicPondPoints(options)).toEqual(
      createOrganicPondPoints(options)
    );
  });
});

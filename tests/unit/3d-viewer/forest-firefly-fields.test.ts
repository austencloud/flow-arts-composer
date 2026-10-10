import { describe, expect, it } from "vitest";
import { FOREST_FIREFLY_FIELDS } from "#lib/shared/3d/environments/scenes/forest/forest-firefly-fields.js";

describe("Forest firefly habitats", () => {
  it("spans the clearing, both side habitats, and deep woodland", () => {
    expect(new Set(FOREST_FIREFLY_FIELDS.map((field) => field.id)).size).toBe(
      FOREST_FIREFLY_FIELDS.length
    );
    expect(FOREST_FIREFLY_FIELDS.some((field) => field.position[0] < -10)).toBe(
      true
    );
    expect(FOREST_FIREFLY_FIELDS.some((field) => field.position[0] > 10)).toBe(
      true
    );
    expect(FOREST_FIREFLY_FIELDS.some((field) => field.position[2] < -40)).toBe(
      true
    );
    expect(FOREST_FIREFLY_FIELDS.some((field) => field.position[2] > 20)).toBe(
      true
    );
  });

  it("keeps the distributed production field restrained", () => {
    const totalScale = FOREST_FIREFLY_FIELDS.reduce(
      (sum, field) => sum + field.countScale,
      0
    );
    expect(totalScale).toBeGreaterThan(1.8);
    expect(totalScale).toBeLessThan(2.2);
    expect(
      FOREST_FIREFLY_FIELDS.every(
        (field) =>
          field.area.width > 0 && field.area.height > 0 && field.area.depth > 0
      )
    ).toBe(true);
  });
});

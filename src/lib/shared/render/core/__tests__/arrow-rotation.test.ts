import { describe, it, expect } from "vitest";
import { calculateArrowRotation } from "#lib/shared/render/core/calculations/arrow-rotation.js";
import { calculateArrowRotation as calculatePackagedArrowRotation } from "@tka/render-core";
import type { GridLocation } from "#lib/shared/render/core/types.js";

/**
 * Arrow rotation orients the arrow glyph. The rotation maps encode several
 * structural relationships that the renderer relies on; testing those
 * relationships (rather than re-typing each map cell) catches a transposed or
 * mis-signed entry:
 *
 *  - ANTI is PRO with the rotation direction flipped (the maps are deliberately
 *    swapped copies).
 *  - DASH arrow rotation depends only on location, so its CW and CCW maps are
 *    identical.
 *  - FLOAT reuses the PRO maps.
 *  - A no-rotation dash uses the straight-dash map (perpendicular to travel).
 *
 * NOTE: the app copy's calculateArrowRotation takes no `turns` parameter — its
 * straight-dash branch keys solely on a no-rotation direction string. (The
 * packaged @tka/render-core copy additionally guards on turns===0; a known
 * divergence between the two render-core copies.)
 */

const ALL_LOCATIONS: GridLocation[] = [
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
];

describe("calculateArrowRotation — ANTI is PRO with flipped direction", () => {
  it("anti CW equals pro CCW at every location", () => {
    for (const loc of ALL_LOCATIONS) {
      expect(calculateArrowRotation("anti", loc, "cw")).toBe(
        calculateArrowRotation("pro", loc, "ccw")
      );
    }
  });

  it("anti CCW equals pro CW at every location", () => {
    for (const loc of ALL_LOCATIONS) {
      expect(calculateArrowRotation("anti", loc, "ccw")).toBe(
        calculateArrowRotation("pro", loc, "cw")
      );
    }
  });
});

describe("calculateArrowRotation — FLOAT reuses PRO maps", () => {
  it("float equals pro for both directions at every location", () => {
    for (const loc of ALL_LOCATIONS) {
      expect(calculateArrowRotation("float", loc, "cw")).toBe(
        calculateArrowRotation("pro", loc, "cw")
      );
      expect(calculateArrowRotation("float", loc, "ccw")).toBe(
        calculateArrowRotation("pro", loc, "ccw")
      );
    }
  });
});

describe("calculateArrowRotation — DASH rotation is direction-independent", () => {
  it("dash CW equals dash CCW at every location", () => {
    for (const loc of ALL_LOCATIONS) {
      // With a cw/ccw direction (not no-rotation) the location-based dash maps
      // are used — and they are identical for the two directions.
      expect(calculateArrowRotation("dash", loc, "cw")).toBe(
        calculateArrowRotation("dash", loc, "ccw")
      );
    }
  });
});

describe("calculateArrowRotation — straight (no-rotation) dash", () => {
  it("points perpendicular to the line of travel via the no-rotation map", () => {
    // From DASH_NO_ROTATION_MAP: vertical/horizontal straight dashes.
    expect(calculateArrowRotation("dash", "n", "no_rot", "n", "s")).toBe(90);
    expect(calculateArrowRotation("dash", "s", "no_rot", "s", "n")).toBe(270);
    expect(calculateArrowRotation("dash", "e", "no_rot", "e", "w")).toBe(180);
    expect(calculateArrowRotation("dash", "w", "no_rot", "w", "e")).toBe(0);
  });

  it("uses the straight-dash map only for an explicit no-rotation direction", () => {
    // App-copy contract: the no-rotation branch keys on the direction string. A
    // dash that still carries a cw/ccw direction uses the location-based DASH map.
    expect(calculateArrowRotation("dash", "n", "no_rot", "n", "s")).toBe(90);
    expect(calculateArrowRotation("dash", "n", "cw", "n", "s")).toBe(
      calculateArrowRotation("dash", "n", "cw")
    );
  });

  it("a reversed straight dash points the opposite way (180 apart)", () => {
    const ns = calculateArrowRotation("dash", "n", "no_rot", "n", "s");
    const sn = calculateArrowRotation("dash", "s", "no_rot", "s", "n");
    expect((((ns - sn) % 360) + 360) % 360).toBe(180);
  });
});

describe("calculateArrowRotation — static radial vs non-radial", () => {
  it("selects a different map based on the radial-orientation flag", () => {
    // STATIC radial and non-radial maps differ; the flag must route between them.
    const radial = calculateArrowRotation(
      "static",
      "n",
      "cw",
      undefined,
      undefined,
      true
    );
    const nonRadial = calculateArrowRotation(
      "static",
      "n",
      "cw",
      undefined,
      undefined,
      false
    );
    expect(radial).not.toBe(nonRadial);
  });

  it("uses the normal location map for both directions, then leaves direction to mirroring", () => {
    for (const location of ALL_LOCATIONS) {
      for (const isRadial of [true, false]) {
        const clockwise = calculateArrowRotation(
          "static",
          location,
          "cw",
          undefined,
          undefined,
          isRadial
        );
        const counterClockwise = calculateArrowRotation(
          "static",
          location,
          "ccw",
          undefined,
          undefined,
          isRadial
        );

        expect(counterClockwise).toBe(clockwise);
        expect(
          calculatePackagedArrowRotation(
            "static",
            location,
            "ccw",
            undefined,
            undefined,
            isRadial
          )
        ).toBe(clockwise);
      }
    }

    expect(
      calculateArrowRotation("static", "w", "ccw", undefined, undefined, true)
    ).toBe(270);
    expect(
      calculateArrowRotation("static", "w", "ccw", undefined, undefined, false)
    ).toBe(90);
  });
});

describe("calculateArrowRotation — output range & normalization", () => {
  it("every rotation is a multiple of 45 in [0, 360)", () => {
    for (const type of ["pro", "anti", "static", "dash", "float"]) {
      for (const dir of ["cw", "ccw"]) {
        for (const loc of ALL_LOCATIONS) {
          const a = calculateArrowRotation(
            type,
            loc,
            dir,
            undefined,
            undefined,
            true
          );
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(360);
          expect(a % 45).toBe(0);
        }
      }
    }
  });

  it("is case-insensitive on motion type and direction", () => {
    expect(calculateArrowRotation("PRO", "N", "CW")).toBe(
      calculateArrowRotation("pro", "n", "cw")
    );
  });
});

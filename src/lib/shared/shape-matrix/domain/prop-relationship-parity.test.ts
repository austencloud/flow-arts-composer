import { describe, expect, it } from "vitest";
import { propBearing } from "@tka/sequence-engine/generation";
import {
  mapOrientationToAngle,
  mapPositionToAngle,
  normalizeAnglePositive,
} from "$lib/shared/animation-engine/services/angle-calculator";
import { RADIAL_CYCLE } from "$lib/shared/render/core/calculations/orientation-angle";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

const LOCATIONS = [
  GridLocation.EAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTH,
  GridLocation.SOUTHWEST,
  GridLocation.WEST,
  GridLocation.NORTHWEST,
  GridLocation.NORTH,
  GridLocation.NORTHEAST,
] as const;

// The app draws a prop at mapOrientationToAngle(orientation, location angle)
// and the engine constrains it at propBearing(orientation, location). The
// classifier now trusts the engine's number, so the two tables must agree on
// every radial orientation at every hand location or the glyph a viewer draws
// would not be the relationship the generator enforced.
describe("engine prop bearings match the app's staff angles", () => {
  it("agrees on all 64 radial orientation and location pairs", () => {
    for (const location of LOCATIONS) {
      for (const orientation of RADIAL_CYCLE) {
        const engine = propBearing(orientation, location);
        const app = normalizeAnglePositive(
          mapOrientationToAngle(orientation, mapPositionToAngle(location))
        );
        expect(engine, `${orientation} at ${location}`).toBeCloseTo(app, 9);
      }
    }
  });
});

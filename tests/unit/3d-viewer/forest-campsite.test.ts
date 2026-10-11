import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultForestFireflyConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/forest-scene-config.js";

interface CampsiteTent {
  id: string;
  capacity: number;
  position: [number, number];
  footprint: [number, number];
  entranceFacesFire: boolean;
}

interface CampsiteLayout {
  fire: {
    position: [number, number];
    minimumTentDistance: number;
  };
  tents: CampsiteTent[];
  communalZone: {
    chairAnglesDegrees: number[];
  };
  siteLogic: {
    groundElevationMetres: number;
  };
}

interface CompositionRevision {
  status: string;
  campRelocation: {
    previousFirePosition: [number, number];
    translation: [number, number];
    approvedRelativeTentOffsets: Record<string, [number, number]>;
  };
}

const layout = JSON.parse(
  readFileSync(resolve("scripts/forest-campsite-layout.json"), "utf8")
) as CampsiteLayout;
const composition = JSON.parse(
  readFileSync(resolve("scripts/forest-composition-revision.json"), "utf8")
) as CompositionRevision;

describe("Forest authored campsite", () => {
  it("keeps the runtime fire effects centered in the approved modern fire pit", () => {
    const config = createDefaultForestFireflyConfig();
    expect([config.campfire?.position.x, config.campfire?.position.z]).toEqual(
      layout.fire.position
    );
    expect(config.campfire?.groundOffset).toBe(
      layout.siteLogic.groundElevationMetres
    );
  });

  it("implements the approved campsite translation as one preserved unit", () => {
    expect(composition.status).toBe("approved");
    expect(layout.fire.position).toEqual([
      composition.campRelocation.previousFirePosition[0] +
        composition.campRelocation.translation[0],
      composition.campRelocation.previousFirePosition[1] +
        composition.campRelocation.translation[1],
    ]);

    for (const tent of layout.tents) {
      expect([
        tent.position[0] - layout.fire.position[0],
        tent.position[1] - layout.fire.position[1],
      ]).toEqual(
        composition.campRelocation.approvedRelativeTentOffsets[tent.id]
      );
    }
  });

  it("keeps all three tent entrances outside the measured fire buffer", () => {
    expect(layout.tents).toHaveLength(3);
    expect(layout.tents.reduce((total, tent) => total + tent.capacity, 0)).toBe(
      6
    );
    expect(layout.communalZone.chairAnglesDegrees).toHaveLength(5);

    for (const tent of layout.tents) {
      const centerDistance = Math.hypot(
        tent.position[0] - layout.fire.position[0],
        tent.position[1] - layout.fire.position[1]
      );
      const footprintRadius = Math.hypot(
        tent.footprint[0] * 0.5,
        tent.footprint[1] * 0.5
      );
      expect(centerDistance - footprintRadius).toBeGreaterThanOrEqual(
        layout.fire.minimumTentDistance
      );
      expect(tent.entranceFacesFire).toBe(true);
    }
  });
});

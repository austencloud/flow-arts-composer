import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIRST_FIRE_BLENDER_COLLECTIONS,
  buildCompiledFirstFireBlenderContract,
  buildFirstFireBlenderContract,
  firstFireBlenderPointToPlan,
  firstFirePlanPointToBlender,
} from "#lib/features/museum/data/first-fire-blender-contract.js";
import { canonicalJSON } from "#lib/shared/foundation/utils/canonical-json.js";

const contract = buildFirstFireBlenderContract();
const compiledContract = buildCompiledFirstFireBlenderContract();
const manifestPath = resolve(
  "docs/superpowers/specs/first-fire-cinder-court/first-fire-cinder-court-blender-plan.json"
);

describe("First Fire Cinder Court Blender coordinate contract", () => {
  it("centres the isolated 58 by 44 metre shell without claiming live integration", () => {
    expect(contract.schemaVersion).toBe(2);
    expect(contract.sceneName).toBe("First Fire Cinder Court Graybox");
    expect(contract.room.planCentre).toEqual({ x: 29, z: 22 });
    expect(contract.room.blenderBounds).toEqual({
      minX: -29,
      maxX: 29,
      minY: -22,
      maxY: 22,
    });
    expect(contract.doors.water.blender).toEqual({ x: -29, y: 0, z: 0 });
    expect(contract.doors.earth.blender).toEqual({ x: 29, y: -12, z: 0 });
    expect(contract.coordinateSystem.gltfRuntime.mount).toBe(
      "isolated 58 x 44 metre Gate 2 review shell"
    );
    expect(contract.coordinateSystem.gltfRuntime.integrationStatus).toBe(
      "not-the-compiled-cave-fire-room"
    );
    expect(contract.approachCorridor).toBeNull();
  });

  it("lays the compiled contract on the live cave-fire room with its stamped doors and approach corridor", () => {
    expect(compiledContract.coordinateSystem.gltfRuntime.integrationStatus).toBe(
      "compiled-cave-fire-room"
    );
    expect(compiledContract.room.width).toBe(58);
    expect(compiledContract.room.depth).toBe(44.5);
    expect(compiledContract.room.planCentre).toEqual({ x: 60.25, z: 23.5 });
    for (const door of [compiledContract.doors.water, compiledContract.doors.earth]) {
      expect(door.clearWidth).toBe(4);
      expect(door.tileClearWidth).toBe(2);
    }
    expect(compiledContract.approachCorridor).not.toBeNull();
    expect(compiledContract.approachCorridor!.clearance).toBe(2.6);
    expect(compiledContract.approachCorridor!.blenderRects.length).toBeGreaterThan(0);
    // The corridor meets the west door from outside the room.
    const maxX = Math.max(
      ...compiledContract.approachCorridor!.blenderRects.map(
        (rect) => rect.centre.x + rect.sizeX / 2
      )
    );
    expect(maxX).toBeCloseTo(compiledContract.room.blenderBounds.minX, 6);
  });

  it("round-trips every authored route, court, basalt, and fire-guide point", () => {
    const planPoints = [
      ...contract.pathSections.flatMap((section) => section.planPoints),
      ...contract.courts.flatMap((court) => court.planOutline),
      ...contract.basalt.flatMap((mass) => mass.planPolygon),
      ...contract.fireGuides.flatMap((guide) => guide.planPoints),
    ];
    for (const point of planPoints) {
      const blender = firstFirePlanPointToBlender(
        point,
        contract.room.planCentre,
        2.25
      );
      const roundTrip = firstFireBlenderPointToPlan(
        blender,
        contract.room.planCentre
      );
      expect(roundTrip.x).toBeCloseTo(point.x, 12);
      expect(roundTrip.z).toBeCloseTo(point.z, 12);
    }
  });

  it("gives every court a separate entry and exit mouth", () => {
    expect(contract.courts.map((court) => court.id)).toEqual([
      "dj-court",
      "ek-court",
      "fl-court",
    ]);
    for (const court of contract.courts) {
      const shrine = contract.shrines.find(
        (candidate) => candidate.id === court.shrineId
      );
      expect(shrine).toBeDefined();
      // Every court is a two-gap ring: the visitor walks in one mouth,
      // horseshoes around the performer, and leaves through the other.
      expect(court.planOutline.length).toBe(16);
      expect(court.throatWidth).toBe(4.5);
      expect(court.sharedEntryAndExit).toBe(false);
      expect(shrine!.planEntry).not.toEqual(shrine!.planExit);
      expect(court.planThroatCentre).toEqual(shrine!.planEntry);
    }
  });

  it("carries the continuous S route, activation arcs, basalt, and non-colliding fire guides", () => {
    expect(contract.pathSections.map((section) => section.id)).toEqual([
      "water-steam-threshold",
      "ember-bridge",
      "torch-lane-to-dj",
      "dj-mouth-in",
      "dj-orbit",
      "dj-mouth-out",
      "dj-to-ek",
      "ek-mouth-in",
      "ek-orbit",
      "ek-mouth-out",
      "ek-to-fl",
      "fl-mouth-in",
      "fl-orbit",
      "fl-mouth-out",
      "earth-growth-path",
    ]);
    expect(
      contract.shrines.every((shrine) => shrine.activationZones.length === 4)
    ).toBe(true);
    expect(contract.basalt.length).toBeGreaterThanOrEqual(3);
    expect(new Set(contract.basalt.map((mass) => mass.id)).size).toBe(
      contract.basalt.length
    );
    expect(contract.basalt.every((mass) => mass.planPolygon.length >= 4)).toBe(
      true
    );
    expect(contract.fireGuides.map((guide) => guide.state)).toEqual([
      "always",
      "dj",
      "ek",
      "fl",
      "extinguished",
      "extinguished",
    ]);
    expect(contract.fireGuides.every((guide) => !guide.collision)).toBe(true);
    expect(contract.torchBudget.maximumDetailedShrines).toBe(1);
  });

  it("locks artist collections and the fixed review camera set", () => {
    expect(contract.collections).toEqual(FIRST_FIRE_BLENDER_COLLECTIONS);
    expect(new Set(contract.collections).size).toBe(
      contract.collections.length
    );
    expect(contract.cameras.map((camera) => camera.id)).toEqual([
      "water-entry",
      "ember-bridge",
      "dj-threshold",
      "ek-threshold",
      "fl-threshold",
      "blackout",
      "earth-reveal",
      "overview",
      "plan",
    ]);
  });

  it("keeps the new manifest synchronized with exact catalog and live-source parity", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      hashAlgorithm: string;
      sourceDigest: string;
      digestPayloadCanonical: string;
      sequenceSources: {
        catalog: { path: string; sha256: string };
        liveMuseum: { path: string; sha256: string };
      };
      sequenceFingerprints: Array<{
        catalogId: string;
        catalogFingerprintSha256: string;
        parity: Record<string, boolean>;
      }>;
      contract: unknown;
    };
    const digest = createHash("sha256")
      .update(
        canonicalJSON({
          contract: manifest.contract,
          sequenceSources: manifest.sequenceSources,
          sequenceFingerprints: manifest.sequenceFingerprints,
        }),
        "utf8"
      )
      .digest("hex");

    expect(manifest.hashAlgorithm).toBe("sha256");
    expect(JSON.parse(manifest.digestPayloadCanonical)).toEqual({
      contract: manifest.contract,
      sequenceSources: manifest.sequenceSources,
      sequenceFingerprints: manifest.sequenceFingerprints,
    });
    expect(manifest.digestPayloadCanonical).toBe(
      canonicalJSON({
        contract: manifest.contract,
        sequenceSources: manifest.sequenceSources,
        sequenceFingerprints: manifest.sequenceFingerprints,
      })
    );
    expect(manifest.sourceDigest).toBe(digest);
    expect(manifest.contract).toEqual(compiledContract);
    expect(manifest.sequenceSources.catalog.path).toBe(
      "static/data/hero/tnd-base-words.json"
    );
    expect(manifest.sequenceSources.liveMuseum.path).toBe(
      "src/lib/features/museum/data/museum-exhibit-sequences.ts"
    );
    expect(
      manifest.sequenceFingerprints.map(
        ({ catalogId, catalogFingerprintSha256 }) => ({
          catalogId,
          catalogFingerprintSha256,
        })
      )
    ).toEqual([
      {
        catalogId: "tnd-split-opp-jdjd",
        catalogFingerprintSha256:
          "85e671e79cdc21fd768fb295993d626015185903fb32043d8b0a9eb7cf8d1d6b",
      },
      {
        catalogId: "tnd-split-opp-keke",
        catalogFingerprintSha256:
          "41380963bebba7b5ad5435ce77b9606548f8c6d186af9e16cdd4a5af7f98b6d2",
      },
      {
        catalogId: "tnd-split-opp-lflf",
        catalogFingerprintSha256:
          "7afc9578e351d176d4c20401fc11ffa9595278cfadff33b88b6d647c7e12eb31",
      },
    ]);
    expect(
      manifest.sequenceFingerprints.every((entry) =>
        Object.values(entry.parity).every(Boolean)
      )
    ).toBe(true);
  });
});

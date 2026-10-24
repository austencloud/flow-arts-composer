import { describe, expect, it } from "vitest";
import { buildMuseumNativePerformances } from "../../../unreal/MuseumGame/Tools/museum-native-performances";
import { buildMuseumGrid } from "../../../src/lib/features/museum/services/museum-grid-builder";
import { GRID_CONFIG } from "../../../src/lib/features/museum/data/museum-room-graph";
import { MUSEUM_WALK_EDGES, MUSEUM_WALK_ROOMS } from "../../../src/lib/features/museum/data/museum-walk";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../../../src/lib/features/museum/data/museum-exhibit-sequences";

describe("Museum native authored playback", () => {
  it("preserves every bound sequence and reuses captures only for identical sequence IDs", () => {
    const { grid } = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG);
    const { performers, manifest } = buildMuseumNativePerformances(grid.performers);
    // 32: the wax docent is withheld until it has a pose.
    expect(performers).toHaveLength(32);
    expect(manifest.performances).toHaveLength(25);
    for (const station of performers) {
      if (!station.sequenceId) {
        expect(station).not.toHaveProperty("nativePlayback");
        continue;
      }
      const bound = manifest.performances.find((clip) => clip.sequenceId === station.sequenceId)!;
      expect(bound.sequence.steps).toEqual(MUSEUM_EXHIBIT_SEQUENCES[station.sequenceId]!.steps);
      expect(bound.sequence.startPlacement).toEqual(MUSEUM_EXHIBIT_SEQUENCES[station.sequenceId]!.startPlacement ?? undefined);
      expect(station).toHaveProperty("nativePlayback.profile", bound.profile);
      expect(station).toHaveProperty("nativePlayback.bodyVisible", !station.id.includes("telekinetic-formation"));
    }
    expect(performers.filter((station) => station.sequenceId)).toHaveLength(31);
  });

  it("rejects a missing authored sequence instead of substituting a demonstration loop", () => {
    expect(() => buildMuseumNativePerformances([{
      id: "broken-exhibit", tileX: 0, tileY: 0, facing: "north", autoPlay: true, sequenceId: "missing-sequence",
    }])).toThrow("Missing Museum sequence: missing-sequence");
  });
});

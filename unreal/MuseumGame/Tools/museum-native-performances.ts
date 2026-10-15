import type { PerformerDefinition } from "../../../src/lib/features/museum/domain/museum-grid-types";
import type { SequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data";
import { MUSEUM_EXHIBIT_SEQUENCES } from "../../../src/lib/features/museum/data/museum-exhibit-sequences";

export function buildMuseumNativePerformances(stations: readonly PerformerDefinition[]) {
  const profiles = new Map<string, string>();
  const performances = new Map<string, { sequenceId: string; profile: string; sequence: SequenceData }>();
  const performers = stations.map((station) => {
    if (!station.sequenceId) return { ...station };
    const source = MUSEUM_EXHIBIT_SEQUENCES[station.sequenceId];
    if (!source?.steps.length) throw new Error(`Missing Museum sequence: ${station.sequenceId}`);
    const profile = `M_${station.sequenceId.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const previous = profiles.get(profile);
    if (previous && previous !== station.sequenceId) throw new Error(`Museum profile collision: ${profile}`);
    profiles.set(profile, station.sequenceId);
    if (!performances.has(station.sequenceId)) {
      // Stable IDs let capture reuse detect authored changes without depending on a station name.
      const sequence = {
        id: `museum-native-${station.sequenceId}`,
        word: source.word,
        steps: source.steps,
        ...(source.startPlacement ? { startPlacement: source.startPlacement } : {}),
        isCircular: true,
      } as SequenceData;
      performances.set(station.sequenceId, { sequenceId: station.sequenceId, profile, sequence });
    }
    return {
      ...station,
      nativePlayback: {
        characterId: "x-bot",
        profile,
        propId: "staff",
        bodyVisible: !station.id.includes("telekinetic-formation"),
        rate: 1,
      },
    };
  });
  return {
    performers,
    manifest: {
      schema: "museum-native-performances-v1",
      characterId: "x-bot",
      propId: "staff",
      performances: [...performances.values()],
    },
  };
}

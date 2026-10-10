import {
  createAxisStream,
  resolveFilmSeed,
} from "#lib/features/film-director/domain/directive-random.js";
import { resolveCastAxis } from "#lib/features/film-director/domain/resolve-directives.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TikaDirectorAction } from "./tika-director";

export interface DirectorSequenceAssignment {
  performerId: string;
  sequence: SequenceData;
}

/**
 * Pick one library sequence per performer, all different, from a seeded
 * shuffle so the same direction on the same scene lands the same cast.
 * The library is the user's own; TIKA never names a sequence itself.
 */
export function resolveDirectorSequenceAssignments(input: {
  actions: readonly TikaDirectorAction[];
  performerIds: readonly string[];
  seedKey: string;
  library: readonly SequenceData[];
}): DirectorSequenceAssignment[] {
  if (
    !input.actions.some((action) => action.type === "assign-distinct-sequences")
  )
    return [];

  const byId = new Map<string, SequenceData>();
  for (const sequence of input.library) {
    if (sequence?.id && !byId.has(sequence.id)) byId.set(sequence.id, sequence);
  }
  const performerCount = input.performerIds.length;
  if (byId.size === 0) {
    throw new Error(
      "Your library has no saved sequences yet. Save a few sequences, then ask again."
    );
  }
  if (byId.size < performerCount) {
    throw new Error(
      `Your library has ${byId.size} sequence${byId.size === 1 ? "" : "s"} but this cast has ${performerCount} performers. Save more sequences, or remove performers, then ask again.`
    );
  }

  const seed = resolveFilmSeed(input.seedKey);
  const sceneId = "live-stage";
  const catalog = [...byId.keys()];
  const picks = resolveCastAxis<string>({
    axis: "sequenceId",
    sceneId,
    performerIds: input.performerIds,
    values: input.performerIds.map(() => ({ pick: "distinct" as const })),
    catalog,
    random: createAxisStream(seed, sceneId, "sequenceId"),
  });
  return input.performerIds.map((performerId, index) => ({
    performerId,
    sequence: byId.get(picks[index]!)!,
  }));
}

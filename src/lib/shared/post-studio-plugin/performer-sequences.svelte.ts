import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  hasPerformerTransform,
  performerSequence,
  type PerformerTransform,
} from "./performer-sequence";

/**
 * Each follower's own sequence, kept current as the front sequence and the
 * followers change. `current` is null while a transformed one is building.
 */
export function createPerformerSequences(
  getSequence: () => SequenceData | null,
  getFollowers: () => readonly PerformerTransform[] | undefined
): { readonly current: readonly SequenceData[] | null } {
  let built = $state.raw<readonly SequenceData[] | null>([]);
  $effect(() => {
    const front = getSequence();
    const followers = getFollowers() ?? [];
    if (!front || !followers.some(hasPerformerTransform)) {
      built = front ? followers.map(() => front) : [];
      return;
    }
    let cancelled = false;
    built = null;
    void Promise.all(
      followers.map((follower) => performerSequence(front, follower))
    ).then((sequences) => {
      if (!cancelled) built = sequences;
    });
    return () => {
      cancelled = true;
    };
  });
  return {
    get current() {
      return built;
    },
  };
}

/**
 * Which post take a picked video file is, and the timing Post Studio would
 * open for it. A local take keeps only its file's name, size and date, so a
 * picked file is matched on those three.
 */
import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import {
  TakeTimingSchema,
  isTakeTimingMapped,
  resolveTakeTiming,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";

export interface PickedFileIdentity {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
}

export type LoadSavedTiming = (
  sequenceId: string,
  takeKey: string,
) => TakeTiming | null;

export interface TimedTake {
  take: PostTake;
  timing: TakeTiming;
}

function takesForFile(
  project: PostProject,
  file: PickedFileIdentity,
): PostTake[] {
  return project.takes.filter(
    (take) =>
      take.ref.kind === "local" &&
      take.ref.name === file.name &&
      take.ref.size === file.size &&
      take.ref.lastModified === file.lastModified,
  );
}

/** Same rule as the editor's `openTiming`: the newer of saved and embedded. */
export function timingForTake(
  project: PostProject,
  take: PostTake,
  loadSaved: LoadSavedTiming,
): TakeTiming | null {
  const saved = loadSaved(project.sequenceId, take.takeKey);
  const embedded = project.timings?.[take.id];
  const validEmbedded =
    embedded?.sequenceId === project.sequenceId &&
    embedded.takeKey === take.takeKey &&
    TakeTimingSchema.safeParse(embedded).success
      ? embedded
      : null;
  if (saved && validEmbedded) {
    return saved.updatedAt > validEmbedded.updatedAt ? saved : validEmbedded;
  }
  return validEmbedded ?? saved;
}

/** The first take of this file with a mapped timing, or null. */
export function timedTakeForFile(
  project: PostProject,
  file: PickedFileIdentity,
  moveBeats: readonly number[],
  loadSaved: LoadSavedTiming,
): TimedTake | null {
  for (const take of takesForFile(project, file)) {
    const timing = timingForTake(project, take, loadSaved);
    if (timing && isTakeTimingMapped(resolveTakeTiming(timing, moveBeats))) {
      return { take, timing };
    }
  }
  return null;
}

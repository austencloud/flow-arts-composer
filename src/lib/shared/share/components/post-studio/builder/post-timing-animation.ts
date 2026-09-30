import type {
  PostAnimationItem,
  PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type { ResolvedTakeTiming } from "$lib/shared/media-composition/domain/take-timing";

export type MappingPreviewAppearance = NonNullable<
  PostAnimationItem["animationAppearance"]
>;

/** A readable default is never written until the performer changes a control. */
export const DEFAULT_MAPPING_PREVIEW_APPEARANCE: MappingPreviewAppearance = {
  darkMode: true,
  gridMode: "8point",
  props: true,
  stepNumbers: false,
  wordHeader: false,
};

export function mappingPreviewAppearance(
  project: PostProject,
  takeId: string | null
): MappingPreviewAppearance {
  return (
    (takeId && project.mappingPreviewAppearances?.[takeId]) ||
    DEFAULT_MAPPING_PREVIEW_APPEARANCE
  );
}

/** The next actual landing in media time, across timing sections. */
export function nextMappedLanding(
  resolved: ResolvedTakeTiming | null,
  seconds: number
): number | null {
  if (!resolved) return null;
  let next = Infinity;
  for (const section of resolved.sections) {
    for (const landing of section.landings) {
      if (landing.seconds > seconds + 0.001 && landing.seconds < next)
        next = landing.seconds;
    }
  }
  return Number.isFinite(next) ? next : null;
}

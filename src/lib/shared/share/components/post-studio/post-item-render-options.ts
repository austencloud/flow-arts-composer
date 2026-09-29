import type {
  PostAnimationItem,
  PostCardItem,
} from "$lib/shared/media-composition/domain/post-project";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";

/** A card keeps the viewer's current options until its own setting is changed. */
export function cardOptionsForItem(
  options: Partial<SequenceExportOptions> | null | undefined,
  item: PostCardItem | null | undefined
): Partial<SequenceExportOptions> | null {
  if (!item?.cardAppearance) return options ?? null;
  const { showGrid, showTKA, showTnD, showPlacements, showReversals, ...card } =
    item.cardAppearance;
  return {
    ...options,
    ...card,
    visibilityOverrides: {
      ...options?.visibilityOverrides,
      ...(showGrid === undefined ? {} : { showGrid }),
      ...(showTKA === undefined ? {} : { showTKA }),
      ...(showTnD === undefined ? {} : { showTnD }),
      ...(showPlacements === undefined ? {} : { showPlacements }),
      ...(showReversals === undefined ? {} : { showReversals }),
    },
  };
}

export function animationAppearanceForItem(
  item: PostAnimationItem | null | undefined
) {
  return item?.animationAppearance ?? null;
}

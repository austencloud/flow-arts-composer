import type {
  PostAnimationItem,
  PostMovesItem,
  PostCardItem,
} from "$lib/shared/media-composition/domain/post-project";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";

/** A card keeps the viewer's current options until its own setting is changed. */
export function cardOptionsForItem(
  options: Partial<SequenceExportOptions> | null | undefined,
  item: PostCardItem | null | undefined
): Partial<SequenceExportOptions> | null {
  if (!item?.cardAppearance) return options ?? null;
  const { showGrid, showTKA, showTnD, showPlacements, showReversals,
    showPropTnD, showHandColorKey, showNonRadialPoints, showQRCode,
    showMandala, darkMode, infoCellChoice, ...card } =
    item.cardAppearance;
  const infoCell = infoCellChoice === undefined ? {} : {
    showQRCode: infoCellChoice === "qr",
    showMandala: infoCellChoice === "mandala",
  };
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
      ...(showPropTnD === undefined ? {} : { showPropTnD }),
      ...(showHandColorKey === undefined ? {} : { showHandColorKey }),
      ...(showNonRadialPoints === undefined ? {} : { showNonRadialPoints }),
      ...(showQRCode === undefined ? {} : { showQRCode }),
      ...(showMandala === undefined ? {} : { showMandala }),
      ...infoCell,
      ...(darkMode === undefined ? {} : { darkMode }),
    },
  };
}

export function animationAppearanceForItem(
  item: PostAnimationItem | PostMovesItem | null | undefined
) {
  return item?.animationAppearance ?? null;
}

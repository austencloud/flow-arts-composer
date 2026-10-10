import type {
  PostAnimationAppearance,
  PostAnimationItem,
  PostMovesItem,
  PostCardItem,
} from "#lib/shared/media-composition/domain/post-project.js";
import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";

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

const tunnelLooks = new WeakMap<PostAnimationItem, PostAnimationAppearance>();
const NO_APPEARANCE: PostAnimationAppearance = {};

/**
 * The look a live animation draws with. While its opening tunnel plays
 * (`intro`), what the tunnel shows differently is read over the animation's
 * own look. One item gives back one object, so the canvas sees no change from
 * frame to frame. An animation whose tunnel has a look of its own stays on its
 * own canvas after the intro even when it has no look of its own, so the
 * hand-off never swaps canvases.
 */
export function animationAppearanceForItem(
  item: PostAnimationItem | PostMovesItem | null | undefined,
  intro = false
): PostAnimationAppearance | null {
  if (item?.kind === "animation" && item.tunnelHook && item.tunnelAppearance) {
    if (!intro) return item.animationAppearance ?? NO_APPEARANCE;
    let look = tunnelLooks.get(item);
    if (!look) {
      look = { ...item.animationAppearance, ...item.tunnelAppearance };
      tunnelLooks.set(item, look);
    }
    return look;
  }
  return item?.animationAppearance ?? null;
}

/**
 * The mandala comes in with the grid and glyph as the tunnel hands over, when
 * the tunnel hides it and the animation shows it.
 */
export function tunnelHidesMandala(
  item: PostAnimationItem | PostMovesItem | null | undefined
): boolean {
  return (
    item?.kind === "animation" &&
    !!item.tunnelHook &&
    item.tunnelAppearance?.mandala === false &&
    item.animationAppearance?.mandala !== false
  );
}

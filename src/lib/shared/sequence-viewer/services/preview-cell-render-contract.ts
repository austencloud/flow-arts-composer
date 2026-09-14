import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PrepareOptions } from "$lib/shared/pictograph/shared/services/types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
import type {
  LayerRenderOptions,
  LayerVisibility,
} from "$lib/shared/render/services/types";
import type { PreviewCellRenderOptions } from "./preview-cell-renderer";

function filterSoloMotions(
  data: PictographData,
  viewMode: BrowseViewMode
): PictographData {
  const keepHand = viewMode.hand;
  const motions = { ...data.motions };
  if (keepHand === "left") {
    delete motions.right;
  } else {
    delete motions.left;
  }
  return { ...data, motions };
}

// Live cards and bitmap exports resolve the same prop, hand-path and glyph rules.
export function resolvePreviewCellRender(
  pictographData: PictographData,
  isDark: boolean,
  options: PreviewCellRenderOptions
) {
  const viewMode = options.browseViewMode;
  const isHandsView = viewMode?.subject === "hands";
  const isSoloView = viewMode?.granularity === "solo";

  const isHandPath = (options.handPathMode ?? false) || isHandsView;
  const effectiveLeftProp = isHandPath ? PropType.HAND : options.leftPropType;
  const effectiveRightProp = isHandPath
    ? PropType.HAND
    : options.catDogModeEnabled
      ? options.rightPropType
      : options.leftPropType;

  const soloFiltered = isSoloView
    ? filterSoloMotions(pictographData, viewMode!)
    : pictographData;

  const dataForRender = soloFiltered;

  // Hand-path mode swaps both props for HANDs, so chirality is meaningless
  // there — passing it would only fragment the cache.
  const leftFlipped = isHandPath
    ? false
    : (options.leftBuugengFlipped ?? false);
  const rightFlipped = isHandPath
    ? false
    : (options.rightBuugengFlipped ?? false);

  const prepareOptions: PrepareOptions = {
    fanAppearance: isHandPath ? undefined : options.fanAppearance,
    themeMode: isDark ? "dark" : "light",
    leftPropType: effectiveLeftProp,
    rightPropType: effectiveRightProp,
    handPathMode: isHandPath,
    showLeftMotion: options.showLeftMotion,
    showRightMotion: options.showRightMotion,
    leftBuugengFlipped: leftFlipped,
    rightBuugengFlipped: rightFlipped,
  };

  const isMotionSolo =
    (options.showLeftMotion === true && options.showRightMotion === false) ||
    (options.showRightMotion === true && options.showLeftMotion === false);
  const suppressOverlays = isHandPath || isSoloView || isMotionSolo;

  const renderOptions: LayerRenderOptions = {
    fanAppearance: isHandPath ? undefined : options.fanAppearance,
    primaryPropColors: options.primaryPropColors,
    size: options.size,
    widthMultiplier: options.widthMultiplier,
    darkMode: isDark,
    showNonRadialPoints: options.showNonRadialPoints ?? true,
    showGrid: options.showGrid ?? true,
    handPointVisibility: options.handPointVisibility ?? "all",
    leftPropType: effectiveLeftProp,
    rightPropType: effectiveRightProp,
    leftBuugengFlipped: leftFlipped,
    rightBuugengFlipped: rightFlipped,
    showLeftMotion: options.showLeftMotion,
    showRightMotion: options.showRightMotion,
    showTnD: suppressOverlays ? false : (options.showTnD ?? false),
    showElemental: suppressOverlays ? false : (options.showElemental ?? false),
    showPositions: suppressOverlays ? false : (options.showPositions ?? false),
  };

  const visibility: LayerVisibility = {
    showTKA: suppressOverlays ? false : (options.showTKA ?? true),
    showReversals: suppressOverlays ? false : (options.showReversals ?? true),
  };

  return { data: dataForRender, prepareOptions, renderOptions, visibility };
}

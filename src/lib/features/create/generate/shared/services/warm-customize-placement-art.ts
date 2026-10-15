/**
 * Customize's Start and End tiles draw the sixteen start placements with the
 * live pictograph renderer. The first drawing in a session loads the arrow
 * placement tables and the arrow and prop art, and that load used to land in
 * the middle of the card's morph: the panel stuttered on its first open only.
 * The Generate grid warms the same pictographs while the page is idle, so the
 * first open draws from the preparer's cache like every open after it.
 *
 * The options follow the ones PictographContainer prepares with, read from the
 * same settings. A setting the warm-up misses only costs a cache miss on open;
 * the shared tables and art are loaded either way.
 */
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { loadStartPlacementVariations } from "#lib/shared/components/placement-picker/placement-variations.js";
import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { normalizeFanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { normalizePropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

const warmed = new Set<GridMode>();

async function warm(gridMode: GridMode): Promise<void> {
  const settings = getSettings();
  const options = {
    themeMode: getAnimationVisibilityManager().isDarkMode()
      ? ("dark" as const)
      : ("light" as const),
    leftPropType: settings.leftPropType,
    rightPropType: settings.rightPropType,
    leftBuugengFlipped: settings.leftBuugengFlipped ?? false,
    rightBuugengFlipped: settings.rightBuugengFlipped ?? false,
    fanAppearance: normalizeFanAppearance(settings.fanAppearance),
    propLook: normalizePropLook(settings.propArtwork),
    triangleGrip: normalizeTriangleGrip(settings.triangleGrip),
    showLeftMotion: true,
    showRightMotion: true,
  };
  for (const variation of loadStartPlacementVariations(gridMode)) {
    await pictographPreparer.prepareSingle(variation, options);
  }
}

export function warmCustomizePlacementArtWhenIdle(gridMode: GridMode): void {
  if (warmed.has(gridMode) || typeof window === "undefined") return;
  warmed.add(gridMode);
  const run = () => {
    warm(gridMode).catch(() => {
      // A failed warm-up just means the tiles load on open as before.
      warmed.delete(gridMode);
    });
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}

/**
 * Customize's Start and End tiles draw the sixteen start placements with the
 * live pictograph renderer. The first drawing in a session loads the arrow
 * placement tables, the arrow and prop art, the grid and the placement
 * letters, and that load used to land in the middle of the card's morph: the
 * panel stuttered on its first open only.
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
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { svgPreloader } from "#lib/shared/pictograph/shared/services/svg-preloader.js";
import * as TKAGlyphModule from "#lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";

// Plain tsc types a .svelte import as a default component only; the glyph's
// module script also exports its letter-size preloader.
const { preloadLetterDimensions } = TKAGlyphModule as unknown as {
  preloadLetterDimensions(
    letters: (string | null | undefined)[]
  ): Promise<void>;
};

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
    triangleGrip: normalizeTriangleGrip(settings.triangleGrip),
    showLeftMotion: true,
    showRightMotion: true,
  };
  const variations = loadStartPlacementVariations(gridMode);
  // GridSvg draws a skewed grid for skewed mode and the diamond grid,
  // turned, for everything else; TKAGlyph caches each letter once.
  await Promise.all([
    svgPreloader.getSvgContent(
      "grid",
      gridMode === GridMode.SKEWED ? "skewed_grid" : "diamond_grid"
    ),
    preloadLetterDimensions(variations.map((v) => v.letter)),
  ]);
  for (const variation of variations) {
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

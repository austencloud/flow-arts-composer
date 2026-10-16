/**
 * Hand Motions opens on four pictures of a hand moving from the Start box.
 * Drawn cold, each one takes a few hundred milliseconds to prepare, and
 * arriving from Hand Placements that preparation ran during the board's
 * flight: the pictures showed loading dots, then their moves started late
 * (Austen, 2026-10-15: "noticeable delay"). Hand Placements warms the same
 * pictures while the learner is still placing hands, so Hand Motions draws
 * them from the preparer's cache the moment it mounts.
 *
 * The options follow the ones PictographContainer prepares the intro's
 * pictures with: hands for props, the left hand only, the session's settings
 * otherwise. A setting the warm-up misses only costs a cache miss.
 */
import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  MOTION_MAP_HOME,
  handMovePictographData,
  motionMapTargets,
} from "#lib/shared/guide-topics/hand-motions-topic.js";
import { normalizeFanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { normalizePropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import { normalizeTriangleGrip } from "#lib/shared/pictograph/prop/domain/triangle-appearance.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { svgPreloader } from "#lib/shared/pictograph/shared/services/svg-preloader.js";

let warmed = false;

async function warm(): Promise<void> {
  const settings = getSettings();
  const options = {
    themeMode: getAnimationVisibilityManager().isDarkMode()
      ? ("dark" as const)
      : ("light" as const),
    leftPropType: PropType.HAND,
    rightPropType: PropType.HAND,
    leftBuugengFlipped: settings.leftBuugengFlipped ?? false,
    rightBuugengFlipped: settings.rightBuugengFlipped ?? false,
    fanAppearance: normalizeFanAppearance(settings.fanAppearance),
    propLook: normalizePropLook(settings.propArtwork),
    triangleGrip: normalizeTriangleGrip(settings.triangleGrip),
    showLeftMotion: true,
    showRightMotion: false,
  };
  const start = MOTION_MAP_HOME;
  const pictures = [
    start,
    ...motionMapTargets(start).map((target) => target.to),
  ]
    .map((to) => handMovePictographData(start, to))
    .filter((data): data is PictographData => data !== null);
  await svgPreloader.getSvgContent("grid", "diamond_grid");
  for (const data of pictures) {
    await pictographPreparer.prepareSingle(data, options);
  }
}

/** Prepares the Hand Motions intro's pictures once, while the page is idle. */
export function warmHandMotionsIntroWhenIdle(): void {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const run = () => {
    warm().catch(() => {
      // A failed warm-up just means the pictures prepare on arrival.
      warmed = false;
    });
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else {
    setTimeout(run, 1500);
  }
}

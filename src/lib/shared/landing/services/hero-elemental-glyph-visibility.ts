import { untrack } from "svelte";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

type ElementalGlyphVisibilityManager = Pick<
  AnimationVisibilityStateManager,
  "getVisibility" | "setVisibility"
>;

/**
 * Push the hero's element eligibility into the observer-backed animation
 * manager without letting synchronous canvas observers become dependencies of
 * the calling effect. The equality guard also avoids waking the render stack
 * when two consecutive hero draws have the same eligibility.
 */
export function syncHeroElementalGlyphVisibility(
  manager: ElementalGlyphVisibilityManager,
  visible: boolean
): void {
  untrack(() => {
    if (manager.getVisibility("elementalGlyph") === visible) return;
    manager.setVisibility("elementalGlyph", visible);
  });
}

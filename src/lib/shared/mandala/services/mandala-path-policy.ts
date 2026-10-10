import type { AnimationPathPolicy } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import type { MandalaPathShape } from "../domain/mandala-types";

/**
 * The canvas states its motion-path choice as a shape plus a By Motion flag;
 * a mandala states the same choice as one shape name, where "hybrid" IS By
 * Motion. One conversion, used by every surface that draws a mandala beside
 * an animation, so the card's paths cannot say concave while the props swing
 * on arcs.
 */
export function toMandalaPathShape(
  policy: AnimationPathPolicy
): MandalaPathShape {
  return policy.motionAwarePaths ? "hybrid" : policy.pathShape;
}

/**
 * Translate a mandala control choice back into the animation's motion policy.
 * Hybrid keeps the last fixed shape underneath it, just like the animation
 * canvas does, so switching back out of By Motion restores the user's choice.
 */
export function toAnimationPathPolicy(
  shape: MandalaPathShape,
  current: AnimationPathPolicy
): AnimationPathPolicy {
  return shape === "hybrid"
    ? { ...current, motionAwarePaths: true }
    : { pathShape: shape, motionAwarePaths: false };
}

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PostStudioLayerPainter } from "./post-studio-layer-painter";

/**
 * The Animate/compose module's video export already bakes the beat number,
 * letter glyph, element icon and progress bar into its own canvas - the real
 * implementation lives in features/compose so it can reuse those exact
 * drawing helpers. shared/ must not import features/ (one-way dependency),
 * so this registry takes the implementation as a factory registered once at
 * app startup, mirroring get-video-export-orchestrator.ts's pattern.
 */
let factory: ((sequence: SequenceData) => PostStudioLayerPainter) | null = null;

/**
 * Register the factory that builds the Animate-parity overlay painter.
 * Called once from features/compose's composition-root registration - see
 * src/lib/shared/composition-root/deferred-registrations.ts.
 */
export function registerAnimationOverlayPainterFactory(
  fn: (sequence: SequenceData) => PostStudioLayerPainter
): void {
  factory = fn;
}

/**
 * Builds a fresh painter for `sequence`, or null when nothing has registered
 * yet (the deferred registrations load via requestIdleCallback, so an early
 * caller can beat them there). A Post Studio host should treat null as "no
 * overlay to paint" rather than an error - the animation layer still renders
 * correctly without it, just without the baked-in beat number/glyphs.
 */
export function createAnimationOverlayPainter(
  sequence: SequenceData
): PostStudioLayerPainter | null {
  return factory ? factory(sequence) : null;
}

/**
 * Like `createAnimationOverlayPainter`, but loads the deferred registrations
 * first when they have not run yet, the way the Animate export's own
 * orchestrator getter does.
 */
export async function loadAnimationOverlayPainter(
  sequence: SequenceData
): Promise<PostStudioLayerPainter | null> {
  if (!factory) {
    await import("$lib/shared/composition-root/deferred-registrations");
  }
  return createAnimationOverlayPainter(sequence);
}

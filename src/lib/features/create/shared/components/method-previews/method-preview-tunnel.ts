/**
 * The Create front door's Tunnel preview (TunnelScene.svelte): its formation,
 * its beats, and the sequence the performer takes when its dice is pressed.
 * Pure, so tests check them without drawing.
 */
import { rotateSequenceGeometry } from "#lib/shared/create/services/sequence-derived-fields.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** The Tunnel's own Radial preset (TUNNEL_PRESETS): four performers. */
export const TUNNEL_PREVIEW_PRESET = "radial";

/** The scene's beats, in milliseconds, in the order they play. */
export const TUNNEL_PREVIEW_TIMING = Object.freeze({
  /** The tunnel plays before the finger comes in. */
  leadMs: 700,
  /** The stage fades out once the dice is pressed. */
  fadeOutMs: 180,
  /** The longest the scene waits for the new tunnel to build and paint. */
  buildWaitMs: 1200,
  /** The new tunnel fades in. */
  fadeInMs: 260,
});

/**
 * The performer's next sequence: a fresh draw when one came, else the
 * current sequence turned an eighth. A quarter turn would map the four-fold
 * ring onto itself and look the same.
 */
export function nextTunnelSequence(
  current: SequenceData,
  fresh: SequenceData | null
): SequenceData {
  if (fresh && fresh.steps.length > 0) return fresh;
  return rotateSequenceGeometry(current, 1);
}

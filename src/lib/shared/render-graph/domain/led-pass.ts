/**
 * LED pass payload.
 *
 * Backend-neutral description of one frame of addressable LED props. The
 * photometry lives in `animation-engine/domain/led-photometry.ts` and is
 * resolved by the backend, which is the only side that knows the pixel
 * geometry a footprint and a streak density depend on. The payload carries
 * only what the translator owns: the prop's flux budget, the shutter the
 * frames integrate under, and the glare weight.
 */

import type { LedShutter } from "#lib/shared/animation-engine/domain/led-photometry.js";

export interface LedSegment {
  /** Position in NDC. */
  position: [number, number];
  /** RGB color 0..1. */
  color: [number, number, number];
  /** 0..1 brightness at this segment. */
  brightness: number;
}

export interface LedTipState {
  tipId: string;
  /** Ordered LED positions along the prop shaft, base→tip. */
  segments: LedSegment[];
  /**
   * Luminous flux this prop emits, in linear HDR render units. Its LEDs divide
   * it between them, so LED count is a resolution control and never a
   * brightness control.
   */
  propFlux: number;
  /** Enable motion streak accumulation. */
  motionStreak: boolean;
}

export interface LedPassPayload {
  tips: LedTipState[];
  /** Persistence model the accumulation buffer integrates under. */
  shutter: LedShutter;
  /**
   * Bloom pyramid per-mip weight. Sets the composite point-spread's falloff
   * exponent; it is a camera property applied once to the frame, never a
   * per-LED halo.
   */
  glare: number;
}

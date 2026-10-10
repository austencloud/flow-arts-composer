/**
 * Canvas 2D backend parameter interfaces.
 *
 * Each extends the intent layer with 2D-specific extras that have
 * no clean 3D analog (shadow blur, canvas blend modes, etc.). The
 * translator derives them from the intent; users never see them.
 */

import type {
  TrailsIntent,
  FireIntent,
  LedIntent,
  CharcoalIntent,
  ZapIntent,
  SparklesIntent,
  GhostIntent,
  BloomIntent,
  GooIntent,
  BubblesIntent,
  PetalsIntent,
  SmokeIntent,
  InkIntent,
  FrostIntent,
  SilkIntent,
  AnimalIntent,
  PulseIntent,
} from "../domain/effects-config";
import type { WaterPalette } from "../domain/water-palettes";
import type { BubblePalette } from "../domain/bubble-palettes";
import type { PetalPalette } from "../domain/petal-palettes";
import type { SmokePalette } from "../domain/smoke-palettes";
import type { InkPalette } from "#lib/shared/3d/effects/ink/ink-palettes.js";
import type { FrostPalette } from "../domain/frost-palettes";
import type { SilkPalette } from "../domain/silk-palettes";
import type { AnimalPalette } from "../domain/animal-palettes";
import type { PulsePalette } from "../domain/pulse-palettes";

export interface Trails2DParams extends TrailsIntent {
  /** px value for ctx.lineWidth. Derived from thickness. */
  lineWidth: number;
  /** 0-1. Derived from brightness. */
  maxOpacity: number;
  /** 0-1. Derived as brightness * 0.3. */
  minOpacity: number;
  /** px value for ctx.shadowBlur. Default 3; overridable via 2D advanced. */
  glowBlur: number;
  /** Canvas composite op. Default 'source-over'. */
  blendMode?: GlobalCompositeOperation;
}

export interface Fire2DParams extends FireIntent {
  /** Hz - optional override for idle flame pulse rate. */
  flickerRate?: number;
  /** Canvas composite op. */
  canvasBlendMode?: GlobalCompositeOperation;
  /** px - optional halo blur. */
  shadowBlur?: number;
}

export interface Led2DParams extends LedIntent {
  /** px - LED dot radius when rendered to 2D canvas. */
  dotRadius?: number;
}

export interface Charcoal2DParams extends CharcoalIntent {
  /** Max particle count in the 2D particle pool. */
  particleCount?: number;
  /** Canvas composite op. */
  canvasBlendMode?: GlobalCompositeOperation;
}

export interface Zap2DParams extends ZapIntent {
  /** Segment count along each arc. Derived from intensity + distance. */
  segments: number;
  /** px - random jitter radius per segment midpoint. */
  jitterAmount: number;
  /** px - shadowBlur for the glow pass. */
  glowBlur: number;
  /** px - core line width. */
  lineWidth: number;
}

export interface Sparkles2DParams extends SparklesIntent {
  /** Max particles alive at once. */
  poolSize: number;
  /** px - base particle radius before `size` multiplier. */
  baseRadius: number;
  /**
   * Per-particle base scale (the band center) derived from `size`. Carries the
   * dial→scale remap and its size cap so the renderer stays policy-free; the
   * renderer multiplies this by a random ±30% jitter for glint-to-glint variety.
   */
  sizeScaleBase: number;
  /** Canvas composite op. */
  blendMode?: GlobalCompositeOperation;
}

export interface Ghost2DParams extends GhostIntent {
  /** Canvas composite op. Default 'lighter' so overlapping phantoms brighten. */
  blendMode?: GlobalCompositeOperation;
}

export interface Bloom2DParams extends BloomIntent {
  /** Canvas composite op. Default 'lighter' so overlapping halos brighten. */
  blendMode?: GlobalCompositeOperation;
}

export interface GooParams extends GooIntent {
  /** Resolved palette swatches (intent's palette enum → concrete hex stops). */
  resolvedPalette: WaterPalette;
  /** Max droplets alive at once. Tier-dependent: 512 / 1024 / 2048. */
  poolSize: number;
  /** px - base droplet radius before `intensity` multiplier. */
  baseRadius: number;
  /** Droplets/sec at `ambientEmission=1`. */
  ambientSpawnRate: number;
  /** Droplets/sec at full velocity * `motionEmission=1`. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar (tuned against medium spin). */
  motionReferenceSpeed: number;
  /** Canvas composite op - `source-over` for body, `lighter` for highlight. */
  blendMode?: GlobalCompositeOperation;
}

export interface Bubbles2DParams extends BubblesIntent {
  /** Resolved palette swatches (intent's palette enum → concrete hex stops). */
  resolvedPalette: BubblePalette;
  /** Max bubbles alive at once. Tier-dependent: 512 / 1024 / 2048. */
  poolSize: number;
  /** px - base bubble radius before `intensity` multiplier. */
  baseRadius: number;
  /** Bubbles/sec at `ambientEmission=1`. */
  ambientSpawnRate: number;
  /** Bubbles/sec at full velocity * `motionEmission=1`. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar. */
  motionReferenceSpeed: number;
  /** Canvas composite op - default `source-over`, pop bursts use `lighter`. */
  blendMode?: GlobalCompositeOperation;
}

export interface Petals2DParams extends PetalsIntent {
  /** Resolved palette (sprite list + tint range + optional ember flag). */
  resolvedPalette: PetalPalette;
  /** Max petals alive at once. Tier-dependent: 512 / 1024 / 2048. */
  poolSize: number;
  /** px - base petal half-size before `intensity` multiplier. */
  baseSize: number;
  /** Petals/sec at `ambientEmission=1`. */
  ambientSpawnRate: number;
  /** Petals/sec at full velocity * `motionEmission=1`. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar. */
  motionReferenceSpeed: number;
  /** px/s - base downward velocity at `fallSpeed=1`. */
  fallBaseSpeed: number;
  /** Canvas composite op - `source-over` for bodies; ember rim uses `lighter` internally. */
  blendMode?: GlobalCompositeOperation;
}

export interface Smoke2DParams extends SmokeIntent {
  /** Resolved palette (core/edge colors + behavior multipliers). */
  resolvedPalette: SmokePalette;
  /** Max puffs alive at once. Tier-dependent: 512 / 1024 / 2048. */
  poolSize: number;
  /** px - base puff radius before `intensity` multiplier. */
  baseRadius: number;
  /** Puffs/sec at `ambientEmission=1`. */
  ambientSpawnRate: number;
  /** Puffs/sec at full velocity * `motionEmission=1`. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar. */
  motionReferenceSpeed: number;
  /**
   * Resolved lifetime in seconds (palette.lifetime; ±20% per-particle
   * jitter applied at spawn). Kept on params so the renderer doesn't
   * reach into the palette every frame.
   */
  lifetimeSeconds: number;
  /**
   * Resolved curl magnitude = intent.curlStrength * palette.curlBias.
   * The renderer multiplies the noise field by this scalar.
   */
  resolvedCurlStrength: number;
  /**
   * Resolved rise speed = intent.riseSpeed * palette.riseBias * RISE_BASE.
   * In 2D (screen-space), y grows downward so "rise" is a negative vy.
   */
  resolvedRiseSpeed: number;
  /**
   * Curl-noise field wavelength (world-units per radian of noise space).
   * Lower = tighter eddies. 0.5 matches the spec's NOISE_SCALE.
   */
  noiseScale: number;
  /**
   * Base world-up rise magnitude (before palette/user multipliers).
   * Pulled out so tests can assert on it. Spec: RISE_BASE ≈ 1.5.
   */
  riseBaseSpeed: number;
  /** Canvas composite op. `source-over` suits light-on-dark smoke. */
  blendMode?: GlobalCompositeOperation;
}

export interface Ink2DParams extends InkIntent {
  /**
   * Resolved palette (pigment + edge + splatter + pool + behavior flags).
   * Renderer reads `pigment`, `edge`, and the `watercolor`/`emissive`
   * flags in sprint 1; splatterTint + poolTint are sprint-2 consumers.
   */
  resolvedPalette: InkPalette;
  /**
   * Canvas composite op.
   *   - `source-over` for india/sumi/watercolor/blood/acid/custom (opaque
   *     pigment - THE #1 differentiator from trails).
   *   - `lighter` when palette.emissive is true (neon only).
   * Sprint 1 renderer computes the final composite from palette.emissive
   * rather than honoring this field; kept for documentation of the
   * intended mapping.
   */
  blendMode?: GlobalCompositeOperation;
  /**
   * Resolved ambient emission after the motion-dominant hard cap.
   * `effectiveAmbient = min(intent.ambientEmission, 0.3)`. Renderer
   * reads this so the cap is enforced at translate time, not at draw
   * time.
   */
  effectiveAmbient: number;
  /** Strokes-points/sec at `effectiveAmbient=1`. Spec AMBIENT_BASE_RATE=2. */
  ambientSpawnRate: number;
  /** Strokes-points/sec at full velocity * `motionEmission=1`. Spec MOTION_BASE_RATE=15. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar. Spec MOTION_REFERENCE_SPEED=3.0. */
  motionReferenceSpeed: number;
  /** Min stroke width (px) - reached at high tip speed (brush lifting). */
  strokeWidthMin: number;
  /**
   * Max stroke width (px) - reached at low tip speed (brush pressing).
   * Watercolor palette doubles this in the renderer (wide bleed).
   */
  strokeWidthMax: number;
  /**
   * Max alpha at peak (0-1). Watercolor palette caps this at 0.4 - that's
   * why the palette reads translucent vs the rest of the ink family.
   */
  opacityMax: number;
  /** Seconds - maximum age of a stroke point before its local fade completes. */
  lifetimeSeconds: number;
  /** Max stroke points per tip. Path length is the primary visible-history bound. */
  maxPointsPerTip: number;
  /** Maximum recorded stroke length in reference-canvas pixels. */
  strokeLengthPx: number;
  /** Min stamp scale factor - reached at high tip speed (brush lifting). */
  stampScaleMin: number;
  /** Max stamp scale factor - reached at low tip speed (brush pressing). */
  stampScaleMax: number;
  /** Gravity acceleration in px/s² for detached droplets. */
  gravityPx: number;
  /** Gravity acceleration in px/s² for the attached painted strand. */
  strokeGravityPx: number;
  /** Max stretch distance (px) before strand breaks. Scaled by (1-viscosity). */
  breakStretchMax: number;
  /** Max droplets alive at once from strand breakup. */
  dropletPoolSize: number;
  /** Base max lifetime for droplets (seconds). */
  dropletMaxAge: number;
}

export interface Frost2DParams extends FrostIntent {
  /** Resolved palette swatches. */
  resolvedPalette: FrostPalette;
  /** Max aura particles alive at once. Tier-dependent: 512 / 1024 / 2048. */
  auraPoolSize: number;
  /** px - base aura particle radius before `intensity` multiplier. */
  baseRadius: number;
  /** Particles/sec at `ambientEmission=1`. */
  ambientSpawnRate: number;
  /** Particles/sec at full velocity * `motionEmission=1`. */
  motionSpawnRate: number;
  /** World units/s that maps to full motion scalar. */
  motionReferenceSpeed: number;
  /** Particle lifetime range low (seconds). */
  lifetimeMin: number;
  /** Particle lifetime range high (seconds). */
  lifetimeMax: number;
  /** Canvas composite op. */
  blendMode?: GlobalCompositeOperation;
  /** Max crystal sprites alive at once. Tier-dependent: 128 / 256 / 512. */
  crystalPoolSize: number;
  /** px - minimum distance between crystal spawn points along trail. */
  crystalSpacing: number;
  /** seconds - time for crystal to grow from 0 to full size. */
  crystalGrowDuration: number;
}

export interface Silk2DParams extends SilkIntent {
  resolvedPalette: SilkPalette;
  /** px - base ribbon half-width at width=1. */
  baseHalfWidth: number;
  /** seconds - sample lifetime at duration=1. */
  lifetimeSeconds: number;
  /** World units/s that maps to full motion scalar. */
  motionReferenceSpeed: number;
  /** Canvas composite op. */
  blendMode?: GlobalCompositeOperation;
}

export interface Animal2DParams extends AnimalIntent {
  resolvedPalette: AnimalPalette;
  /** px - base body half-width at width=1. */
  baseHalfWidth: number;
  /** px - fixed total arc-length of the creature body. */
  bodyLengthPx: number;
  /** Number of spine chain nodes (head = node 0). */
  segmentCount: number;
  /** px - max lateral undulation amplitude at the tail. */
  slitherAmpPx: number;
  /** Canvas composite op. */
  blendMode?: GlobalCompositeOperation;
}

export interface Pulse2DParams extends PulseIntent {
  resolvedPalette: PulsePalette;
  /** px - max ring expansion radius. */
  maxRadius: number;
  /** px - stroke width or gradient band width. */
  ringWidth: number;
  /** World units/s reference speed for velocity trigger. */
  refSpeed: number;
  /** Canvas composite op. */
  blendMode: GlobalCompositeOperation;
}

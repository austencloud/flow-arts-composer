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
import type {
  Trails2DParams,
  Fire2DParams,
  Led2DParams,
  Charcoal2DParams,
  Zap2DParams,
  Sparkles2DParams,
  Ghost2DParams,
  Bloom2DParams,
  GooParams,
  Bubbles2DParams,
  Petals2DParams,
  Smoke2DParams,
  Ink2DParams,
  Frost2DParams,
  Silk2DParams,
  Animal2DParams,
  Pulse2DParams,
} from "./canvas2d-types";
import { resolveWaterPalette } from "../domain/water-palettes";
import { resolveBubblePalette } from "../domain/bubble-palettes";
import { resolvePetalPalette } from "../domain/petal-palettes";
import { resolveSmokePalette } from "../domain/smoke-palettes";
import { resolveInkPalette } from "#lib/shared/3d/effects/ink/ink-palettes.js";
import { resolveFrostPalette } from "../domain/frost-palettes";
import { resolveSilkPalette } from "../domain/silk-palettes";
import { resolveAnimalPalette } from "../domain/animal-palettes";
import { resolvePulsePalette } from "../domain/pulse-palettes";
import {
  DEFAULT_TRAIL_GLOW_BLUR,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

/**
 * Fold the effects-config trail VISUALS into a legacy TrailSettings base.
 *
 * The 2D trail overlay reads only TrailSettings, but the visual dials
 * (thickness, brightness, colors) now live on the unified effects config
 * (TrailsIntent); rendering params (mode, fade, tailLength, trackingMode) stay
 * on TrailSettings. Any 2D surface driven from BOTH stores must fold here -
 * otherwise a preset/dial change mutates a store the renderer never reads.
 * Mirrors resolveTrails2D's intent->param mapping. Returns `base` unchanged
 * when no intent is supplied.
 */
export function foldTrailIntentIntoSettings(
  base: TrailSettings,
  intent: TrailsIntent | null | undefined
): TrailSettings {
  if (!intent) return base;
  return {
    ...base,
    lineWidth: intent.thickness,
    maxOpacity: intent.brightness,
    minOpacity: intent.brightness * 0.3,
    leftColor: intent.leftColor,
    rightColor: intent.rightColor,
  };
}

export function resolveTrails2D(
  intent: TrailsIntent,
  override: Partial<Trails2DParams> = {}
): Trails2DParams {
  const defaults: Omit<Trails2DParams, keyof TrailsIntent> = {
    lineWidth: intent.thickness,
    maxOpacity: intent.brightness,
    minOpacity: intent.brightness * 0.3,
    glowBlur: DEFAULT_TRAIL_GLOW_BLUR,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveFire2D(
  intent: FireIntent,
  override: Partial<Fire2DParams> = {}
): Fire2DParams {
  return { ...intent, ...override };
}

export function resolveLed2D(
  intent: LedIntent,
  override: Partial<Led2DParams> = {}
): Led2DParams {
  const defaults: Omit<Led2DParams, keyof LedIntent> = {
    dotRadius: 2,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveCharcoal2D(
  intent: CharcoalIntent,
  override: Partial<Charcoal2DParams> = {}
): Charcoal2DParams {
  const defaults: Omit<Charcoal2DParams, keyof CharcoalIntent> = {
    particleCount: 200,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveZap2D(
  intent: ZapIntent,
  override: Partial<Zap2DParams> = {}
): Zap2DParams {
  const defaults: Omit<Zap2DParams, keyof ZapIntent> = {
    segments: Math.max(4, Math.round(6 + intent.intensity * 10)),
    jitterAmount: 6 + intent.intensity * 10,
    // Glow halo now follows the dedicated `glow` knob (was intensity-derived).
    // 6 + glow*22 ≈ the old 8 + intensity*12 around the midpoints.
    glowBlur: 6 + intent.glow * 22,
    lineWidth: 1.5 + intent.intensity * 1.5,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveSparkles2D(
  intent: SparklesIntent,
  override: Partial<Sparkles2DParams> = {}
): Sparkles2DParams {
  // Size dial → per-particle base scale, authored against the 500px reference
  // canvas. Linear remap across the FULL slider into a capped range: size=0 →
  // SIZE_SCALE_MIN (fine micro-dust), size=1 → MIN+SPAN (the largest glint we
  // allow, ~8px stars at reference). The span tops out well before the cross
  // stars read as overwhelming blobs, so no value is ever overwhelming and no
  // slider travel is dead - every position maps to a distinct size. The renderer
  // adds a random ±30% jitter on top for glint-to-glint variety.
  const SIZE_SCALE_MIN = 0.25;
  const SIZE_SCALE_SPAN = 0.4;
  const sizeScaleBase = SIZE_SCALE_MIN + intent.size * SIZE_SCALE_SPAN;

  const defaults: Omit<Sparkles2DParams, keyof SparklesIntent> = {
    poolSize: 256,
    baseRadius: 3,
    sizeScaleBase,
    blendMode: "lighter",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveGhost2D(
  intent: GhostIntent,
  override: Partial<Ghost2DParams> = {}
): Ghost2DParams {
  const defaults: Omit<Ghost2DParams, keyof GhostIntent> = {
    blendMode: "lighter",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveBloom2D(
  intent: BloomIntent,
  override: Partial<Bloom2DParams> = {}
): Bloom2DParams {
  const defaults: Omit<Bloom2DParams, keyof BloomIntent> = {
    blendMode: "lighter",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveGoo2D(
  intent: GooIntent,
  override: Partial<GooParams> = {}
): GooParams {
  const defaults: Omit<GooParams, keyof GooIntent> = {
    resolvedPalette: resolveWaterPalette(intent),
    poolSize: 1024,
    baseRadius: 4,
    ambientSpawnRate: 8,
    motionSpawnRate: 40,
    motionReferenceSpeed: 3.0,
    blendMode: "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveBubbles2D(
  intent: BubblesIntent,
  override: Partial<Bubbles2DParams> = {}
): Bubbles2DParams {
  const defaults: Omit<Bubbles2DParams, keyof BubblesIntent> = {
    resolvedPalette: resolveBubblePalette(intent),
    poolSize: 1024,
    baseRadius: 6,
    ambientSpawnRate: 6,
    motionSpawnRate: 30,
    motionReferenceSpeed: 3.0,
    blendMode: "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolvePetals2D(
  intent: PetalsIntent,
  override: Partial<Petals2DParams> = {}
): Petals2DParams {
  const defaults: Omit<Petals2DParams, keyof PetalsIntent> = {
    resolvedPalette: resolvePetalPalette(intent),
    poolSize: 1024,
    baseSize: 8,
    ambientSpawnRate: 2,
    motionSpawnRate: 34,
    motionReferenceSpeed: 3.0,
    fallBaseSpeed: 100,
    blendMode: "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

/**
 * Resolve ink for the 2D backend.
 *
 * Composes user intent with palette behavior flags:
 *   - effectiveAmbient = min(intent.ambientEmission, 0.3) - motion-dominant
 *     hard cap. Ink is a stroke medium: at full ambient a still tip adds at
 *     most 0.6 points/s, against 60 points/s from motion.
 *   - opacityMax = watercolor ? 0.68 : 1.0 - palette-carried opacity cap.
 *     Watercolor is translucent by identity (not a user knob).
 *   - strokeWidthMax = palette material profile. Neon is narrowest;
 *     Watercolor carries the widest faint bleed.
 *   - attached-stroke gravity = viscosity-gated. Detached droplets keep full
 *     gravity while ordinary painted marks stay on the choreography.
 *   - compositing stays with the renderer's material branches: neon is the
 *     only emissive ink palette, every other palette is opaque pigment.
 *
 * The current production tuning is governed by
 * docs/superpowers/specs/active/2026-08-14-ink-sumi-material-redesign.md.
 */
export function resolveInk2D(
  intent: InkIntent,
  override: Partial<Ink2DParams> = {}
): Ink2DParams {
  const palette = resolveInkPalette(intent);
  const AMBIENT_BASE_RATE = 2;
  // 60 points/s at full motion → one new point every frame at 60fps.
  // 15 was too sparse; strokes had visible gaps between recorded positions.
  const MOTION_BASE_RATE = 60;
  const MOTION_REFERENCE_SPEED = 3.0;
  const STROKE_WIDTH_MIN = 2;
  const SUMI_STROKE_WIDTH_MIN = 10;
  const STROKE_WIDTH_MAX_BASE = 14;
  const SUMI_STROKE_WIDTH_MAX = 42;
  const WATERCOLOR_STROKE_WIDTH_MAX = 13;
  const NEON_STROKE_WIDTH_MAX = 10;
  // 60 pts/s * 3s lifetime = 180 candidate points, cap at 90 so the
  // bounded-history shift doesn't eat the newest stroke while keeping
  // older tail visible for the full lifetime.
  const MAX_POINTS_PER_TIP = 90;

  // Motion-dominant hard cap on ambient. Even at slider=1 the effective
  // ambient rate is 30% of AMBIENT_BASE_RATE.
  const effectiveAmbient = Math.min(intent.ambientEmission, 0.3);

  // Watercolor gets its width from a faint bleed pass around a normal-sized
  // pigment body. Doubling the body here made production-size marks look like
  // a blue hose once several motions crossed each other.
  const opacityMax = palette.watercolor ? 0.68 : 1.0;
  const isSumi = palette.id === "sumi";
  const isNeon = palette.emissive === true;
  const strokeWidthMax = palette.watercolor
    ? WATERCOLOR_STROKE_WIDTH_MAX
    : isNeon
      ? NEON_STROKE_WIDTH_MAX
      : isSumi
        ? SUMI_STROKE_WIDTH_MAX
        : STROKE_WIDTH_MAX_BASE;
  const lifetimeSeconds = palette.watercolor
    ? 2.2
    : isNeon
      ? 1.55
      : isSumi
        ? 2.15
        : 2.2;
  const maxPointsPerTip = palette.watercolor
    ? 84
    : isNeon
      ? 64
      : isSumi
        ? 72
        : MAX_POINTS_PER_TIP;
  const strokeLengthPx = palette.watercolor
    ? 320
    : isNeon
      ? 220
      : isSumi
        ? 340
        : 320;
  const gravityPx = palette.watercolor ? 180 * 0.2 : 180;
  // Attached pigment follows the brush. Only a deliberately viscous dense ink
  // (viscosity above 0.55) sags, and even then much less than a detached
  // droplet. Every shipped look sits below that line, so its marks stay on
  // the choreography; droplets keep full gravity.
  const denseSag = Math.max(0, Math.min(1, (intent.viscosity - 0.55) / 0.45));
  const strokeGravityPx =
    palette.watercolor || isSumi || isNeon ? 0 : gravityPx * denseSag * 0.65;

  const defaults: Omit<Ink2DParams, keyof InkIntent> = {
    resolvedPalette: palette,
    effectiveAmbient,
    ambientSpawnRate: AMBIENT_BASE_RATE,
    motionSpawnRate: MOTION_BASE_RATE,
    motionReferenceSpeed: MOTION_REFERENCE_SPEED,
    strokeWidthMin: isSumi ? SUMI_STROKE_WIDTH_MIN : STROKE_WIDTH_MIN,
    strokeWidthMax,
    opacityMax,
    lifetimeSeconds,
    maxPointsPerTip,
    strokeLengthPx,
    gravityPx,
    strokeGravityPx,
    breakStretchMax: 80,
    dropletPoolSize: 512,
    dropletMaxAge: 1.5,
  };
  return { ...intent, ...defaults, ...override };
}

/**
 * Resolve smoke for the 2D backend.
 *
 * Composes user intent with palette behavioral multipliers:
 *   - lifetimeSeconds       = palette.lifetime (±20% per-particle jitter at spawn)
 *   - resolvedCurlStrength  = intent.curlStrength * palette.curlBias
 *   - resolvedRiseSpeed     = intent.riseSpeed * palette.riseBias * RISE_BASE
 *
 * The renderer reads only the resolved fields - palette colors flow
 * through `resolvedPalette.core/edge`. This matches the spec's
 * "palette owns lifetime/curl/rise" contract.
 */
export function resolveSmoke2D(
  intent: SmokeIntent,
  override: Partial<Smoke2DParams> = {}
): Smoke2DParams {
  const palette = resolveSmokePalette(intent);
  // Spec tuning constants. RISE_BASE is the screen-space px/s rise at
  // slider=1 before palette bias. 2D uses px, so a tuned absolute value
  // replaces 3D's world-unit value.
  // Boussinesq buoyancy target velocity at riseSpeed=1, palette.riseBias=1
  // and temperature=1. The renderer advects vy toward this target with
  // linear drag (DRAG=0.6/s) - time constant ≈1.7s - so the target is an
  // upper bound that long-lived puffs approach asymptotically. Short-lived
  // genie puffs only reach ~60% of target before cooling. Value tuned
  // against Bridson 2007 + Boussinesq approximation for visual plausibility.
  const RISE_BASE_PX = 280;
  const defaults: Omit<Smoke2DParams, keyof SmokeIntent> = {
    resolvedPalette: palette,
    poolSize: 1024,
    baseRadius: 18,
    ambientSpawnRate: 4,
    motionSpawnRate: 20,
    motionReferenceSpeed: 3.0,
    lifetimeSeconds: palette.lifetime,
    resolvedCurlStrength: intent.curlStrength * palette.curlBias,
    resolvedRiseSpeed: intent.riseSpeed * palette.riseBias * RISE_BASE_PX,
    noiseScale: 0.5,
    riseBaseSpeed: RISE_BASE_PX,
    blendMode: "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveFrost2D(
  intent: FrostIntent,
  override: Partial<Frost2DParams> = {}
): Frost2DParams {
  const palette = resolveFrostPalette(intent);
  const AMBIENT_BASE_RATE = 24;
  const MOTION_BASE_RATE = 60;
  const MOTION_REFERENCE_SPEED = 3.0;

  const defaults: Omit<Frost2DParams, keyof FrostIntent> = {
    resolvedPalette: palette,
    auraPoolSize: 2048,
    baseRadius: 10,
    ambientSpawnRate: AMBIENT_BASE_RATE,
    motionSpawnRate: MOTION_BASE_RATE,
    motionReferenceSpeed: MOTION_REFERENCE_SPEED,
    lifetimeMin: 1.8,
    lifetimeMax: 3.5,
    blendMode: "screen",
    crystalPoolSize: 256,
    crystalSpacing: 18,
    crystalGrowDuration: 0.6,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveSilk2D(
  intent: SilkIntent,
  override: Partial<Silk2DParams> = {}
): Silk2DParams {
  const palette = resolveSilkPalette(intent);
  const defaults: Omit<Silk2DParams, keyof SilkIntent> = {
    resolvedPalette: palette,
    baseHalfWidth: 5 + intent.width * 25, // 5-30px
    lifetimeSeconds: 0.5 + intent.duration * 3.5, // 0.5-4.0s
    motionReferenceSpeed: 3.0,
    blendMode: palette.emissive ? "lighter" : "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveAnimal2D(
  intent: AnimalIntent,
  override: Partial<Animal2DParams> = {}
): Animal2DParams {
  const palette = resolveAnimalPalette(intent);
  const defaults: Omit<Animal2DParams, keyof AnimalIntent> = {
    resolvedPalette: palette,
    // Slender is the look: at full width the body is ~30px thick, not ~60. A
    // long, thin creature reads as elegant; a short fat one reads as a cartoon.
    baseHalfWidth: 2.5 + intent.width * 13, // 2.5-15.5px
    bodyLengthPx: 160 + intent.bodyLength * 440, // 160-600px fixed spine length
    segmentCount: 56,
    // The body traces the tip's own path now, so the undulation is a garnish on
    // top of that shape — a big wave just serrates the figure being drawn.
    slitherAmpPx: intent.slither * 20,
    blendMode: palette.emissive ? "lighter" : "source-over",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolvePulse2D(
  intent: PulseIntent,
  override: Partial<Pulse2DParams> = {}
): Pulse2DParams {
  const palette = resolvePulsePalette(intent);
  const defaults: Omit<Pulse2DParams, keyof PulseIntent> = {
    resolvedPalette: palette,
    maxRadius: 20 + intent.reach * 180,
    ringWidth:
      intent.style === "stroke"
        ? 1 + intent.thickness * 4
        : 3 + intent.thickness * 12,
    refSpeed: 3.0,
    blendMode: "lighter",
  };
  return { ...intent, ...defaults, ...override };
}

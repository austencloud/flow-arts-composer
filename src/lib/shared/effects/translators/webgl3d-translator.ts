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
import { normalizeGooLiquidControls } from "../domain/effects-config";
import type {
  Trails3DParams,
  Fire3DParams,
  Led3DParams,
  Charcoal3DParams,
  Zap3DParams,
  Sparkles3DParams,
  Ghost3DParams,
  Bloom3DParams,
  Goo3DParams,
  Bubbles3DParams,
  Petals3DParams,
  Smoke3DParams,
  Ink3DParams,
  Frost3DParams,
  Silk3DParams,
  Animal3DParams,
  Pulse3DParams,
} from "./webgl3d-types";
import {
  resolveGhostAngleQuantization,
  resolveGhostLifetimeSeconds,
  resolveGhostPositionQuantization,
} from "../domain/ghost-parameters";
import { resolveWaterPalette } from "../domain/water-palettes";
import { resolveBubblePalette } from "../domain/bubble-palettes";
import { resolvePetalPalette } from "../domain/petal-palettes";
import { resolveSmokePalette } from "../domain/smoke-palettes";
import { resolveInkPalette } from "#lib/shared/3d/effects/ink/ink-palettes.js";
import { resolveFrostPalette } from "../domain/frost-palettes";
import { resolveSilkPalette } from "../domain/silk-palettes";
import { resolveAnimalPalette } from "../domain/animal-palettes";
import { resolvePulsePalette } from "../domain/pulse-palettes";
import { resolveSmokeVolumeProfile3D } from "#lib/shared/3d/effects/smoke/smoke-volume-profile-3d.js";
import { resolveCharcoal3DMotionProfile } from "./charcoal-3d-motion-profiles";

/**
 * A 34" staff in world units — 1 world unit is 1 metre (AUSTEN_STAFF from
 * @austencloud/scene-3d is 34in × 2.54cm × 0.01). Stated as a plain number so
 * this translator stays free of the 3D scene package. It is the ruler every
 * pixel→world mapping below is measured against: 2D effect constants are
 * authored in canvas pixels, and reading those pixels as metres is what put
 * 7-metre sparkles on a 0.86m staff.
 */
const STAFF_WORLD_LENGTH = 0.8636;

export function resolveTrails3D(
  intent: TrailsIntent,
  override: Partial<Trails3DParams> = {}
): Trails3DParams {
  const defaults: Omit<Trails3DParams, keyof TrailsIntent> = {
    tubeRadius: intent.thickness * 0.008, // 0.008-0.096 world units
    maxPoints: 256,
    emissive: intent.brightness * 2.0, // HDR > 1.0
    bloomWeight: intent.brightness * 0.4,
    taperCurve: "exponential",
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveFire3D(
  intent: FireIntent,
  override: Partial<Fire3DParams> = {}
): Fire3DParams {
  const defaults: Omit<Fire3DParams, keyof FireIntent> = {
    volumetricDensity: 0.3 + intent.intensity * 0.7,
    emissionRate: 200 + intent.intensity * 800,
    buoyancy: 1.2 + intent.intensity * 0.8,
    dragCoefficient: 0.15,
    vortexStrength: intent.turbulence * 3.0,
    shadowCasting: false,
    bloomContribution: intent.intensity * 0.6,
    // A prop flame passes within centimetres of the performer's face. Three.js
    // point lights use inverse-square falloff, so this stays below half a
    // candela even at the hottest setting. The particles still own the visible
    // flame and bloom; this light only lets nearby skin and props catch it.
    lightIntensity: 0.08 + intent.brightness * 0.22 + intent.intensity * 0.16,
    // brightness 0 → 0.08 (dim ember, stays under the scene bloom threshold
    // even where the flame is dense), 0.5 → 0.53 (tamed woodfire default), 1 →
    // 0.98 (hot, blooms). Low floor + the brightness-scaled shader emission
    // curve mean dragging brightness down actually tames the flame.
    emissiveHot: 0.08 + intent.brightness * 0.9,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveLed3D(
  intent: LedIntent,
  override: Partial<Led3DParams> = {}
): Led3DParams {
  const defaults: Omit<Led3DParams, keyof LedIntent> = {
    segmentCount: 200,
    povPersistenceDuration: 0.12,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveCharcoal3D(
  intent: CharcoalIntent,
  override: Partial<Charcoal3DParams> = {}
): Charcoal3DParams {
  const emissionStyle =
    override.emissionStyle ?? intent.emissionStyle ?? "steel-wool";
  const motionProfile =
    override.motionProfile ?? resolveCharcoal3DMotionProfile(emissionStyle);
  const defaults: Omit<Charcoal3DParams, keyof CharcoalIntent> = {
    particleLifetime: 0.55 + intent.spread * 0.65 + intent.glow * 0.45,
    gravity: (7.4 - intent.spread * 1.8) * motionProfile.gravityScale,
    sparkSizeJitter: 0.2 + intent.spread * 0.55,
    motionProfile,
  };
  return { ...intent, emissionStyle, ...defaults, ...override };
}

export function resolveZap3D(
  intent: ZapIntent,
  override: Partial<Zap3DParams> = {}
): Zap3DParams {
  const defaults: Omit<Zap3DParams, keyof ZapIntent> = {
    segments: Math.max(4, Math.round(5 + intent.intensity * 8)),
    jitterAmount: 0.08 + intent.intensity * 0.14,
    pointLightIntensity: intent.intensity > 0.5 ? intent.intensity * 2.0 : 0,
    regenerateEveryFrames: 3,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveSparkles3D(
  intent: SparklesIntent,
  override: Partial<Sparkles3DParams> = {}
): Sparkles3DParams {
  const defaults: Omit<Sparkles3DParams, keyof SparklesIntent> = {
    poolSize: 512,
    // Scaled by intent.size so the Size control does something in 3D; at the
    // default size 0.5 this lands exactly on baseRadius's 3cm.
    baseRadius: 0.03 * (0.5 + intent.size),
    // Map normalized intent.gravity (0=floaty,1=fast fall) to world-units/s.
    // 0 → small upward drift (-0.2), 1 → strong downward pull (+5.0).
    worldGravity: -0.2 + intent.gravity * 5.2,
    // intent.spread is 2D canvas pixels (0-30). Map that authoring range onto a
    // world radius: full spread is a quarter-staff cloud around the tip. The
    // default spread of 8 lands at ~5.8cm.
    worldSpread: (intent.spread / 30) * (STAFF_WORLD_LENGTH * 0.25),
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveGhost3D(
  intent: GhostIntent,
  override: Partial<Ghost3DParams> = {}
): Ghost3DParams {
  const defaults: Omit<Ghost3DParams, keyof GhostIntent> = {
    lifetimeSeconds: resolveGhostLifetimeSeconds(intent.decay),
    positionQuantization: resolveGhostPositionQuantization(
      intent.interval,
      STAFF_WORLD_LENGTH,
      0.012
    ),
    angleQuantization: resolveGhostAngleQuantization(intent.interval),
    rimPower: 2.35,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveBloom3D(
  intent: BloomIntent,
  override: Partial<Bloom3DParams> = {}
): Bloom3DParams {
  const defaults: Omit<Bloom3DParams, keyof BloomIntent> = {
    // The authored radius is a 2D pixel value. Map the 8..90 control range to
    // an optical radius that stays proportional to a 0.86m staff.
    haloRadiusWorld:
      0.14 + ((Math.max(8, Math.min(90, intent.radius)) - 8) / 82) * 0.58,
    motionReferenceSpeed: 3,
    historyLifetimeSeconds:
      intent.afterglow <= 0.001 ? 0 : 0.08 + intent.afterglow * 0.95,
    historySampleDistanceWorld: 0.065 - intent.afterglow * 0.04,
    // Keep HDR headroom for post bloom without allowing every preset to clip
    // into the same white source. Core strength now owns that source directly.
    emissiveStrength: 1.1 + intent.intensity * 1.6,
    lightIntensity: 0.8 + intent.intensity * 2.2,
    lightRange: 3.5 + intent.radius / 45,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveGoo3D(
  intent: GooIntent,
  override: Partial<Goo3DParams> = {}
): Goo3DParams {
  const goo = {
    ...intent,
    ...normalizeGooLiquidControls(intent),
  };
  const defaults: Omit<Goo3DParams, keyof GooIntent> = {
    resolvedPalette: resolveWaterPalette(goo),
    poolSize: 1024,
    baseRadius: 0.04,
    ambientSpawnRate: 8,
    motionSpawnRate: 40,
    motionReferenceSpeed: 3.0,
    worldGravity: -9.8 * goo.gravity,
  };
  return { ...goo, ...defaults, ...override };
}

export function resolveBubbles3D(
  intent: BubblesIntent,
  override: Partial<Bubbles3DParams> = {}
): Bubbles3DParams {
  const defaults: Omit<Bubbles3DParams, keyof BubblesIntent> = {
    resolvedPalette: resolveBubblePalette(intent),
    poolSize: 1024,
    baseRadius: 0.07,
    ambientSpawnRate: 6,
    motionSpawnRate: 30,
    motionReferenceSpeed: 3.0,
    // 0.2 m/s at buoyancy=0 → 1.6 m/s at buoyancy=1. Bubbles always rise
    // at least a little - a motionless bubble looks dead.
    riseSpeed: 0.2 + intent.buoyancy * 1.4,
    // 1.0-3.0s lifetime driven by intensity (bigger bubbles last longer
    // before max-size pop takes over).
    lifetime: 1.0 + intent.intensity * 2.0,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolvePetals3D(
  intent: PetalsIntent,
  override: Partial<Petals3DParams> = {}
): Petals3DParams {
  const defaults: Omit<Petals3DParams, keyof PetalsIntent> = {
    resolvedPalette: resolvePetalPalette(intent),
    poolSize: 1024,
    baseSize: 0.1,
    // 3D emission is dual-source: ambient-from-ceiling + motion-from-tip.
    // Ambient rate stays lower than 2D because 3D petals live longer per
    // particle (longer descent path).
    ambientAboveRate: 3,
    motionTipRate: 18,
    motionReferenceSpeed: 3.0,
    // 3D uses +y = up, so falling is negative velocity.
    fallBaseSpeed: 0.95,
    swayBaseSpeed: 0.45,
    swayFrequency: 0.85,
    lifetime: 3.0 + intent.intensity * 2.5,
  };
  return { ...intent, ...defaults, ...override };
}

/**
 * Resolve smoke for the 3D backend.
 *
 * Matches the 2D translator's palette-composition rules; the only 3D-
 * specific bits are world-unit tunings (base radius in meters, rise in
 * m/s). Curl/rise biases are composed the same way:
 *   resolvedCurlStrength = intent.curlStrength * palette.curlBias
 *   resolvedRiseSpeed    = intent.riseSpeed * palette.riseBias * RISE_BASE
 */
export function resolveSmoke3D(
  intent: SmokeIntent,
  override: Partial<Smoke3DParams> = {}
): Smoke3DParams {
  const palette = resolveSmokePalette(intent);
  const RISE_BASE_M = 1.5; // m/sec upward at riseSpeed=1, palette.riseBias=1
  const defaults: Omit<Smoke3DParams, keyof SmokeIntent> = {
    resolvedPalette: palette,
    poolSize: 1024,
    baseRadius: 0.18,
    ambientSpawnRate: 4,
    motionSpawnRate: 20,
    motionReferenceSpeed: 3.0,
    lifetimeSeconds: palette.lifetime,
    resolvedCurlStrength: intent.curlStrength * palette.curlBias,
    resolvedRiseSpeed: intent.riseSpeed * palette.riseBias * RISE_BASE_M,
    noiseScale: 0.5,
    riseBaseSpeed: RISE_BASE_M,
    volumeProfile: resolveSmokeVolumeProfile3D(palette),
  };
  return { ...intent, ...defaults, ...override };
}

/**
 * Resolve ink for the 3D backend.
 *
 * The translator pre-composes the stroke-width/alpha/material decisions for
 * the scene-level ink renderer. World-unit tunings mirror the 2D translator's px
 * tunings through a 60 px/world-unit scale factor.
 *
 *   strokeWidthMaxWorld = 12 px * (watercolor ? 2 : 1) / 60 px/world
 *                      ≈ 0.2 world-units (0.4 watercolor)
 *   strokeWidthMinWorld = 1 px / 60 ≈ 0.017 world-units
 *
 * Palette-carried behavior matches the 2D translator: watercolor caps
 * opacity at 0.4 + doubles width; neon flips emissiveMaterial true so
 * the 3D renderer uses additive blend instead of flat-shaded. Those
 * five other palettes stay opaque - the default ink read in 3D is
 * pigment, not glow.
 */
export function resolveInk3D(
  intent: InkIntent,
  override: Partial<Ink3DParams> = {}
): Ink3DParams {
  const palette = resolveInkPalette(intent);
  const STROKE_WIDTH_MAX_BASE_WORLD = 0.2; // ≈ 12 px / 60 px-per-world
  const STROKE_WIDTH_MIN_WORLD = 0.017; // ≈ 1 px / 60 px-per-world
  const LIFETIME_SECONDS_BASE = 4.5;
  const MAX_POINTS_PER_TIP = 40;
  const MOTION_REFERENCE_SPEED = 3.0;

  const effectiveAmbient = Math.min(intent.ambientEmission, 0.3);
  const opacityMax = palette.watercolor ? 0.4 : 1.0;
  const strokeWidthMaxWorld = palette.watercolor
    ? STROKE_WIDTH_MAX_BASE_WORLD * 2
    : STROKE_WIDTH_MAX_BASE_WORLD;
  const emissiveMaterial = !!palette.emissive;

  const defaults: Omit<Ink3DParams, keyof InkIntent> = {
    resolvedPalette: palette,
    effectiveAmbient,
    strokeWidthMaxWorld,
    strokeWidthMinWorld: STROKE_WIDTH_MIN_WORLD,
    opacityMax,
    emissiveMaterial,
    lifetimeSeconds: LIFETIME_SECONDS_BASE,
    maxPointsPerTip: MAX_POINTS_PER_TIP,
    motionReferenceSpeed: MOTION_REFERENCE_SPEED,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveSilk3D(
  intent: SilkIntent,
  override: Partial<Silk3DParams> = {}
): Silk3DParams {
  const defaults: Omit<Silk3DParams, keyof SilkIntent> = {
    resolvedPalette: resolveSilkPalette(intent),
    baseHalfWidthWorld: (5 + intent.width * 25) / 60,
    lifetimeSeconds: 0.5 + intent.duration * 3.5,
    motionReferenceSpeed: 3,
    maxPointsPerTip: 320,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveAnimal3D(
  intent: AnimalIntent,
  override: Partial<Animal3DParams> = {}
): Animal3DParams {
  const defaults: Omit<Animal3DParams, keyof AnimalIntent> = {
    resolvedPalette: resolveAnimalPalette(intent),
    baseRadiusWorld: (2.5 + intent.width * 13) / 60,
    // Arc length needs a different ruler than stroke width. The 2D body range
    // spans the canvas, while the 3D stage cell is only a few staff lengths.
    bodyLengthWorld: (160 + intent.bodyLength * 440) / 180,
    segmentCount: 56,
    slitherAmplitudeWorld: (intent.slither * 20) / 60,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolvePulse3D(
  intent: PulseIntent,
  override: Partial<Pulse3DParams> = {}
): Pulse3DParams {
  const ringPixels =
    intent.style === "stroke"
      ? 1 + intent.thickness * 4
      : 3 + intent.thickness * 12;
  const defaults: Omit<Pulse3DParams, keyof PulseIntent> = {
    resolvedPalette: resolvePulsePalette(intent),
    maxRadiusWorld: (20 + intent.reach * 180) / 120,
    ringThicknessRatio: Math.min(0.45, Math.max(0.035, ringPixels / 60)),
    motionReferenceSpeed: 3,
    poolSize: 512,
  };
  return { ...intent, ...defaults, ...override };
}

export function resolveFrost3D(
  intent: FrostIntent,
  override: Partial<Frost3DParams> = {}
): Frost3DParams {
  const palette = resolveFrostPalette(intent);
  const defaults: Omit<Frost3DParams, keyof FrostIntent> = {
    resolvedPalette: palette,
    auraPoolSize: 1024,
    baseRadius: 0.03,
    ambientSpawnRate: 6,
    motionSpawnRate: 25,
    motionReferenceSpeed: 3.0,
    lifetimeMin: 1.5,
    lifetimeMax: 3.0,
  };
  return { ...intent, ...defaults, ...override };
}

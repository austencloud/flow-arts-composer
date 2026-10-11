import type {
  GooIntent,
  BubblesIntent,
  PetalsIntent,
  SmokeIntent,
  CharcoalIntent,
  SparklesIntent,
} from "#lib/shared/effects/domain/effects-config.js";
import type {
  ParticlePassPayload,
  ParticleTipState,
  ParticleEmitter,
  ParticleForces,
  ParticleShape,
} from "../domain/particle-pass";

export interface ParticleTranslationContext {
  tips: Array<{ tipId: string; position: [number, number]; velocity: number }>;
  elapsedSeconds: number;
}

const PALETTE_COLORS: Record<string, [number, number, number]> = {
  classic: [0.3, 0.5, 0.9], mercury: [0.7, 0.7, 0.75], acid: [0.2, 1.0, 0.3],
  blood: [0.7, 0.05, 0.05], spirit: [0.6, 0.4, 0.9],
  soap: [0.7, 0.85, 1.0], champagne: [1.0, 0.9, 0.6], oil: [0.2, 0.15, 0.3],
  blossom: [1.0, 0.6, 0.7], autumn: [0.9, 0.5, 0.1], jungle: [0.2, 0.7, 0.3],
  ash: [0.5, 0.5, 0.5], gold: [1.0, 0.85, 0.3],
  incense: [0.6, 0.55, 0.5], fog: [0.7, 0.7, 0.7], genie: [0.4, 0.2, 0.8],
  cursed: [0.3, 0.0, 0.3], campfire: [0.5, 0.3, 0.2],
};

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.trim().replace(/^#/, "");
  if (n.length !== 6) return [1, 1, 1];
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [1, 1, 1];
  return [r / 255, g / 255, b / 255];
}

function paletteToRgb(palette: string, customColor: string): [number, number, number] {
  if (palette === "custom") return hexToRgb(customColor);
  return PALETTE_COLORS[palette] ?? [1, 1, 1];
}

interface TipParams {
  tipId: string;
  position: [number, number];
  rate: number;
  spread: number;
  speed: [number, number];
  angleRange: [number, number];
  color: [number, number, number];
  opacity: number;
  size: number;
  sizeJitter: number;
  lifetime: number;
  shape: ParticleShape;
  forces: ParticleForces;
  blendMode?: "alpha" | "additive" | "screen";
}

function buildTipState(p: TipParams): ParticleTipState {
  const emitter: ParticleEmitter = {
    position: p.position,
    rate: p.rate,
    spread: p.spread,
    speed: p.speed,
    angleRange: p.angleRange,
  };
  return {
    tipId: p.tipId,
    emitters: [emitter],
    color: [p.color[0], p.color[1], p.color[2], p.opacity],
    size: p.size,
    sizeJitter: p.sizeJitter,
    lifetime: p.lifetime,
    shape: p.shape,
    forces: p.forces,
    blendMode: p.blendMode ?? "alpha",
    opacity: p.opacity,
  };
}

export function toGooPayload(
  intent: GooIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color = paletteToRgb(intent.palette, intent.customColor);
  const forces: ParticleForces = { gravity: 0.3, curlStrength: 0, swayAmplitude: 0, drag: 0.2 };
  const tips = ctx.tips.map((tip) => {
    const rate = (intent.ambientEmission + intent.motionEmission * tip.velocity) * 25;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: 0.01, speed: [0.02, 0.08],
      angleRange: [0, Math.PI], color, opacity: intent.intensity * intent.clarity,
      size: intent.intensity * 0.015, sizeJitter: 1 - intent.surfaceTension,
      lifetime: 1.2, shape: "circle", forces,
    });
  });
  return { tips };
}

export function toBubblesPayload(
  intent: BubblesIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color = paletteToRgb(intent.palette, intent.customColor);
  const forces: ParticleForces = {
    gravity: -0.15, curlStrength: 0.3, swayAmplitude: 0, drag: 0.1,
  };
  const tips = ctx.tips.map((tip) => {
    const rate = (intent.ambientEmission + intent.motionEmission * tip.velocity) * 20;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: 0.008, speed: [0.01, 0.04],
      angleRange: [0, Math.PI * 0.5], color, opacity: intent.intensity * 0.7,
      size: intent.intensity * 0.018, sizeJitter: intent.sizeJitter,
      lifetime: 2.0 + intent.buoyancy, shape: "circle", forces, blendMode: "screen",
    });
  });
  return { tips };
}

export function toPetalsPayload(
  intent: PetalsIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color = paletteToRgb(intent.palette, intent.customColor);
  const forces: ParticleForces = {
    gravity: 0.08, curlStrength: 0, swayAmplitude: intent.swayAmplitude * 0.04, drag: 0.05,
  };
  const tips = ctx.tips.map((tip) => {
    const rate = (intent.ambientEmission + intent.motionEmission * tip.velocity) * 15;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: 0.02, speed: [0.005, 0.03],
      angleRange: [Math.PI * 0.3, Math.PI * 0.7], color, opacity: intent.intensity * 0.85,
      size: intent.intensity * 0.02, sizeJitter: 0.3,
      lifetime: 2.5 + (1 - intent.fallSpeed) * 2, shape: "petal", forces,
    });
  });
  return { tips };
}

export function toSmokePayload(
  intent: SmokeIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color = paletteToRgb(intent.palette, intent.customColor);
  const forces: ParticleForces = {
    gravity: -0.1 * intent.riseSpeed, curlStrength: intent.curlStrength * 0.5,
    swayAmplitude: 0, drag: 0.15,
  };
  const tips = ctx.tips.map((tip) => {
    const rate = (intent.ambientEmission + intent.motionEmission * tip.velocity) * 12;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: 0.025, speed: [0.01, 0.03],
      angleRange: [0, Math.PI * 0.4], color, opacity: intent.intensity * 0.5,
      size: intent.intensity * 0.035, sizeJitter: 0.4,
      lifetime: 3.0, shape: "circle", forces, blendMode: "screen",
    });
  });
  return { tips };
}

export function toCharcoalPayload(
  intent: CharcoalIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color: [number, number, number] = [0.15, 0.12, 0.1];
  const forces: ParticleForces = { gravity: 0.2, curlStrength: 0, swayAmplitude: 0, drag: 0.3 };
  const tips = ctx.tips.map((tip) => {
    const rate = intent.intensity * 30;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: intent.spread * 0.03,
      speed: [0.02, 0.06], angleRange: [0, Math.PI * 2], color,
      opacity: intent.intensity * 0.8 + intent.glow * 0.2,
      size: 0.008, sizeJitter: 0.7, lifetime: 0.8, shape: "spark", forces, blendMode: "additive",
    });
  });
  return { tips };
}

export function toSparklesPayload(
  intent: SparklesIntent,
  ctx: ParticleTranslationContext,
): ParticlePassPayload {
  const color = resolveSparkleColor(intent);
  const forces: ParticleForces = {
    gravity: intent.gravity * 0.4, curlStrength: 0, swayAmplitude: 0, drag: 0.05,
  };
  const tips = ctx.tips.map((tip) => {
    const rate = intent.rate * 40;
    return buildTipState({
      tipId: tip.tipId, position: tip.position, rate, spread: intent.spread * 0.01,
      speed: [0.01, 0.05], angleRange: [0, Math.PI * 2], color,
      opacity: 1.0, size: intent.size * 0.01, sizeJitter: 0.5,
      lifetime: intent.lifetime, shape: "spark", forces, blendMode: "additive",
    });
  });
  return { tips };
}

function resolveSparkleColor(intent: SparklesIntent): [number, number, number] {
  if (intent.colorMode === "solid") return hexToRgb(intent.color);
  if (intent.colorMode === "palette" && intent.palette.length > 0) return hexToRgb(intent.palette[0]!);
  return [1, 1, 1]; 
}

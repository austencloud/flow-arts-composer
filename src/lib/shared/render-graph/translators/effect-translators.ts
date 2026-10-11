import type {
  GhostIntent,
  BloomIntent,
  ZapIntent,
  PulseIntent,
  InkIntent,
  FrostIntent,
  SilkIntent,
} from "#lib/shared/effects/domain/effects-config.js";
import type {
  GhostPassPayload,
  GhostPhantom,
  BloomPassPayload,
  BloomSource,
  ZapPassPayload,
  ZapArc,
  PulsePassPayload,
  PulseRing,
  InkPassPayload,
  InkStroke,
  FrostPassPayload,
  FrostSeed,
  SilkPassPayload,
  SilkRibbon,
} from "../domain/effect-passes";

const PALETTE_COLORS: Record<string, [number, number, number]> = {
  classic: [0.3, 0.5, 0.9], mercury: [0.7, 0.7, 0.75], acid: [0.2, 1.0, 0.3],
  blood: [0.7, 0.05, 0.05], spirit: [0.6, 0.4, 0.9],
  soap: [0.7, 0.85, 1.0], champagne: [1.0, 0.9, 0.6], oil: [0.2, 0.15, 0.3],
  blossom: [1.0, 0.6, 0.7], autumn: [0.9, 0.5, 0.1], jungle: [0.2, 0.7, 0.3],
  ash: [0.5, 0.5, 0.5], gold: [1.0, 0.85, 0.3],
  incense: [0.6, 0.55, 0.5], fog: [0.7, 0.7, 0.7], genie: [0.4, 0.2, 0.8],
  cursed: [0.3, 0.0, 0.3], campfire: [0.5, 0.3, 0.2],
  sonar: [0.22, 0.74, 0.97], ripple: [0.58, 0.77, 0.99],
  neon: [0.94, 0.67, 0.99], ember: [1.0, 0.38, 0.0], void: [0.25, 0.25, 0.38],
  india: [0.05, 0.02, 0.0], sumi: [0.1, 0.1, 0.12], watercolor: [0.3, 0.5, 0.7],
  glacial: [0.63, 0.85, 1.0], breath: [0.82, 0.91, 0.94],
  black_ice: [0.13, 0.16, 0.19], aurora: [0.38, 1.0, 0.5], diamond: [0.91, 0.91, 0.94],
  satin: [0.75, 0.75, 0.82], velvet: [0.38, 0.0, 0.09],
  ethereal: [0.75, 0.5, 1.0], shadow: [0.06, 0.06, 0.13],
  gold_leaf: [0.63, 0.44, 0.0],
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

export interface GhostTranslationContext {
  phantoms: Array<{ leftPos: [number, number]; rightPos: [number, number]; age: number }>;
}

export function toGhostPayload(
  intent: GhostIntent,
  ctx: GhostTranslationContext,
): GhostPassPayload {
  const phantoms: GhostPhantom[] = ctx.phantoms.map((p) => ({
    leftPos: p.leftPos,
    rightPos: p.rightPos,
    age: p.age,
  }));
  // Ghost is now a prop-matched whole-staff onion-skin; per-prop color is applied
  // upstream, so the pass carries a neutral staff at the master intensity.
  return {
    phantoms,
    shape: "staff",
    color: [1, 1, 1, intent.intensity],
    thickness: 0.012,
    maxAge: intent.decay,
  };
}

export interface BloomTranslationContext {
  tips: Array<{ position: [number, number]; tipId: string }>;
  elapsedSeconds: number;
}

export function toBloomPayload(
  intent: BloomIntent,
  ctx: BloomTranslationContext,
): BloomPassPayload {
  const TWO_PI = Math.PI * 2;
  const sources: BloomSource[] = ctx.tips.map((tip) => {
    const color = pickBloomColor(tip.tipId, intent, ctx.elapsedSeconds);
    const pulse = intent.pulse > 0
      ? 1 - intent.pulse * 0.5 * (1 - Math.sin(ctx.elapsedSeconds * intent.pulseRate * TWO_PI))
      : 1;
    return {
      position: tip.position,
      color,
      radius: intent.radius * 0.001,
      pulseFactor: pulse,
    };
  });
  return { sources, falloff: intent.falloff, intensity: intent.intensity };
}

function pickBloomColor(
  tipId: string,
  intent: BloomIntent,
  elapsed: number,
): [number, number, number, number] {
  switch (intent.colorMode) {
    case "solid": {
      const [r, g, b] = hexToRgb(intent.color);
      return [r, g, b, intent.intensity];
    }
    case "prop-matched":
      return tipId === "blue"
        ? [0.2, 0.4, 1.0, intent.intensity]
        : [1.0, 0.2, 0.2, intent.intensity];
    case "rainbow": {
      const h = (elapsed * 0.167 + (tipId === "red" ? 0.33 : 0)) % 1;
      const [r, g, b] = hsvToRgb(h, 0.85, 1);
      return [r, g, b, intent.intensity];
    }
    case "palette": {
      if (intent.palette.length === 0) return [1, 1, 1, intent.intensity];
      const idx = tipId === "red" ? 1 : 0;
      const hex = intent.palette[idx % intent.palette.length] ?? "#ffffff";
      const [r, g, b] = hexToRgb(hex);
      return [r, g, b, intent.intensity];
    }
  }
}

export interface ZapTranslationContext {
  tipPairs: Array<{ from: [number, number]; to: [number, number] }>;
  frameCount: number;
}

export function toZapPayload(
  intent: ZapIntent,
  ctx: ZapTranslationContext,
): ZapPassPayload {
  const [lr, lg, lb] = hexToRgb(intent.leftColor);
  const [rr, rg, rb] = hexToRgb(intent.rightColor);
  const thickness = 0.003 * intent.intensity;

  const arcs: ZapArc[] = ctx.tipPairs.map((pair, i) => {
    const color: [number, number, number, number] =
      i % 2 === 0 ? [lr, lg, lb, intent.intensity] : [rr, rg, rb, intent.intensity];
    return {
      from: pair.from,
      to: pair.to,
      color,
      thickness,
      branching: intent.branching,
      seed: ctx.frameCount * 13 + i * 7,
    };
  });

  return {
    arcs,
    mode: intent.mode,
    intensity: intent.intensity,
    glowRadius: 0.01 * intent.intensity,
  };
}

export interface PulseTranslationContext {
  activeRings: Array<{
    center: [number, number];
    radius: number;
    age: number;
    color: [number, number, number, number];
  }>;
}

export function toPulsePayload(
  intent: PulseIntent,
  ctx: PulseTranslationContext,
): PulsePassPayload {
  const rings: PulseRing[] = ctx.activeRings.map((ring) => ({
    center: ring.center,
    radius: ring.radius,
    age: ring.age,
    color: ring.color,
  }));
  return {
    rings,
    style: intent.style,
    thickness: intent.thickness,
    intensity: intent.intensity,
  };
}

export interface InkTranslationContext {
  tips: Array<{
    tipId: string;
    path: Array<[number, number]>;
    velocities: number[];
  }>;
}

export function toInkPayload(
  intent: InkIntent,
  ctx: InkTranslationContext,
): InkPassPayload {
  const [r, g, b] = paletteToRgb(intent.palette, intent.customColor);
  const width = intent.intensity * 0.015;

  const strokes: InkStroke[] = ctx.tips.map((tip) => ({
    tipId: tip.tipId,
    path: tip.path,
    color: [r, g, b, intent.intensity],
    width,
    velocities: tip.velocities,
  }));

  return {
    strokes,
    viscosity: intent.viscosity,
    splatterIntensity: intent.splatterIntensity,
    decayPerSecond: 1.5,
  };
}

export interface FrostTranslationContext {
  tips: Array<{ position: [number, number]; radius: number }>;
}

export function toFrostPayload(
  intent: FrostIntent,
  ctx: FrostTranslationContext,
): FrostPassPayload {
  const [r, g, b] = paletteToRgb(intent.palette, intent.customColor);

  const seeds: FrostSeed[] = ctx.tips.map((tip) => ({
    position: tip.position,
    radius: tip.radius,
    crystallinity: intent.crystallinity,
    color: [r, g, b, intent.intensity],
  }));

  return {
    seeds,
    spreadRate: intent.spreadRate,
    intensity: intent.intensity,
    decayPerSecond: 0.3,
  };
}

export interface SilkTranslationContext {
  tips: Array<{
    tipId: string;
    path: Array<[number, number]>;
    velocities: number[];
    flutterOffsets: number[];
  }>;
}

export function toSilkPayload(
  intent: SilkIntent,
  ctx: SilkTranslationContext,
): SilkPassPayload {
  const [r, g, b] = paletteToRgb(intent.palette, intent.customColor);
  const width = intent.width * 0.02;
  const lifetimeSeconds = 0.5 + intent.duration * 3.5;
  const decayPerSecond = 1 / lifetimeSeconds;

  const ribbons: SilkRibbon[] = ctx.tips.map((tip) => ({
    tipId: tip.tipId,
    path: tip.path,
    color: [r, g, b, intent.intensity],
    width,
    velocities: tip.velocities,
    flutterOffsets: tip.flutterOffsets,
  }));

  return { ribbons, decayPerSecond, intensity: intent.intensity };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

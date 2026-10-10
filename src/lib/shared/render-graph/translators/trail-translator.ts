/**
 * TrailsIntent → TrailPassPayload translator.
 *
 * Pure function: takes the canonical TrailsIntent from EffectsConfig
 * plus each tip's current leading-edge path, emits a backend-neutral
 * TrailPassPayload. The mesh-building math lives inside the backend
 * so this translator stays format-neutral.
 */

import type { TrailsIntent } from "#lib/shared/effects/domain/effects-config.js";
import { MIN_TAIL_WIDTH_RATIO, FADE_EXPONENT } from "../math/trail-mesh";
import type {
  TrailPassPayload,
  TrailTipState,
  TrailBlendMode,
} from "../domain/trail-pass";

/** One tip's current leading-edge path in NDC, oldest-first. */
export interface TipPathDelta {
  tipId: string;
  path: Array<[number, number]>;
}

export interface TrailTranslationContext {
  tips: TipPathDelta[];
  /** Wall time in seconds - drives rainbow hue cycling. */
  elapsedSeconds: number;
  /** Optional color override per tipId. Wins over intent.blue/red. */
  colorOverrides?: Record<string, [number, number, number, number]>;
  /** Optional blend mode override per tipId. Default "alpha". */
  blendOverrides?: Record<string, TrailBlendMode>;
}

const DEFAULT_THICKNESS_NDC = 0.008;
const THICKNESS_UNIT_NDC = 0.002;
/** Gaussian-blur halo radius expressed as a multiple of head thickness. */
const GLOW_RATIO = 2.5;
/**
 * Fade rate tuned to match Canvas2D TrailOverlayCanvas's 1200 ms fade
 * duration. Canvas2D decays ~4.9% of alpha per 60fps frame; continuous
 * equivalent is exp(-3.0 * dt) ≈ 4.9% per 16.67 ms.
 */
const DEFAULT_DECAY_PER_SECOND = 3.0;

export function toTrailPassPayload(
  intent: TrailsIntent,
  context: TrailTranslationContext,
): TrailPassPayload {
  const thickness = thicknessFromIntent(intent);
  const glow = thickness * GLOW_RATIO;

  const tips: TrailTipState[] = context.tips.map((delta) =>
    buildTip(delta, intent, thickness, glow, context),
  );

  return { tips };
}

function buildTip(
  delta: TipPathDelta,
  intent: TrailsIntent,
  thickness: number,
  glow: number,
  ctx: TrailTranslationContext,
): TrailTipState {
  const override = ctx.colorOverrides?.[delta.tipId];
  const color = override ?? pickTipColor(delta.tipId, intent, ctx.elapsedSeconds);
  const blendMode = ctx.blendOverrides?.[delta.tipId] ?? "alpha";
  return {
    tipId: delta.tipId,
    path: delta.path,
    color,
    thickness,
    taperTailRatio: MIN_TAIL_WIDTH_RATIO,
    glow,
    decayPerSecond: DEFAULT_DECAY_PER_SECOND,
    fadeExponent: FADE_EXPONENT,
    blendMode,
  };
}

function thicknessFromIntent(intent: TrailsIntent): number {
  const clamped = clamp(intent.thickness, 1, 12);
  return DEFAULT_THICKNESS_NDC + (clamped - 1) * THICKNESS_UNIT_NDC;
}

function pickTipColor(
  tipId: string,
  intent: TrailsIntent,
  elapsedSeconds: number,
): [number, number, number, number] {
  if (intent.rainbow) {
    const hueOffset = tipId === "red" ? 0.33 : 0;
    const h = (elapsedSeconds * 0.15 + hueOffset) % 1;
    const [r, g, b] = hsvToRgb(h, 0.85, 1);
    return [r, g, b, intent.brightness];
  }
  const hex = tipId === "red" ? intent.rightColor : intent.leftColor;
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, intent.brightness];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length !== 6) return [1, 1, 1];
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [1, 1, 1];
  return [r / 255, g / 255, b / 255];
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

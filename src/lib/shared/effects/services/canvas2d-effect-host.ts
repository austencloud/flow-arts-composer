/**
 * One canvas2d overlay effect, drawn from emitter tips onto a 2D context.
 *
 * The animation engine's render loop owns the FULL effect story: deriving tips
 * from a realized sequence pose, the WebGL effects, per-effect error budgets,
 * and the overlay canvases' lifecycle. Its dispatch registry is bound to
 * `RenderFrameParams`, so a surface whose motion does not come from a sequence
 * cannot reach it.
 *
 * This is the narrower capability underneath that one: given a context, an
 * effect id, the shared effects config, and where the prop tips are RIGHT NOW,
 * draw that effect's frame. It is what lets a surface with its own kinematics —
 * the Shape Matrix theory stage traces rational spin ratios that have no letter
 * and no steps — use the same effects the rest of the app draws instead of
 * growing a private set.
 *
 * Deliberately out of scope, and why:
 *   - fire, led, charcoal: WebGL. They need their own contexts and trackers.
 *   - ghost: onion-skins the rendered prop sprites, not tip positions.
 *   - frost: retired from the roster; its code is dormant, not offered.
 *   - trails: its own renderer family with a settings pipeline of its own.
 * `CANVAS2D_HOSTED_EFFECTS` is the honest list; a host must not offer an effect
 * it cannot draw.
 */
import { computeEffectScale } from "../renderers/scale";
import type { EmitterTip } from "../renderers/emitter-tip";
import type { EffectsConfig, EffectType } from "../domain/effects-config";
import {
  resolveZap2D,
  resolveSparkles2D,
  resolveBloom2D,
  resolveGoo2D,
  resolveBubbles2D,
  resolvePetals2D,
  resolveSmoke2D,
  resolveInk2D,
  resolveSilk2D,
  resolveAnimal2D,
  resolvePulse2D,
} from "../translators/canvas2d-translator";
import { Zap2DRenderer } from "../renderers/zap-2d-renderer";
import { Sparkles2DRenderer } from "../renderers/sparkles-2d-renderer";
import { Bloom2DRenderer } from "../renderers/bloom-2d-renderer";
import { Goo2DRenderer } from "../renderers/goo-2d-renderer";
import { Bubbles2DRenderer } from "../renderers/bubbles-2d-renderer";
import { Petals2DRenderer } from "../renderers/petals-2d-renderer";
import { Smoke2DRenderer } from "../renderers/smoke-2d-renderer";
import { Ink2DRenderer } from "../renderers/ink-2d-renderer";
import { Silk2DRenderer } from "../renderers/silk-2d-renderer";
import { Animal2DRenderer } from "../renderers/animal-2d-renderer";
import {
  Pulse2DRenderer,
  type PulseTipInput,
} from "../renderers/pulse-2d-renderer";

/** Every effect this host can draw. Anything else is not offered. */
export const CANVAS2D_HOSTED_EFFECTS = [
  "zap",
  "sparkles",
  "bloom",
  "goo",
  "bubbles",
  "petals",
  "smoke",
  "ink",
  "silk",
  "animal",
  "pulse",
] as const;

export type Canvas2DHostedEffect = (typeof CANVAS2D_HOSTED_EFFECTS)[number];

export function isCanvas2DHostedEffect(
  effect: EffectType
): effect is Canvas2DHostedEffect {
  return (CANVAS2D_HOSTED_EFFECTS as readonly string[]).includes(effect);
}

/**
 * The three shapes the renderers take. Zap and bloom read only the tips they
 * are handed; the rest advance an internal clock; pulse also wants a playback
 * position for its overtone schedule.
 */
type Drawer = (
  ctx: CanvasRenderingContext2D,
  config: EffectsConfig,
  tips: EmitterTip[],
  dtSeconds: number,
  scale: number,
  phase: number
) => void;

/** Pulse numbers a prop's ends 0 and 1 for its tracking filter. */
function pulseTip(tip: EmitterTip): PulseTipInput {
  return { ...tip, end: tip.tipIndex };
}

function lazily<R>(create: () => R): () => R {
  let instance: R | null = null;
  return () => (instance ??= create());
}

function makeDrawers(): Record<Canvas2DHostedEffect, Drawer> {
  const zap = lazily(() => new Zap2DRenderer());
  const sparkles = lazily(() => new Sparkles2DRenderer());
  const bloom = lazily(() => new Bloom2DRenderer());
  const goo = lazily(() => new Goo2DRenderer());
  const bubbles = lazily(() => new Bubbles2DRenderer());
  const petals = lazily(() => new Petals2DRenderer());
  const smoke = lazily(() => new Smoke2DRenderer());
  const ink = lazily(() => new Ink2DRenderer());
  const silk = lazily(() => new Silk2DRenderer());
  const animal = lazily(() => new Animal2DRenderer());
  const pulse = lazily(() => new Pulse2DRenderer());

  return {
    zap: (ctx, c, tips, _dt, scale) =>
      zap().render(ctx, resolveZap2D(c.zap), tips, scale),
    bloom: (ctx, c, tips, _dt, scale) =>
      bloom().render(ctx, resolveBloom2D(c.bloom), tips, scale),
    sparkles: (ctx, c, tips, dt, scale) =>
      sparkles().render(ctx, resolveSparkles2D(c.sparkles), tips, dt, scale),
    goo: (ctx, c, tips, dt, scale) =>
      goo().render(ctx, resolveGoo2D(c.goo), tips, dt, scale),
    bubbles: (ctx, c, tips, dt, scale) =>
      bubbles().render(ctx, resolveBubbles2D(c.bubbles), tips, dt, scale),
    petals: (ctx, c, tips, dt, scale) =>
      petals().render(ctx, resolvePetals2D(c.petals), tips, dt, scale),
    smoke: (ctx, c, tips, dt, scale) =>
      smoke().render(ctx, resolveSmoke2D(c.smoke), tips, dt, scale),
    ink: (ctx, c, tips, dt, scale) =>
      ink().render(ctx, resolveInk2D(c.ink), tips, dt, scale),
    silk: (ctx, c, tips, dt, scale) =>
      silk().render(ctx, resolveSilk2D(c.silk), tips, dt, scale),
    animal: (ctx, c, tips, dt, scale) =>
      animal().render(ctx, resolveAnimal2D(c.animal), tips, dt, scale),
    pulse: (ctx, c, tips, dt, scale, phase) =>
      pulse().render(
        ctx,
        resolvePulse2D(c.pulse),
        tips.map(pulseTip),
        phase,
        dt,
        scale
      ),
  };
}

export interface Canvas2DEffectHost {
  /**
   * Draw one frame of `effect` into `ctx`. Tips are in the context's own pixel
   * space, and `dtSeconds` is real elapsed time, clamped the way the engine
   * clamps it so a backgrounded tab does not resume with a one-frame burst.
   * `phase` is a monotonic playback position; only pulse reads it.
   */
  render(
    ctx: CanvasRenderingContext2D,
    effect: EffectType,
    config: EffectsConfig,
    tips: EmitterTip[],
    dtSeconds: number,
    width: number,
    height: number,
    phase?: number
  ): void;
}

export function createCanvas2DEffectHost(): Canvas2DEffectHost {
  const drawers = makeDrawers();

  return {
    render(ctx, effect, config, tips, dtSeconds, width, height, phase = 0) {
      if (!isCanvas2DHostedEffect(effect)) return;
      if (width <= 0 || height <= 0) return;
      const dt = Math.min(
        0.1,
        Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 1 / 60
      );
      drawers[effect](
        ctx,
        config,
        tips,
        dt,
        computeEffectScale(width, height),
        phase
      );
    },
  };
}

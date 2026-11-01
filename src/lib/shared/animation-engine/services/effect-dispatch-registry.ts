import type { EffectRendererLike } from "./effects/effect-renderer";
import type {
  RenderedPropTransform,
  PropTipData,
} from "../domain/types/fire-types";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import type { RenderFrameParams } from "./IAnimationRenderLoop";
import { buildArrayTips, buildEmitterTips } from "./effect-tip-builders";

/**
 * Context shared across all registry effect dispatches within a single frame.
 */
export interface EffectDispatchContext {
  tipMap: TipEffectMap;
  sharedTips: PropTipData[];
  params: RenderFrameParams;
  currentTime: number;
  renderedTransforms:
    | {
        left: RenderedPropTransform | null;
        right: RenderedPropTransform | null;
      }
    | undefined;
  /** Live prop sprite images — echo ghosts these at past poses. */
  propImages:
    | { left: HTMLImageElement | null; right: HTMLImageElement | null }
    | undefined;
  loopDetectedThisFrame: boolean;
  isSeamlesslyLoopable: boolean;
}

/**
 * Descriptor for a single registry-driven effect.
 * Each entry defines how to get the renderer, build the tip input,
 * and invoke the renderer's renderFrame method.
 */
export type EffectRenderer = {
  isInitialized(): boolean;
  clear(): void;
  renderFrame: (...args: unknown[]) => void;
};

export interface EffectDispatchEntry {
  effect: EffectType;
  configKey: keyof RenderFrameParams;
  getRenderer: (
    renderers: ReadonlyMap<EffectType, EffectRendererLike>
  ) => EffectRenderer | null;
  needsDt: boolean;
  resetTimeOnInactive: boolean;
  buildInput: (ctx: EffectDispatchContext, dt: number) => unknown;
  render: (
    renderer: EffectRenderer,
    config: unknown,
    input: unknown,
    dt: number,
    ctx: EffectDispatchContext
  ) => void;
}

/** Dispatch registry — one entry per simple overlay effect. */
export const EFFECT_DISPATCH_REGISTRY: readonly EffectDispatchEntry[] = [
  // --- Zap: 4-pos, dt ---
  {
    effect: "zap",
    configKey: "zapConfig",
    getRenderer: (renderers) =>
      (renderers.get("zap") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: false,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "zap", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Sparkles: 4-pos, dt ---
  {
    effect: "sparkles",
    configKey: "sparklesConfig",
    getRenderer: (renderers) =>
      (renderers.get("sparkles") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: false,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "sparkles", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Ghost: stroboscopic prop mandala — emitters + playback phase + seq epoch ---
  {
    effect: "ghost",
    configKey: "ghostConfig",
    getRenderer: (renderers) =>
      (renderers.get("ghost") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: false,
    buildInput: (ctx) => {
      // Ghost ghosts the REAL prop sprite at past poses (onion-skin). Assemble
      // each live prop's blit transform from the already-computed prop
      // transforms (center/angle/scale) + dimensions + the sprite image.
      const rt = ctx.renderedTransforms;
      const imgs = ctx.propImages;
      const p = ctx.params;
      const props: Array<{
        id: number;
        image: CanvasImageSource;
        centerX: number;
        centerY: number;
        angle: number;
        width: number;
        height: number;
        flipped: boolean;
      }> = [];
      if (rt?.left && imgs?.left && p.props.leftProp) {
        props.push({
          id: 0,
          image: imgs.left,
          centerX: rt.left.centerX,
          centerY: rt.left.centerY,
          angle: rt.left.angle,
          width: p.props.leftPropDimensions.width * rt.left.scaleFactor,
          height: p.props.leftPropDimensions.height * rt.left.scaleFactor,
          flipped: p.leftPropFlipped ?? false,
        });
      }
      if (rt?.right && imgs?.right && p.props.rightProp) {
        props.push({
          id: 1,
          image: imgs.right,
          centerX: rt.right.centerX,
          centerY: rt.right.centerY,
          angle: rt.right.angle,
          width: p.props.rightPropDimensions.width * rt.right.scaleFactor,
          height: p.props.rightPropDimensions.height * rt.right.scaleFactor,
          flipped: p.rightPropFlipped ?? false,
        });
      }
      // Wipe the exposure when the sequence changes; hold it across loop wraps.
      return {
        props,
        currentStep: p.currentStep,
        epoch: p.sequenceContentHash ?? "",
      };
    },
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Bloom: array-of-tips, dt ---
  {
    effect: "bloom",
    configKey: "bloomConfig",
    getRenderer: (renderers) =>
      (renderers.get("bloom") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: false,
    buildInput: (ctx) =>
      buildArrayTips(
        ctx.sharedTips,
        ctx.tipMap,
        "bloom",
        ctx.params,
        ctx.renderedTransforms
      ),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Goo: 4-pos, dt, resetTimeOnInactive ---
  {
    effect: "goo",
    configKey: "gooConfig",
    getRenderer: (renderers) =>
      (renderers.get("goo") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "goo", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Bubbles: 4-pos, dt, resetTimeOnInactive ---
  {
    effect: "bubbles",
    configKey: "bubblesConfig",
    getRenderer: (renderers) =>
      (renderers.get("bubbles") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "bubbles", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Petals: 4-pos, dt, resetTimeOnInactive ---
  {
    effect: "petals",
    configKey: "petalsConfig",
    getRenderer: (renderers) =>
      (renderers.get("petals") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "petals", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Smoke: 4-pos, dt, resetTimeOnInactive ---
  {
    effect: "smoke",
    configKey: "smokeConfig",
    getRenderer: (renderers) =>
      (renderers.get("smoke") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "smoke", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Ink: 4-pos, dt, loop boundary continuity ---
  {
    effect: "ink",
    configKey: "inkConfig",
    getRenderer: (renderers) =>
      (renderers.get("ink") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "ink", ctx.params),
    render: (r, cfg, inp, dt, ctx) =>
      r.renderFrame(cfg, inp, dt, {
        loopDetected: ctx.loopDetectedThisFrame,
        isSeamlesslyLoopable: ctx.isSeamlesslyLoopable,
      }),
  },
  // --- Frost: 4-pos, dt, resetTimeOnInactive ---
  {
    effect: "frost",
    configKey: "frostConfig",
    getRenderer: (renderers) =>
      (renderers.get("frost") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "frost", ctx.params),
    render: (r, cfg, inp, dt) => r.renderFrame(cfg, inp, dt),
  },
  // --- Silk: 4-pos, dt, resetTimeOnInactive, loopDetected arg ---
  {
    effect: "silk",
    configKey: "silkConfig",
    getRenderer: (renderers) =>
      (renderers.get("silk") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "silk", ctx.params),
    render: (r, cfg, inp, dt, ctx) =>
      r.renderFrame(
        cfg,
        inp,
        dt,
        ctx.loopDetectedThisFrame && ctx.isSeamlesslyLoopable
      ),
  },
  // --- Animal: 4-pos, dt, resetTimeOnInactive, loopDetected arg (mirrors silk) ---
  {
    effect: "animal",
    configKey: "animalConfig",
    getRenderer: (renderers) =>
      (renderers.get("animal") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildEmitterTips(ctx.sharedTips, ctx.tipMap, "animal", ctx.params),
    render: (r, cfg, inp, dt, ctx) =>
      r.renderFrame(
        cfg,
        inp,
        dt,
        ctx.loopDetectedThisFrame && ctx.isSeamlesslyLoopable
      ),
  },
  // --- Pulse: array-of-tips, dt, resetTimeOnInactive, currentStep arg ---
  {
    effect: "pulse",
    configKey: "pulseConfig",
    getRenderer: (renderers) =>
      (renderers.get("pulse") ?? null) as EffectRenderer | null,
    needsDt: true,
    resetTimeOnInactive: true,
    buildInput: (ctx) =>
      buildArrayTips(
        ctx.sharedTips,
        ctx.tipMap,
        "pulse",
        ctx.params,
        ctx.renderedTransforms
      ),
    render: (r, cfg, inp, dt, ctx) =>
      r.renderFrame(cfg, inp, ctx.params.currentStep ?? 0, dt),
  },
];

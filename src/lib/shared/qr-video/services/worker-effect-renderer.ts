import type { EffectType } from "$lib/shared/effects/domain/effects-config";
import type { FramePropState } from "../domain/qr-video-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { computeEffectScale } from "$lib/shared/effects/renderers/scale";

import {
  resolveZap2D,
  resolveSparkles2D,
  resolveGhost2D,
  resolveBloom2D,
  resolveGoo2D,
  resolveBubbles2D,
  resolvePetals2D,
  resolveSmoke2D,
  resolveInk2D,
  resolveFrost2D,
  resolveSilk2D,
  resolveAnimal2D,
  resolvePulse2D,
} from "$lib/shared/effects/translators/canvas2d-translator";

import {
  Bloom2DRenderer,
  type BloomTipInput,
} from "$lib/shared/effects/renderers/bloom-2d-renderer";
import { Bubbles2DRenderer } from "$lib/shared/effects/renderers/bubbles-2d-renderer";
import {
  Ghost2DRenderer,
  type GhostInput,
} from "$lib/shared/effects/renderers/ghost-2d-renderer";
import { Frost2DRenderer } from "$lib/shared/effects/renderers/frost-2d-renderer";
import { Ink2DRenderer } from "$lib/shared/effects/renderers/ink-2d-renderer";
import { Petals2DRenderer } from "$lib/shared/effects/renderers/petals-2d-renderer";
import {
  Pulse2DRenderer,
  type PulseTipInput,
} from "$lib/shared/effects/renderers/pulse-2d-renderer";
import { Silk2DRenderer } from "$lib/shared/effects/renderers/silk-2d-renderer";
import { Animal2DRenderer } from "$lib/shared/effects/renderers/animal-2d-renderer";
import { Smoke2DRenderer } from "$lib/shared/effects/renderers/smoke-2d-renderer";
import { WebGLSmokeRenderer } from "$lib/shared/animation-engine/services/smoke/web-gl-smoke-renderer";
import { Sparkles2DRenderer } from "$lib/shared/effects/renderers/sparkles-2d-renderer";
import { Goo2DRenderer } from "$lib/shared/effects/renderers/goo-2d-renderer";
import { Zap2DRenderer } from "$lib/shared/effects/renderers/zap-2d-renderer";
import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";

import { Canvas2DTrailRenderer } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
  TrailEffect,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import type {
  TrailPoint,
  TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";

import { WebGLFireRenderer } from "$lib/shared/animation-engine/services/fire/web-gl-fire-renderer";
import { WebGLLedRenderer } from "$lib/shared/animation-engine/services/led/web-gl-led-renderer";
import { CharcoalSparkRenderer } from "$lib/shared/animation-engine/services/charcoal/charcoal-spark-renderer";
import type {
  FireFrameInput,
  PropTipData,
} from "$lib/shared/animation-engine/domain/types/fire-types";
import { DEFAULT_FIRE_CONFIG } from "$lib/shared/animation-engine/domain/types/fire-types";
import type { RenderedPropSprite } from "$lib/shared/animation-engine/domain/types/rendered-prop-sprite";
import type {
  LedFrameInput,
  LedSample,
} from "$lib/shared/animation-engine/domain/types/led-types";
import { DEFAULT_LED_CONFIG } from "$lib/shared/animation-engine/domain/types/led-types";

const VIEWBOX_SIZE = 950;
const BLUE_COLOR = "#3575E2";
const RED_COLOR = "#ED1C24";

export interface WorkerPropImages {
  left: ImageBitmap;
  right: ImageBitmap;
}

export interface WorkerEffectRenderer {
  renderFrame(
    ctx: OffscreenCanvasRenderingContext2D,
    canvasSize: number,
    left: FramePropState | null,
    right: FramePropState | null,
    leftViewBox: { width: number; height: number },
    rightViewBox: { width: number; height: number },
    frameIndex: number,
    dt: number,
    stepIndex: number,
    isStartPlacement: boolean,
    propImages?: WorkerPropImages
  ): void;
  dispose(): void;
}

interface Vec2 {
  x: number;
  y: number;
}

function getPropCenter(canvasSize: number, propState: FramePropState): Vec2 {
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const inwardFactor = 0.95;
  const gridScale = canvasSize / VIEWBOX_SIZE;
  const halfwayRadius = 150 * gridScale;

  if (propState.x !== undefined && propState.y !== undefined) {
    return {
      x: cx + propState.x * halfwayRadius * inwardFactor,
      y: cy + propState.y * halfwayRadius * inwardFactor,
    };
  }
  return {
    x: cx + Math.cos(propState.centerPathAngle) * halfwayRadius * inwardFactor,
    y: cy + Math.sin(propState.centerPathAngle) * halfwayRadius * inwardFactor,
  };
}

function computeTips(
  canvasSize: number,
  prop: FramePropState | null,
  viewBox: { width: number; height: number }
): { a: Vec2; b: Vec2 } | null {
  if (!prop) return null;
  const center = getPropCenter(canvasSize, prop);
  const gridScale = canvasSize / VIEWBOX_SIZE;
  const halfLen = (viewBox.width / 2) * gridScale;
  const cos = Math.cos(prop.staffRotationAngle);
  const sin = Math.sin(prop.staffRotationAngle);
  return {
    a: { x: center.x + halfLen * cos, y: center.y + halfLen * sin },
    b: { x: center.x - halfLen * cos, y: center.y - halfLen * sin },
  };
}

function buildWorkerPropSprite(
  canvasSize: number,
  prop: FramePropState | null,
  image: ImageBitmap | undefined,
  viewBox: { width: number; height: number }
): RenderedPropSprite | null {
  if (!prop || !image) return null;
  const center = getPropCenter(canvasSize, prop);
  const scale = canvasSize / VIEWBOX_SIZE;
  return {
    image,
    centerX: center.x,
    centerY: center.y,
    angle: prop.staffRotationAngle,
    width: viewBox.width * scale,
    height: viewBox.height * scale,
    flipped: false,
    opacity: 1,
  };
}

interface FourTipPositions {
  leftPosA: Vec2 | null;
  leftPosB: Vec2 | null;
  rightPosA: Vec2 | null;
  rightPosB: Vec2 | null;
}

function computeFourTips(
  canvasSize: number,
  left: FramePropState | null,
  right: FramePropState | null,
  leftVB: { width: number; height: number },
  rightVB: { width: number; height: number }
): FourTipPositions {
  const b = computeTips(canvasSize, left, leftVB);
  const r = computeTips(canvasSize, right, rightVB);
  return {
    leftPosA: b?.a ?? null,
    leftPosB: b?.b ?? null,
    rightPosA: r?.a ?? null,
    rightPosB: r?.b ?? null,
  };
}

/**
 * Convert the QR-export 4-slot tip positions to the flat emitter contract.
 * The export pipeline only renders the two base props (no tunnel layers), so
 * this emits propIndex 0 (blue) / 1 (red) with the export's fixed colors.
 */
function fourTipsToEmitters(four: FourTipPositions): EmitterTip[] {
  const out: EmitterTip[] = [];
  if (four.leftPosA)
    out.push({
      ...four.leftPosA,
      propIndex: 0,
      tipIndex: 0,
      end: "A",
      color: BLUE_COLOR,
    });
  if (four.leftPosB)
    out.push({
      ...four.leftPosB,
      propIndex: 0,
      tipIndex: 1,
      end: "B",
      color: BLUE_COLOR,
    });
  if (four.rightPosA)
    out.push({
      ...four.rightPosA,
      propIndex: 1,
      tipIndex: 0,
      end: "A",
      color: RED_COLOR,
    });
  if (four.rightPosB)
    out.push({
      ...four.rightPosB,
      propIndex: 1,
      tipIndex: 1,
      end: "B",
      color: RED_COLOR,
    });
  return out;
}


function createTrailsRenderer(): WorkerEffectRenderer {
  const renderer = new Canvas2DTrailRenderer();
  const leftPoints: TrailPoint[] = [];
  const rightPoints: TrailPoint[] = [];
  const settings: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.FADE,
    effect: TrailEffect.GLOW,
    leftColor: BLUE_COLOR,
    rightColor: RED_COLOR,
  };

  return {
    renderFrame(ctx, canvasSize, left, right, leftVB, rightVB, frameIndex, dt) {
      const timestamp = frameIndex * dt * 1000;
      const tips = computeFourTips(canvasSize, left, right, leftVB, rightVB);

      if (tips.leftPosA) {
        leftPoints.push({
          x: tips.leftPosA.x,
          y: tips.leftPosA.y,
          timestamp,
          propIndex: 0,
          tipIndex: 0,
        });
      }
      if (tips.leftPosB) {
        leftPoints.push({
          x: tips.leftPosB.x,
          y: tips.leftPosB.y,
          timestamp,
          propIndex: 0,
          tipIndex: 1,
        });
      }
      if (tips.rightPosA) {
        rightPoints.push({
          x: tips.rightPosA.x,
          y: tips.rightPosA.y,
          timestamp,
          propIndex: 1,
          tipIndex: 0,
        });
      }
      if (tips.rightPosB) {
        rightPoints.push({
          x: tips.rightPosB.x,
          y: tips.rightPosB.y,
          timestamp,
          propIndex: 1,
          tipIndex: 1,
        });
      }

      const maxPoints = settings.maxPoints;
      if (leftPoints.length > maxPoints)
        leftPoints.splice(0, leftPoints.length - maxPoints);
      if (rightPoints.length > maxPoints)
        rightPoints.splice(0, rightPoints.length - maxPoints);

      renderer.renderTrails(
        ctx as unknown as CanvasRenderingContext2D,
        leftPoints,
        rightPoints,
        settings,
        timestamp,
        !!left,
        !!right,
        canvasSize
      );
    },
    dispose() {
      leftPoints.length = 0;
      rightPoints.length = 0;
    },
  };
}

// ── Canvas2D "quad-tip" effects (smoke, water, bubbles, etc.) ──

function createQuadTipEffect(
  effectType: Exclude<
    EffectType,
    | "none"
    | "trails"
    | "fire"
    | "led"
    | "charcoal"
    | "bloom"
    | "ghost"
    | "pulse"
  >,
  canvasSize: number
): WorkerEffectRenderer {
  const scale = computeEffectScale(canvasSize, canvasSize);
  const config = DEFAULT_EFFECTS_CONFIG;

  const renderers = {
    smoke: () => ({
      r: new Smoke2DRenderer(),
      p: resolveSmoke2D(config.smoke),
    }),
    goo: () => ({ r: new Goo2DRenderer(), p: resolveGoo2D(config.goo) }),
    bubbles: () => ({
      r: new Bubbles2DRenderer(),
      p: resolveBubbles2D(config.bubbles),
    }),
    petals: () => ({
      r: new Petals2DRenderer(),
      p: resolvePetals2D(config.petals),
    }),
    frost: () => ({
      r: new Frost2DRenderer(),
      p: resolveFrost2D(config.frost),
    }),
    ink: () => ({ r: new Ink2DRenderer(), p: resolveInk2D(config.ink) }),
    sparkles: () => ({
      r: new Sparkles2DRenderer(),
      p: resolveSparkles2D(config.sparkles),
    }),
    silk: () => ({ r: new Silk2DRenderer(), p: resolveSilk2D(config.silk) }),
    animal: () => ({
      r: new Animal2DRenderer(),
      p: resolveAnimal2D(config.animal),
    }),
    zap: () => ({ r: new Zap2DRenderer(), p: resolveZap2D(config.zap) }),
  } as const;

  const { r, p } = renderers[effectType]();

  return {
    renderFrame(ctx, cs, left, right, leftVB, rightVB, _fi, dt) {
      const tips: EmitterTip[] = fourTipsToEmitters(
        computeFourTips(cs, left, right, leftVB, rightVB)
      );

      switch (effectType) {
        case "smoke":
          (r as Smoke2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "goo":
          (r as Goo2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "bubbles":
          (r as Bubbles2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "petals":
          (r as Petals2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "frost":
          (r as Frost2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "ink":
          (r as Ink2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "sparkles":
          (r as Sparkles2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "silk":
          (r as Silk2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "animal":
          (r as Animal2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            dt,
            scale
          );
          break;
        case "zap":
          (r as Zap2DRenderer).render(
            ctx as unknown as CanvasRenderingContext2D,
            p as any,
            tips,
            scale
          );
          break;
      }
    },
    dispose() {
      (r as any).dispose();
    },
  };
}

// ── Bloom (per-tip array input) ────────────────────────────────

function createBloomRenderer(canvasSize: number): WorkerEffectRenderer {
  const renderer = new Bloom2DRenderer();
  const params = resolveBloom2D(DEFAULT_EFFECTS_CONFIG.bloom);
  const scale = computeEffectScale(canvasSize, canvasSize);

  return {
    renderFrame(ctx, cs, left, right, leftVB, rightVB) {
      const tips: BloomTipInput[] = [];
      const bt = computeTips(cs, left, leftVB);
      const rt = computeTips(cs, right, rightVB);

      if (bt) {
        tips.push({
          x: bt.a.x,
          y: bt.a.y,
          propIndex: 0,
          tipIndex: 0,
          color: BLUE_COLOR,
        });
        tips.push({
          x: bt.b.x,
          y: bt.b.y,
          propIndex: 0,
          tipIndex: 1,
          color: BLUE_COLOR,
        });
      }
      if (rt) {
        tips.push({
          x: rt.a.x,
          y: rt.a.y,
          propIndex: 1,
          tipIndex: 2,
          color: RED_COLOR,
        });
        tips.push({
          x: rt.b.x,
          y: rt.b.y,
          propIndex: 1,
          tipIndex: 3,
          color: RED_COLOR,
        });
      }

      renderer.render(
        ctx as unknown as CanvasRenderingContext2D,
        params,
        tips,
        scale
      );
    },
    dispose() {
      renderer.dispose();
    },
  };
}

// ── Ghost (quad-tip + currentStep) ──────────────────────────────

function createGhostRenderer(canvasSize: number): WorkerEffectRenderer {
  const renderer = new Ghost2DRenderer();
  const params = resolveGhost2D(DEFAULT_EFFECTS_CONFIG.ghost);
  const scale = computeEffectScale(canvasSize, canvasSize);
  // Ghost full-redraws its stroboscopic figure into a buffer each frame (the inner
  // renderer self-clears), then we composite that buffer at the master intensity.
  const accum = new OffscreenCanvas(canvasSize, canvasSize);
  const accumCtx = accum.getContext("2d");

  return {
    renderFrame(
      ctx,
      cs,
      left,
      right,
      leftVB,
      rightVB,
      frameIndex,
      dt,
      stepIndex,
      isStartPlacement
    ) {
      if (!accumCtx) return;
      const currentStep = isStartPlacement
        ? 0
        : stepIndex + ((frameIndex * dt) % 1);
      // Ghost now onion-skins the REAL prop sprite, which the export worker does
      // not load (it only computes analytic tips). Real export ghosting is wired
      // in productionization; until then the export echo layer is empty.
      const input: GhostInput = {
        props: [],
        currentStep,
        // One export = one exposure; the figure persists across all frames.
        epoch: "export",
      };
      renderer.render(
        accumCtx as unknown as CanvasRenderingContext2D,
        params,
        input,
        dt,
        scale
      );
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, params.intensity));
      ctx.drawImage(accum, 0, 0);
      ctx.restore();
    },
    dispose() {
      renderer.dispose();
    },
  };
}

// ── Pulse (per-tip array + currentStep + dt) ───────────────────

function createPulseRenderer(canvasSize: number): WorkerEffectRenderer {
  const renderer = new Pulse2DRenderer();
  const params = resolvePulse2D(DEFAULT_EFFECTS_CONFIG.pulse);
  const scale = computeEffectScale(canvasSize, canvasSize);

  return {
    renderFrame(
      ctx,
      cs,
      left,
      right,
      leftVB,
      rightVB,
      frameIndex,
      dt,
      stepIndex,
      isStartPlacement
    ) {
      const tips: PulseTipInput[] = [];
      const bt = computeTips(cs, left, leftVB);
      const rt = computeTips(cs, right, rightVB);

      if (bt) {
        tips.push({
          x: bt.a.x,
          y: bt.a.y,
          propIndex: 0,
          tipIndex: 0,
          color: BLUE_COLOR,
        });
        tips.push({
          x: bt.b.x,
          y: bt.b.y,
          propIndex: 0,
          tipIndex: 1,
          color: BLUE_COLOR,
        });
      }
      if (rt) {
        tips.push({
          x: rt.a.x,
          y: rt.a.y,
          propIndex: 1,
          tipIndex: 2,
          color: RED_COLOR,
        });
        tips.push({
          x: rt.b.x,
          y: rt.b.y,
          propIndex: 1,
          tipIndex: 3,
          color: RED_COLOR,
        });
      }

      const currentStep = isStartPlacement
        ? 0
        : stepIndex + ((frameIndex * dt) % 1);
      renderer.render(
        ctx as unknown as CanvasRenderingContext2D,
        params,
        tips,
        currentStep,
        dt,
        scale
      );
    },
    dispose() {
      renderer.dispose();
    },
  };
}

// ── WebGL effects (fire, led, charcoal) ────────────────────────

interface PrevTipState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

function createFireRenderer(canvasSize: number): WorkerEffectRenderer | null {
  const renderer = new WebGLFireRenderer();
  const ok = renderer.initializeHeadless(canvasSize, canvasSize);
  if (!ok) return null;

  const webglCanvas = (renderer as any).canvas as OffscreenCanvas;
  const prevTips = new Map<string, PrevTipState>();

  return {
    renderFrame(
      ctx,
      cs,
      left,
      right,
      leftVB,
      rightVB,
      frameIndex,
      dt,
      _stepIndex,
      _isStartPlacement,
      propImages
    ) {
      const tips: PropTipData[] = [];
      const currentTime = frameIndex * dt * 1000;

      const buildTip = (
        pos: Vec2,
        propIndex: 0 | 1,
        tipIndex: number
      ): PropTipData => {
        const key = `${propIndex}_${tipIndex}`;
        const previous = prevTips.get(key);
        const prev = previous ?? { ...pos, velocityX: 0, velocityY: 0 };
        const safeDt = Math.max(dt, 0.001);
        const vx = (pos.x - prev.x) / safeDt;
        const vy = (pos.y - prev.y) / safeDt;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const accelerationX = previous ? (vx - prev.velocityX) / safeDt : 0;
        const accelerationY = previous ? (vy - prev.velocityY) / safeDt : 0;
        prevTips.set(key, {
          x: pos.x,
          y: pos.y,
          velocityX: vx,
          velocityY: vy,
        });
        return {
          x: pos.x,
          y: pos.y,
          prevX: prev.x,
          prevY: prev.y,
          velocityX: vx,
          velocityY: vy,
          speed,
          propIndex,
          tipIndex,
          accelerationX,
          accelerationY,
          flameScale: 1.0,
          jerk: Math.hypot(accelerationX, accelerationY),
        };
      };

      const bt = computeTips(cs, left, leftVB);
      const rt = computeTips(cs, right, rightVB);
      if (bt) {
        tips.push(buildTip(bt.a, 0, 0));
        tips.push(buildTip(bt.b, 0, 1));
      }
      if (rt) {
        tips.push(buildTip(rt.a, 1, 0));
        tips.push(buildTip(rt.b, 1, 1));
      }

      const input: FireFrameInput = {
        tips,
        currentTime,
        canvasWidth: cs,
        canvasHeight: cs,
        darkMode: true,
        propSprites: [
          buildWorkerPropSprite(cs, left, propImages?.left, leftVB),
          buildWorkerPropSprite(cs, right, propImages?.right, rightVB),
        ].filter((sprite): sprite is RenderedPropSprite => sprite !== null),
      };

      renderer.renderFire(input, { ...DEFAULT_FIRE_CONFIG });
      ctx.drawImage(webglCanvas as any, 0, 0);
    },
    dispose() {
      renderer.dispose();
    },
  };
}

function createSmokeRenderer(canvasSize: number): WorkerEffectRenderer | null {
  const renderer = new WebGLSmokeRenderer();
  if (!renderer.initializeHeadless(canvasSize, canvasSize)) return null;
  const webglCanvas = renderer.getCanvas() as unknown as OffscreenCanvas;
  const params = resolveSmoke2D(DEFAULT_EFFECTS_CONFIG.smoke);
  return {
    renderFrame(ctx, cs, left, right, leftVB, rightVB, _frameIndex, dt) {
      const tips = fourTipsToEmitters(
        computeFourTips(cs, left, right, leftVB, rightVB)
      );
      renderer.renderFrame(params, tips, dt);
      ctx.drawImage(webglCanvas, 0, 0);
    },
    dispose() {
      renderer.dispose();
    },
  };
}

function createLedRenderer(canvasSize: number): WorkerEffectRenderer | null {
  const renderer = new WebGLLedRenderer();
  const ok = renderer.initializeHeadless(canvasSize, canvasSize);
  if (!ok) return null;

  const webglCanvas = (renderer as any).canvas as OffscreenCanvas;

  return {
    renderFrame(ctx, cs, left, right, leftVB, rightVB, frameIndex, dt) {
      const leds: LedSample[] = [];
      const currentTime = frameIndex * dt * 1000;

      // The worker only has tip positions, not prop state, so it lights the
      // capsule case directly in the prop colors. Pixel-staff export runs
      // through the main-thread sampler.
      const buildLed = (
        pos: Vec2,
        propIndex: 0 | 1,
        endpointIndex: number,
        color: { r: number; g: number; b: number }
      ): LedSample => ({
        x: pos.x,
        y: pos.y,
        propIndex,
        ledIndex: endpointIndex,
        endpointIndex,
        brightness: 1.0,
        ...color,
      });

      const leftRGB = { r: 0.21, g: 0.46, b: 0.89 };
      const rightRGB = { r: 0.96, g: 0.27, b: 0.21 };

      const bt = computeTips(cs, left, leftVB);
      const rt = computeTips(cs, right, rightVB);
      if (bt) {
        leds.push(buildLed(bt.a, 0, 0, leftRGB));
        leds.push(buildLed(bt.b, 0, 1, leftRGB));
      }
      if (rt) {
        leds.push(buildLed(rt.a, 1, 0, rightRGB));
        leds.push(buildLed(rt.b, 1, 1, rightRGB));
      }

      const input: LedFrameInput = {
        leds,
        currentTime,
        canvasWidth: cs,
        canvasHeight: cs,
      };

      renderer.renderLeds(input, { ...DEFAULT_LED_CONFIG, enabled: true });
      ctx.drawImage(webglCanvas as any, 0, 0);
    },
    dispose() {
      renderer.dispose();
    },
  };
}

function createCharcoalRenderer(
  canvasSize: number
): WorkerEffectRenderer | null {
  const renderer = new CharcoalSparkRenderer();
  const ok = renderer.initializeHeadless(canvasSize, canvasSize);
  if (!ok) return null;

  const webglCanvas = (renderer as any).canvas as OffscreenCanvas;
  const prevTips = new Map<string, PrevTipState>();

  return {
    renderFrame(ctx, cs, left, right, leftVB, rightVB, frameIndex, dt) {
      const tips: PropTipData[] = [];
      const currentTime = frameIndex * dt * 1000;

      const buildTip = (
        pos: Vec2,
        propIndex: 0 | 1,
        tipIndex: number
      ): PropTipData => {
        const key = `${propIndex}_${tipIndex}`;
        const previous = prevTips.get(key);
        const prev = previous ?? { ...pos, velocityX: 0, velocityY: 0 };
        const safeDt = Math.max(dt, 0.001);
        const vx = (pos.x - prev.x) / safeDt;
        const vy = (pos.y - prev.y) / safeDt;
        const speed = Math.sqrt(vx * vx + vy * vy);
        const accelerationX = previous ? (vx - prev.velocityX) / safeDt : 0;
        const accelerationY = previous ? (vy - prev.velocityY) / safeDt : 0;
        prevTips.set(key, {
          x: pos.x,
          y: pos.y,
          velocityX: vx,
          velocityY: vy,
        });
        return {
          x: pos.x,
          y: pos.y,
          prevX: prev.x,
          prevY: prev.y,
          velocityX: vx,
          velocityY: vy,
          speed,
          propIndex,
          tipIndex,
          accelerationX,
          accelerationY,
          flameScale: 1.0,
          jerk: Math.hypot(accelerationX, accelerationY),
        };
      };

      const bt = computeTips(cs, left, leftVB);
      const rt = computeTips(cs, right, rightVB);
      if (bt) {
        tips.push(buildTip(bt.a, 0, 0));
        tips.push(buildTip(bt.b, 0, 1));
      }
      if (rt) {
        tips.push(buildTip(rt.a, 1, 0));
        tips.push(buildTip(rt.b, 1, 1));
      }

      const input: FireFrameInput = {
        tips,
        currentTime,
        canvasWidth: cs,
        canvasHeight: cs,
        darkMode: true,
      };

      renderer.renderCharcoal(input, { ...DEFAULT_FIRE_CONFIG });
      ctx.drawImage(webglCanvas as any, 0, 0);
    },
    dispose() {
      renderer.dispose();
    },
  };
}

// ── Factory ────────────────────────────────────────────────────

export function createWorkerEffectRenderer(
  effectType: EffectType,
  canvasSize: number
): WorkerEffectRenderer | null {
  switch (effectType) {
    case "none":
      return null;
    case "trails":
      return createTrailsRenderer();
    case "bloom":
      return createBloomRenderer(canvasSize);
    case "ghost":
      return createGhostRenderer(canvasSize);
    case "pulse":
      return createPulseRenderer(canvasSize);
    case "fire":
      return createFireRenderer(canvasSize);
    case "smoke":
      return (
        createSmokeRenderer(canvasSize) ??
        createQuadTipEffect("smoke", canvasSize)
      );
    case "led":
      return createLedRenderer(canvasSize);
    case "charcoal":
      return createCharcoalRenderer(canvasSize);
    case "goo":
    case "bubbles":
    case "petals":
    case "frost":
    case "ink":
    case "sparkles":
    case "silk":
    case "animal":
    case "zap":
      return createQuadTipEffect(effectType, canvasSize);
    default: {
      const _exhaustive: never = effectType;
      return null;
    }
  }
}

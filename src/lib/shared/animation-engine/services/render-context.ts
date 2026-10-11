import type { RenderContext } from "./render-context-registry";
import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { EffectRendererManager } from "./effect-renderer-manager";
import type { TrailCapturer } from "./trail-capturer";
import type { IAnimationRenderLoop } from "#lib/shared/animation-engine/services/IAnimationRenderLoop.js";
import type { CanvasResizer } from "./canvas-resizer.svelte";
import type { IAnimationPrecomputer } from "#lib/shared/animation-engine/services/IAnimationPrecomputer.js";
import type { AnimationEngineProps } from "#lib/shared/animation-engine/services/animation-engine.svelte.js";

export interface RenderContextDeps {
  id: string;
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  renderer: IAnimationRenderer;
  effectManager: EffectRendererManager;
  trailCapturer: TrailCapturer;
  renderLoop: IAnimationRenderLoop;
  resizer: CanvasResizer;
  precomputer: IAnimationPrecomputer;
  /** Deterministic single-frame drive — delegates to the owning engine's
   *  renderFrame(props, timeMs, dtSeconds). */
  renderFrameSync: (
    props: AnimationEngineProps,
    timeMs: number,
    dtSeconds: number,
  ) => void;
}

export class LiveRenderContext implements RenderContext {
  readonly id: string;
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLDivElement;
  readonly renderer: IAnimationRenderer;
  readonly effectManager: EffectRendererManager;
  readonly trailCapturer: TrailCapturer;
  readonly renderLoop: IAnimationRenderLoop;
  readonly resizer: CanvasResizer;
  readonly precomputer: IAnimationPrecomputer;
  private readonly _renderFrameSync: RenderContextDeps["renderFrameSync"];

  size: number;

  constructor(deps: RenderContextDeps) {
    this.id = deps.id;
    this.canvas = deps.canvas;
    this.container = deps.container;
    this.renderer = deps.renderer;
    this.effectManager = deps.effectManager;
    this.trailCapturer = deps.trailCapturer;
    this.renderLoop = deps.renderLoop;
    this.resizer = deps.resizer;
    this.precomputer = deps.precomputer;
    this._renderFrameSync = deps.renderFrameSync;
    this.size = deps.canvas.width;
  }

  renderFrameSync(
    props: AnimationEngineProps,
    timeMs: number,
    dtSeconds: number,
  ): void {
    this._renderFrameSync(props, timeMs, dtSeconds);
  }

  resize(newSize: number): void {
    this.size = newSize;
    this.renderer.resize(newSize);
    this.effectManager.resizeAll(newSize);
    this.trailCapturer.updateConfig({ canvasSize: newSize });
    this.renderLoop.updateConfig({ canvasSize: newSize });
  }

  restoreSize(): void {
    const rect = this.container.getBoundingClientRect();
    const containerSize = Math.min(rect.width || 500, rect.height || 500) || 500;
    this.resize(containerSize);
  }

  dispose(): void {
    this.effectManager.dispose();
    this.renderLoop.dispose();
    this.precomputer.dispose();
    this.trailCapturer.clearTrails();
  }
}

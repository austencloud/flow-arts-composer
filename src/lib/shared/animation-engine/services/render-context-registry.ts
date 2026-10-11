import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { EffectRendererManager } from "./effect-renderer-manager";
import type { TrailCapturer } from "./trail-capturer";
import type { IAnimationRenderLoop } from "#lib/shared/animation-engine/services/IAnimationRenderLoop.js";
import type { CanvasResizer } from "./canvas-resizer.svelte";
import type { IAnimationPrecomputer } from "#lib/shared/animation-engine/services/IAnimationPrecomputer.js";
import type { AnimationEngineProps } from "#lib/shared/animation-engine/services/animation-engine.svelte.js";

export interface RenderContext {
  readonly id: string;
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLDivElement;
  readonly renderer: IAnimationRenderer;
  readonly effectManager: EffectRendererManager;
  readonly trailCapturer: TrailCapturer;
  readonly renderLoop: IAnimationRenderLoop;
  readonly resizer: CanvasResizer;
  readonly precomputer: IAnimationPrecomputer;

  size: number;

  resize(size: number): void;
  restoreSize(): void;
  dispose(): void;

  /** Render ONE frame synchronously at an explicit virtual clock + fixed dt —
   *  the same deterministic path the offscreen export uses (engine.renderFrame).
   *  Lets a caller drive the live engine off a virtual clock instead of the
   *  rAF wall-clock, so its trail accumulator decays on the export's fixed
   *  cadence rather than real render speed (the parity harness uses this to make
   *  the live reference faithful). */
  renderFrameSync(
    props: AnimationEngineProps,
    timeMs: number,
    dtSeconds: number,
  ): void;
}

export class RenderContextRegistry {
  private contexts = new Map<string, RenderContext>();

  register(context: RenderContext): void {
    this.contexts.set(context.id, context);
  }

  unregister(id: string): void {
    this.contexts.delete(id);
  }

  get(id: string): RenderContext | null {
    return this.contexts.get(id) ?? null;
  }

  getAll(): RenderContext[] {
    return Array.from(this.contexts.values());
  }
}

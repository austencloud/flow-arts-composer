/**
 * Smoke Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * Selects the WebGL density renderer and retains Canvas puffs as the capability
 * fallback. Both backends satisfy the same render-loop contract.
 */

import type { Smoke2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Smoke2DRenderer } from "#lib/shared/effects/renderers/smoke-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer, type EffectRendererLike } from "./effects/effect-renderer";
import { WebGLSmokeRenderer } from "./smoke/web-gl-smoke-renderer";

export class CanvasSmokeOverlayRenderer extends EffectRenderer {
  private renderer = new Smoke2DRenderer();

  renderFrame(params: Smoke2DParams, tips: EmitterTip[], dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, dt, this.scale);
  }

  protected override onClear(): void {
    this.renderer.dispose();
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

/**
 * Selects fluid Smoke when WebGL2 float targets are available and preserves the
 * puff renderer as a capability fallback. The facade owns lifecycle value: it
 * prevents renderer-manager and export callers from duplicating backend policy.
 */
export class SmokeOverlayRenderer implements EffectRendererLike {
  private backend: WebGLSmokeRenderer | CanvasSmokeOverlayRenderer | null = null;
  private container: HTMLElement | null = null;
  private width = 0;
  private height = 0;

  initialize(container: HTMLElement, width: number, height: number): boolean {
    this.dispose();
    this.container = container;
    this.width = width;
    this.height = height;
    const fluid = new WebGLSmokeRenderer();
    if (fluid.initialize(container, width, height)) {
      fluid.setFailureHandler(() => this.activateCanvasFallback());
      this.backend = fluid;
      return true;
    }
    const canvas = new CanvasSmokeOverlayRenderer();
    if (!canvas.initialize(container, width, height)) return false;
    this.backend = canvas;
    return true;
  }

  renderFrame(params: Smoke2DParams, tips: EmitterTip[], dt: number): void {
    this.backend?.renderFrame(params, tips, dt);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.backend?.resize?.(width, height);
  }

  clear(): void {
    this.backend?.clear();
  }

  clearSimulation(): void {
    this.clear();
  }

  setCanvasZIndex(z: number): void {
    this.backend?.setCanvasZIndex?.(z);
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.backend?.getCanvas() ?? null;
  }

  isInitialized(): boolean {
    return this.backend?.isInitialized() ?? false;
  }

  getBackendKind(): "fluid" | "canvas" | null {
    if (this.backend instanceof WebGLSmokeRenderer) return "fluid";
    if (this.backend instanceof CanvasSmokeOverlayRenderer) return "canvas";
    return null;
  }

  dispose(): void {
    this.backend?.dispose();
    this.backend = null;
    this.container = null;
    this.width = 0;
    this.height = 0;
  }

  private activateCanvasFallback(): void {
    if (!this.container) return;
    const previous = this.backend;
    const canvas = new CanvasSmokeOverlayRenderer();
    this.backend = canvas.initialize(this.container, this.width, this.height)
      ? canvas
      : null;
    previous?.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { SmokeIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const smokeEffectPlugin: EffectPlugin<SmokeIntent> = {
  id: "smoke",
  kind: "webgl",
  createRenderer: () => new SmokeOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.smoke,
  configKey: "smokeRenderer",
};

/**
 * Bubbles Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Bubbles2DRenderer`. Follows
 * the bloom/echo/water overlay pattern: position:absolute, pointer-
 * events:none, z-index above trails.
 *
 * Bubbles have persistent particle state (alive bubbles + in-flight pop
 * bursts), so unlike bloom we do NOT clear accumulated state on each
 * frame - only the canvas pixels. The pool is cleared on dispose() or
 * explicit clear().
 */

import type { Bubbles2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Bubbles2DRenderer } from "#lib/shared/effects/renderers/bubbles-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class BubblesOverlayRenderer extends EffectRenderer {
  private renderer = new Bubbles2DRenderer();

  renderFrame(params: Bubbles2DParams, tips: EmitterTip[], dt: number): void {
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

import type { EffectPlugin } from "./effects/effect-plugin";
import type { BubblesIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const bubblesEffectPlugin: EffectPlugin<BubblesIntent> = {
  id: "bubbles",
  kind: "canvas2d",
  createRenderer: () => new BubblesOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.bubbles,
  configKey: "bubblesRenderer",
};

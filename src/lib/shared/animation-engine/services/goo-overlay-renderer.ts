/**
 * Goo Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Goo2DRenderer`. Follows the
 * bloom/echo/sparkles overlay pattern: position:absolute, pointer-events:none,
 * z-index above trails.
 *
 * Goo has persistent particle state (blob pool), so unlike bloom we do NOT
 * clear the accumulated blobs on each frame - only the canvas pixels. The pool
 * is cleared on dispose() or explicit clear().
 *
 * Renamed from the realistic-water overlay (2026-06-28): the water effect was
 * replaced by the viscous luminous goo metaball look.
 */

import type { GooParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Goo2DRenderer } from "#lib/shared/effects/renderers/goo-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class GooOverlayRenderer extends EffectRenderer {
  private renderer = new Goo2DRenderer();

  renderFrame(params: GooParams, tips: EmitterTip[], dt: number): void {
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
import type { GooIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const gooEffectPlugin: EffectPlugin<GooIntent> = {
  id: "goo",
  kind: "canvas2d",
  createRenderer: () => new GooOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.goo,
  configKey: "gooRenderer",
};

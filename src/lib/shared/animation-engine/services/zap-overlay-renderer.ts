/**
 * Zap Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Zap2DRenderer`. Mirrors the
 * trail/fire overlay pattern: position:absolute, pointer-events:none,
 * z-index sits above the trails canvas (1) but below LED (which composites
 * via WebGL on its own layer).
 *
 * The overlay canvas is fully cleared each frame before drawing - Zap2DRenderer
 * uses additive blending, so we don't want stale arcs from the previous frame
 * to fade in/out unpredictably. Procedural midpoint-displacement regenerates
 * arcs every few frames inside the renderer to produce the flicker.
 */

import type { Zap2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Zap2DRenderer } from "#lib/shared/effects/renderers/zap-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class ZapOverlayRenderer extends EffectRenderer {
  private renderer = new Zap2DRenderer();

  renderFrame(params: Zap2DParams, tips: EmitterTip[]): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Always clear - the underlying renderer uses 'lighter' composite, so
    // residual pixels from the previous frame would accumulate brightness.
    ctx.clearRect(0, 0, this.width, this.height);

    // If no tips at all, we already cleared - nothing more to draw.
    if (tips.length === 0) {
      return;
    }

    this.renderer.render(ctx, params, tips, this.scale);
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { ZapIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const zapEffectPlugin: EffectPlugin<ZapIntent> = {
  id: "zap",
  kind: "canvas2d",
  createRenderer: () => new ZapOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.zap,
  configKey: "zapRenderer",
};

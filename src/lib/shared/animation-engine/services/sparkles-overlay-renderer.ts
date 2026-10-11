/**
 * Sparkles Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Sparkles2DRenderer`. Mirrors
 * the zap overlay pattern: position:absolute, pointer-events:none, z-index
 * sits above the trails canvas (1) but below LED.
 *
 * The overlay canvas is fully cleared each frame before drawing - Sparkles2DRenderer
 * uses additive blending, so we don't want stale particles from the previous frame
 * to fade in/out unpredictably. The renderer holds particle pool state across frames.
 */

import type { Sparkles2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Sparkles2DRenderer } from "#lib/shared/effects/renderers/sparkles-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class SparklesOverlayRenderer extends EffectRenderer {
  private renderer = new Sparkles2DRenderer();

  renderFrame(params: Sparkles2DParams, tips: EmitterTip[], dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    // Step physics every frame so existing particles continue decaying even when
    // tips drop out (e.g., between sequence loops).
    this.renderer.render(ctx, params, tips, dt, this.scale);
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { SparklesIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const sparklesEffectPlugin: EffectPlugin<SparklesIntent> = {
  id: "sparkles",
  kind: "canvas2d",
  createRenderer: () => new SparklesOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.sparkles,
  configKey: "sparklesRenderer",
};

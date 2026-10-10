/**
 * Bloom Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Bloom2DRenderer`. Mirrors
 * the echo/sparkles overlay pattern: position:absolute, pointer-events:
 * none, z-index above trails.
 *
 * The canvas is cleared each frame before drawing. Bloom is a stateless
 * effect - no phantom buffers, no particle pools - so draw-fresh every
 * frame keeps behavior deterministic when playback is paused or seeks.
 */

import type { Bloom2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import {
  Bloom2DRenderer,
  type BloomTipInput,
} from "#lib/shared/effects/renderers/bloom-2d-renderer.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class BloomOverlayRenderer extends EffectRenderer {
  private renderer = new Bloom2DRenderer();

  renderFrame(params: Bloom2DParams, tips: BloomTipInput[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, this.scale);
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { BloomIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const bloomEffectPlugin: EffectPlugin<BloomIntent> = {
  id: "bloom",
  kind: "canvas2d",
  createRenderer: () => new BloomOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.bloom,
  configKey: "bloomRenderer",
};

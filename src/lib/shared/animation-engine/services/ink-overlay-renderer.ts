/**
 * Ink Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Ink2DRenderer`. Follows
 * the smoke overlay pattern: position:absolute, pointer-events:none,
 * z-index above trails.
 *
 * Ink has persistent per-tip point history (for the stroke path), so
 * unlike bloom we don't clear accumulated state on each frame - only
 * the canvas pixels. The per-tip history is cleared on dispose() or
 * explicit clear() (e.g. sequence boundary).
 */

import type { Ink2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import {
  Ink2DRenderer,
  type InkFrameBoundary,
} from "#lib/shared/effects/renderers/ink-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class InkOverlayRenderer extends EffectRenderer {
  private renderer = new Ink2DRenderer();

  renderFrame(
    params: Ink2DParams,
    tips: EmitterTip[],
    dt: number,
    boundary?: InkFrameBoundary
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, dt, this.scale, boundary);
  }

  protected override onClear(): void {
    this.renderer.dispose();
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const inkEffectPlugin: EffectPlugin<InkIntent> = {
  id: "ink",
  kind: "canvas2d",
  createRenderer: () => new InkOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.ink,
  configKey: "inkRenderer",
};

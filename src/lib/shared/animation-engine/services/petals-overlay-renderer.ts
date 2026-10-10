/**
 * Petals Overlay Renderer
 *
 * Owns an absolutely-positioned Canvas2D element on top of the animator
 * surface and delegates per-frame drawing to `Petals2DRenderer`. Follows
 * the bloom/echo/water/bubbles overlay pattern: position:absolute, pointer-
 * events:none, z-index above trails.
 *
 * Petals have persistent particle state (falling particles + per-petal
 * sway phase), so unlike bloom we do NOT clear accumulated state on each
 * frame - only the canvas pixels. The pool is cleared on dispose() or
 * explicit clear().
 */

import type { Petals2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Petals2DRenderer } from "#lib/shared/effects/renderers/petals-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class PetalsOverlayRenderer extends EffectRenderer {
  private renderer = new Petals2DRenderer();

  renderFrame(params: Petals2DParams, tips: EmitterTip[], dt: number): void {
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
import type { PetalsIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const petalsEffectPlugin: EffectPlugin<PetalsIntent> = {
  id: "petals",
  kind: "canvas2d",
  createRenderer: () => new PetalsOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.petals,
  configKey: "petalsRenderer",
};

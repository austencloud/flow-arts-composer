/**
 * Ghost Overlay Renderer — Prop Onion-Skin (Ghost Trail)
 *
 * Owns an absolutely-positioned Canvas2D element. The Ghost2DRenderer ghosts the
 * real prop sprite at past poses, baking the static figure into its own cache and
 * redrawing only the recency tail each frame, so this overlay is a thin
 * pass-through: it just hands the inner renderer the visible context. No
 * accumulation buffer, no fade machinery. z-index sits in the bloom/echo/sparkles
 * band (2).
 */

import {
  Ghost2DRenderer,
  type GhostInput,
} from "#lib/shared/effects/renderers/ghost-2d-renderer.js";
import type { Ghost2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class GhostOverlayRenderer extends EffectRenderer {
  private renderer = new Ghost2DRenderer();

  renderFrame(params: Ghost2DParams, input: GhostInput, deltaTime: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // The inner renderer clears + draws the ghost figure (figure floor + tail)
    // straight onto the visible canvas, applying the master intensity itself.
    this.renderer.render(ctx, params, input, deltaTime, this.scale);
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.renderer.reset();
  }

  protected override onClear(): void {
    this.renderer.reset();
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { GhostIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const ghostEffectPlugin: EffectPlugin<GhostIntent> = {
  id: "ghost",
  kind: "canvas2d",
  createRenderer: () => new GhostOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.ghost,
  configKey: "ghostRenderer",
};

import type { Frost2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Frost2DRenderer } from "#lib/shared/effects/renderers/frost-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class FrostOverlayRenderer extends EffectRenderer {
  private renderer = new Frost2DRenderer();

  renderFrame(params: Frost2DParams, tips: EmitterTip[], dt: number): void {
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
import type { FrostIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const frostEffectPlugin: EffectPlugin<FrostIntent> = {
  id: "frost",
  kind: "canvas2d",
  createRenderer: () => new FrostOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.frost,
  configKey: "frostRenderer",
};

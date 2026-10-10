import type { Silk2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Silk2DRenderer } from "#lib/shared/effects/renderers/silk-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class SilkOverlayRenderer extends EffectRenderer {
  private renderer = new Silk2DRenderer();

  renderFrame(params: Silk2DParams, tips: EmitterTip[], dt: number, loopDetected?: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, dt, this.scale, loopDetected);
  }

  protected override onClear(): void {
    this.renderer.dispose();
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { SilkIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const silkEffectPlugin: EffectPlugin<SilkIntent> = {
  id: "silk",
  kind: "canvas2d",
  createRenderer: () => new SilkOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.silk,
  configKey: "silkRenderer",
};

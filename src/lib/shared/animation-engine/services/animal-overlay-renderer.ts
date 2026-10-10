import type { Animal2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import { Animal2DRenderer } from "#lib/shared/effects/renderers/animal-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class AnimalOverlayRenderer extends EffectRenderer {
  private renderer = new Animal2DRenderer();

  renderFrame(params: Animal2DParams, tips: EmitterTip[], dt: number, loopDetected?: boolean): void {
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
import type { AnimalIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const animalEffectPlugin: EffectPlugin<AnimalIntent> = {
  id: "animal",
  kind: "canvas2d",
  createRenderer: () => new AnimalOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.animal,
  configKey: "animalRenderer",
};

import type { Pulse2DParams } from "#lib/shared/effects/translators/canvas2d-types.js";
import {
  Pulse2DRenderer,
  type PulseTipInput,
} from "#lib/shared/effects/renderers/pulse-2d-renderer.js";
import { EffectRenderer } from "./effects/effect-renderer";

export class PulseOverlayRenderer extends EffectRenderer {
  private renderer = new Pulse2DRenderer();

  renderFrame(params: Pulse2DParams, tips: PulseTipInput[], currentStep: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.renderer.render(ctx, params, tips, currentStep, dt, this.scale);
  }

  protected override onDispose(): void {
    this.renderer.dispose();
  }
}

import type { EffectPlugin } from "./effects/effect-plugin";
import type { PulseIntent } from "#lib/shared/effects/domain/effects-config.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

export const pulseEffectPlugin: EffectPlugin<PulseIntent> = {
  id: "pulse",
  kind: "canvas2d",
  createRenderer: () => new PulseOverlayRenderer(),
  defaultConfig: DEFAULT_EFFECTS_CONFIG.pulse,
  configKey: "pulseRenderer",
};

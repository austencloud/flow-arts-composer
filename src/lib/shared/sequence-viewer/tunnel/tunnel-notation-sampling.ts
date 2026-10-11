import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { BuiltTunnelLayer } from "./tunnel-layer-builder";
import { tunnelStepIndexAt } from "./tunnel-prop-sampling";

export interface TunnelNotationSample {
  layer: BuiltTunnelLayer;
  step: StepData;
  stepIndex: number;
}

/** Resolve each transformed stage appearance at a shared beat. The timing
 * callback comes from the same controller path that samples the live canvas. */
export function sampleTunnelNotation(
  layers: readonly BuiltTunnelLayer[],
  currentStep: number,
  timingForLayer: (layer: BuiltTunnelLayer) => { offset: number; speed: number }
): TunnelNotationSample[] {
  return layers.flatMap((layer) => {
    const { offset, speed } = timingForLayer(layer);
    const index = tunnelStepIndexAt(
      layer.sequence.steps.length,
      currentStep,
      offset,
      speed
    );
    if (index === null) return [];
    const step = layer.sequence.steps[index];
    return step ? [{ layer, step, stepIndex: index }] : [];
  });
}

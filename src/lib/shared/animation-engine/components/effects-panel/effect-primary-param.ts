/**
 * Primary-parameter adapter for the mobile Effects strips layout.
 *
 * Each effect exposes one dominant scalar that the mobile panel surfaces
 * as a primary slider (beneath the preset strip). The adapter is a pure
 * data structure - no Svelte, no VM. Phase 2 will extend it with a 3D
 * branch once the 3D renderer shares this state.
 *
 * All params map to existing properties on EffectsConfigState
 * (src/lib/shared/effects/domain/EffectsConfig.ts).
 */

import type { EffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { SILK_INTENSITY_MAX } from "#lib/shared/effects/domain/effects-config.js";

export interface PrimaryParamSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly get: (state: EffectsConfigState) => number;
  readonly set: (state: EffectsConfigState, value: number) => void;
}

const fmt2 = (v: number) => v.toFixed(2);
const fmtInt = (v: number) => String(Math.round(v));

export const PRIMARY_PARAMS: Record<string, PrimaryParamSpec> = {
  trails: {
    label: "Thickness",
    min: 1,
    max: 12,
    step: 1,
    format: fmtInt,
    get: (s) => s.trails.thickness,
    set: (s, v) => s.updateEffect("trails", { thickness: Math.round(v) }),
  },
  fire: {
    label: "Intensity",
    min: 0.45,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.fire.intensity,
    set: (s, v) => s.updateEffect("fire", { intensity: v }),
  },
  led: {
    label: "Brightness",
    min: 1,
    max: 5,
    step: 1,
    format: fmtInt,
    get: (s) => s.led.look.brightness,
    set: (s, v) =>
      s.updateEffect("led", {
        look: { ...s.led.look, brightness: Math.round(v) },
      }),
  },
  charcoal: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.charcoal.intensity,
    set: (s, v) => s.updateEffect("charcoal", { intensity: v }),
  },
  zap: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.zap.intensity,
    set: (s, v) => s.updateEffect("zap", { intensity: v }),
  },
  sparkles: {
    label: "Rate",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.sparkles.rate,
    set: (s, v) => s.updateEffect("sparkles", { rate: v }),
  },
  ghost: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.ghost.intensity,
    set: (s, v) => s.updateEffect("ghost", { intensity: v }),
  },
  bloom: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.bloom.intensity,
    set: (s, v) => s.updateEffect("bloom", { intensity: v }),
  },
  goo: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.goo.intensity,
    set: (s, v) => s.updateEffect("goo", { intensity: v }),
  },
  bubbles: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.bubbles.intensity,
    set: (s, v) => s.updateEffect("bubbles", { intensity: v }),
  },
  petals: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.petals.intensity,
    set: (s, v) => s.updateEffect("petals", { intensity: v }),
  },
  smoke: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.smoke.intensity,
    set: (s, v) => s.updateEffect("smoke", { intensity: v }),
  },
  ink: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.ink.intensity,
    set: (s, v) => s.updateEffect("ink", { intensity: v }),
  },
  frost: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.frost.intensity,
    set: (s, v) => s.updateEffect("frost", { intensity: v }),
  },
  // Silk's intensity is capped below 1 in the manifest (SILK_INTENSITY_MAX);
  // the slider honours that ceiling rather than offering unreachable travel.
  silk: {
    label: "Intensity",
    min: 0,
    max: SILK_INTENSITY_MAX,
    step: 0.01,
    format: fmt2,
    get: (s) => s.silk.intensity,
    set: (s, v) => s.updateEffect("silk", { intensity: v }),
  },
  animal: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.animal.intensity,
    set: (s, v) => s.updateEffect("animal", { intensity: v }),
  },
  pulse: {
    label: "Intensity",
    min: 0,
    max: 1,
    step: 0.01,
    format: fmt2,
    get: (s) => s.pulse.intensity,
    set: (s, v) => s.updateEffect("pulse", { intensity: v }),
  },
};

export function getPrimaryParam(effectId: string, state: EffectsConfigState): number {
  const spec = PRIMARY_PARAMS[effectId];
  if (!spec) throw new Error(`No primary param registered for effect "${effectId}"`);
  return spec.get(state);
}

export function setPrimaryParam(
  effectId: string,
  state: EffectsConfigState,
  value: number,
): void {
  const spec = PRIMARY_PARAMS[effectId];
  if (!spec) throw new Error(`No primary param registered for effect "${effectId}"`);
  spec.set(state, value);
}

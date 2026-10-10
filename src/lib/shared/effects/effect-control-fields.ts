import type { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  DEFAULT_PROP_FLAME_COLORS,
  flameColorToHex,
  hexToFlameColor,
} from "#lib/shared/animation-engine/domain/types/fire-types.js";
import type { AnimationSettingsState } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
import type { ControlDescriptor } from "#lib/shared/effects/domain/effect-control-manifest.js";
import type {
  EffectId,
  EffectsConfigState,
} from "#lib/shared/effects/state/effects-config-state.svelte.js";

export type EffectControlOverrides = Record<
  string,
  { get: () => unknown; set: (value: unknown) => void }
>;

type ControlEffectsConfig = Pick<EffectsConfigState, "fire" | "updateEffect">;

type ControlAnimationSettings = Pick<
  AnimationSettingsState,
  "trail" | "setTailLength" | "setTrackingMode"
>;

/**
 * Connect controls whose values live outside their effect intent.
 *
 * Both viewer surfaces render the same manifest. Keeping these adapters here
 * means opening the 3D FX panel gets the same trail and fire values as the 2D
 * panel instead of handing an absent value to a slider.
 */
export function createEffectControlOverrides(
  effect: EffectId,
  config: ControlEffectsConfig,
  animation: ControlAnimationSettings
): EffectControlOverrides | undefined {
  if (effect === "trails") {
    return {
      tailLength: {
        get: () => animation.trail.tailLength,
        set: (value) => animation.setTailLength(value as number),
      },
      trackingMode: {
        get: () => animation.trail.trackingMode,
        set: (value) => animation.setTrackingMode(value as TrackingMode),
      },
    };
  }

  if (effect === "fire") {
    const readHex = (index: 0 | 1) =>
      flameColorToHex(
        config.fire.propColors?.[index] ?? DEFAULT_PROP_FLAME_COLORS[index]
      );
    const writeColors = (left: string, right: string) =>
      config.updateEffect("fire", {
        colorBlend: 1,
        propColors: [hexToFlameColor(left), hexToFlameColor(right)],
      });

    return {
      fireLeftHex: {
        get: () => readHex(0),
        set: (value) => writeColors(value as string, readHex(1)),
      },
      fireRightHex: {
        get: () => readHex(1),
        set: (value) => writeColors(readHex(0), value as string),
      },
    };
  }

  return undefined;
}

export function formatEffectSliderValue(
  control: ControlDescriptor,
  value: unknown
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (control.pct) return `${Math.round(value * 100)}%`;
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

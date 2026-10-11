import type { EffectConfig } from "../domain/types";
import type { FireOverlayConfig } from "#lib/shared/animation-engine/domain/types/fire-types.js";
import type { LedOverlayConfig } from "#lib/shared/animation-engine/domain/types/led-types.js";
import {
  CAPSULE_LED_COUNT,
  DEFAULT_LED_LOOK,
  PATTERN_MATERIALIZE_BRIGHTNESS,
  hexToRgb255,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import type {
  TrailMode} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  TrailEffect,
  TrackingMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

export function toFireConfig(effect: EffectConfig["fire"]): FireOverlayConfig {
  return {
    intensity: effect.intensity,
    flameHeight: effect.flameHeight,
    velocityReactive: true,
    quality: 3,
    colorBlend: effect.colorBlend,
  };
}

export function toLedConfig(effect: EffectConfig["led"]): LedOverlayConfig {
  // Video endpoints are two bright points per prop, so the video path is
  // always the capsule device running a solid strip in the picked color.
  return {
    enabled: effect.enabled,
    device: { kind: "capsule", ledCount: CAPSULE_LED_COUNT },
    pattern: {
      source: "generator",
      generatorId: "solid",
      params: {
        primaryColor: hexToRgb255(effect.color),
        speed: 1,
        brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
      },
    },
    cycleDuration: 3,
    look: {
      ...DEFAULT_LED_LOOK,
      glare: effect.glare,
      brightness: Math.min(5, Math.max(1, Math.round(effect.brightness))),
    },
  };
}

export function toTrailSettings(effect: EffectConfig["trails"]): TrailSettings {
  // Convert a frame-count length to a fade duration in milliseconds.
  // Assuming 60fps: length frames * (1000ms / 60frames) gives the fade window.
  const fadeDurationMs = (effect.length * 1000) / 60;

  return {
    mode: effect.mode as TrailMode,
    effect: effect.glow ? TrailEffect.GLOW : TrailEffect.NONE,
    fadeDurationMs,
    maxPoints: effect.length * 4,
    lineWidth: effect.width,
    glowBlur: effect.glow ? 8 : 0,
    leftColor: effect.color.left,
    rightColor: effect.color.right,
    additionalLayerColors: [],
    minOpacity: 1 - effect.fade,
    maxOpacity: 1.0,
    trackingMode: TrackingMode.BOTH_ENDS,
    hideProps: false,
    usePathCache: false,
    previewMode: false,
    tailLength: 20,
  };
}

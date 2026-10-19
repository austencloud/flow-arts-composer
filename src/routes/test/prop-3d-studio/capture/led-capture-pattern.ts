import {
  hexToRgb255,
  PATTERN_MATERIALIZE_BRIGHTNESS,
  PROP_BLUE,
  PROP_RED,
  type LedPatternSource,
} from "#lib/shared/animation-engine/domain/types/led-types.js";

export function ledCapturePattern(
  defaultPattern: LedPatternSource,
  generatorId: "prop-colors" | "rainbow-sweep"
): Extract<LedPatternSource, { source: "generator" }> {
  return {
    source: "generator",
    generatorId,
    params:
      defaultPattern.source === "generator"
        ? defaultPattern.params
        : {
            primaryColor: hexToRgb255(PROP_BLUE),
            secondaryColor: hexToRgb255(PROP_RED),
            speed: 1,
            brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
          },
  };
}

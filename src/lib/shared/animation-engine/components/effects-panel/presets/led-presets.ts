/**
 * LED effect presets.
 *
 * Each preset is a complete prop: a device, the strip pattern it runs, how
 * fast that pattern loops, and the look.
 *
 * Four looks, not six. Gradient Blade and Sunset Sweep were both a 200-LED
 * staff running a two-color gradient under an eye shutter, which is the same
 * picture Rainbow POV paints with more colors and a camera shutter behind it —
 * measured on `/create/fuse` they lit 11.0% and 9.3% of the frame against
 * Rainbow POV's 18.7%, doing a worse version of its job. Three near-identical
 * tiles do not give the user three choices; they make the one good choice
 * harder to find, and they teach that the looks are interchangeable.
 *
 * What survives is one look per idea: two discrete bulbs, two bulbs breathing,
 * a full-spectrum strip held open, and a single racing head. Everything the
 * deleted pair could express — any color pair, any persistence, any strip
 * length — is still reachable, one tap away under TUNE, which is where a
 * continuous axis belongs. A preset row is for picking a look, not for
 * enumerating a parameter space.
 */

import type { EffectPreset, EffectPresetGroup } from "./types";
import {
  CAPSULE_LED_COUNT,
  DEFAULT_LED_LOOK,
  PATTERN_MATERIALIZE_BRIGHTNESS,
  PROP_BLUE,
  PROP_RED,
  hexToRgb255,
  type LedLook,
} from "#lib/shared/animation-engine/domain/types/led-types.js";
import type { PatternParams } from "#lib/shared/poi/domain/strip-pattern.js";

function look(overrides: Partial<LedLook> = {}): LedLook {
  return { ...DEFAULT_LED_LOOK, ...overrides };
}

function params(primary: string, secondary?: string): PatternParams {
  return {
    primaryColor: hexToRgb255(primary),
    secondaryColor: secondary ? hexToRgb255(secondary) : undefined,
    speed: 1,
    brightness: PATTERN_MATERIALIZE_BRIGHTNESS,
  };
}

const CAPSULE = { kind: "capsule", ledCount: CAPSULE_LED_COUNT } as const;
const STAFF_200 = { kind: "pixel-staff", ledCount: 200 } as const;

export const LED_PRESETS: EffectPreset<"led">[] = [
  {
    id: "led-capsule-classic",
    name: "Capsule Classic",
    previewColor: PROP_BLUE,
    previewColor2: PROP_RED,
    patch: {
      device: { ...CAPSULE },
      pattern: {
        source: "generator",
        generatorId: "prop-colors",
        params: params(PROP_BLUE, PROP_RED),
      },
      cycleDuration: 3,
      // The tightest beam of the six — two clean endpoint dots, the way a
      // capsule reads — with enough persistence to draw the arcs they sweep.
      look: look({ shutter: { mode: "eye", timeConstantSeconds: 0.3 }, glare: 0.66 }),
    },
  },
  {
    id: "led-capsule-pulse",
    name: "Capsule Pulse",
    previewColor: "#00ff88",
    patch: {
      device: { ...CAPSULE },
      pattern: {
        source: "generator",
        generatorId: "pulse",
        params: params("#00ff88"),
      },
      cycleDuration: 1.6,
      // Shortest persistence of the six: each pulse reads as a distinct beat
      // rather than smearing into the next.
      look: look({ shutter: { mode: "eye", timeConstantSeconds: 0.24 }, glare: 0.64 }),
    },
  },
  {
    id: "led-rainbow-pov",
    name: "Rainbow POV",
    previewColor: "rainbow",
    patch: {
      device: { ...STAFF_200 },
      pattern: {
        source: "generator",
        generatorId: "rainbow-sweep",
        params: params("#ffffff"),
      },
      cycleDuration: 6,
      // The hero look: a camera shutter held open so the whole arc paints in
      // the air, plus the broadest glare veil of the six.
      // The floor of the scale, not the ceiling, and it is the only preset that
      // sits there. A 2.5s exposure already stacks roughly twenty passes at a
      // fixed gain, so the flux arrives from the shutter rather than from the
      // budget; at 2 the stack clipped straight through the middle of the arc
      // and took the spectrum with it. Every value here has to be one of the
      // tuner's integer steps, or opening TUNE on this preset shows a
      // brightness control with nothing selected.
      look: look({
        shutter: { mode: "camera", exposureSeconds: 2.5 },
        glare: 0.9,
        brightness: 1,
      }),
    },
  },
  {
    id: "led-comet",
    name: "Comet",
    previewColor: "#3b82f6",
    patch: {
      device: { ...STAFF_200 },
      pattern: {
        source: "generator",
        generatorId: "comet",
        params: params("#3b82f6"),
      },
      // Slow enough that the head barely moves down the shaft while the
      // shutter is open — a fifth of the strip over one exposure. That is what
      // keeps the loops a similar size instead of spiralling in to a point.
      cycleDuration: 6,
      // The one look built on WHERE the light is rather than what color it is,
      // so it needs the finest strip: the head is 3% of the LEDs, and on a
      // 72-LED staff that is two pixels, which resolves as a dot rather than a
      // head. At 200 it is a solid bar with an edge.
      //
      // A camera, and that is the whole preset. Persistence was tried twice and
      // is the wrong instrument for a single moving point: an eye shutter only
      // ever shows the last fraction of a second, so a lone head draws a short
      // squiggle and nothing else, however bright it is turned up. A camera
      // holds every position at full weight for the whole exposure, which is
      // exactly how a moving point becomes a drawn line — the same reason a
      // light painter uses one. The tile stops being a dim hook and becomes the
      // looping ribbon the head actually traced.
      //
      // Short exposure, unlike Rainbow POV's. This one is drawing a line, and
      // a line needs to stay a line; a longer one laps the figure over itself.
      look: look({
        shutter: { mode: "camera", exposureSeconds: 1.2 },
        glare: 0.7,
        brightness: 4,
      }),
    },
  },
];

const DEVICE_LABELS: Record<string, string> = {
  capsule: "Capsule",
  "pixel-staff": "Pixel staff",
};

export const LED_PRESET_GROUP: EffectPresetGroup = {
  effectType: "led",
  presets: LED_PRESETS,
  getSummary: (state): string => {
    const { device, pattern, cycleDuration } = state.led;
    const deviceLabel =
      device.kind === "capsule"
        ? DEVICE_LABELS.capsule
        : `${DEVICE_LABELS["pixel-staff"]} ${device.ledCount}`;
    const patternLabel =
      pattern.source === "generator"
        ? pattern.generatorId
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
        : "Image";
    return `${deviceLabel} · ${patternLabel} · ${cycleDuration}s loop`;
  },
};

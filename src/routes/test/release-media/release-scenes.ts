/**
 * Release scenes: the takes a release note's example clip is cut from when
 * it is more than one sequence under several effects.
 *
 * Each scene is one pass of a sequence baked with the real export engine,
 * shaped for a story the clip tells (a hand path growing into a prop and
 * then a tunnel; one fan multiplied into a sculpture). Every take of a
 * story shares the sequence and the clock, so the composer can cross-fade
 * from one to the next on any frame and the motion carries straight on.
 * `scripts/release-media-scenes.mjs` cuts them together.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { RenderLoopClipOptions } from "#lib/shared/sequence-clips/render-loop-clip.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { buildTunnelLayers } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-builder.js";
import { sampleTunnelProps } from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-sampling.js";
import {
  copyModulators,
  DEFAULT_CONFIG,
  type TunnelConfig,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import {
  ZANS_DIAMOND_ORIGINAL,
  zansDiamondStrip,
} from "#lib/shared/guide-topics/zans-diamond-topic.js";
import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
import { stripToSequence } from "../../(public)/guide/level-1/_data/guide-sequence-adapter";

export interface ReleaseScene {
  take: string;
  sequence: () => Promise<SequenceData>;
  options: (sequence: SequenceData) => Promise<RenderLoopClipOptions>;
}

// The hands draw the diamond as they travel; the drawing clears each pass.
const HAND_TRAIL: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.LOOP_CLEAR,
  trackingMode: TrackingMode.HAND,
};

// Each prop tip draws its petals, kept until the pass ends.
const TIP_TRAIL: TrailSettings = {
  ...DEFAULT_TRAIL_SETTINGS,
  mode: TrailMode.LOOP_CLEAR,
  trackingMode: TrackingMode.RIGHT_END,
};

const zansDiamond = async () =>
  stripToSequence(zansDiamondStrip(ZANS_DIAMOND_ORIGINAL), {
    word: ZANS_DIAMOND_ORIGINAL.word,
    name: ZANS_DIAMOND_ORIGINAL.word,
  });

async function publicSequence(id: string): Promise<SequenceData> {
  const loaded = await getBrowseLoader().loadFullSequenceData(id, id);
  if (!loaded) throw new Error(`${id} is not public or failed to load`);
  return loaded;
}

/** The tunnel's extra performers, each sampled on the shared clock. */
async function tunnelLayers(
  base: SequenceData,
  config: TunnelConfig
): Promise<RenderLoopClipOptions["layersForBeat"]> {
  const layers = await buildTunnelLayers(base, config);
  const mods = copyModulators(config);
  return (beat) =>
    layers.map((sequence, i) => {
      const mod = mods[i] ?? { staggerSteps: 0, speed: 1 };
      const props = sampleTunnelProps(
        sequence,
        beat,
        undefined,
        mod.staggerSteps,
        mod.speed
      );
      return { leftProp: props.left, rightProp: props.right };
    });
}

const SENSE_FAN = {
  build: "sense",
  frameColor: "black",
  cover: "bare",
} as const;

export const RELEASE_SCENES: ReleaseScene[] = [
  {
    take: "zans-hand",
    sequence: zansDiamond,
    options: async () => ({
      propType: PropType.HAND,
      effect: "trails",
      trail: HAND_TRAIL,
      bare: true,
    }),
  },
  {
    take: "zans-poi",
    sequence: zansDiamond,
    options: async () => ({
      propType: PropType.POI,
      effect: "trails",
      trail: TIP_TRAIL,
      bare: true,
    }),
  },
  {
    take: "zans-tunnel",
    sequence: zansDiamond,
    options: async (sequence) => ({
      propType: PropType.POI,
      effect: "trails",
      trail: TIP_TRAIL,
      bare: true,
      layersForBeat: await tunnelLayers(sequence, {
        ...DEFAULT_CONFIG,
        fold: 4,
      }),
    }),
  },
  // One performer's pair, the step the sculpture grows from.
  {
    take: "fan-led-solo",
    sequence: () => publicSequence("DCKΨ-"),
    options: async () => ({
      propType: PropType.FAN,
      fanAppearance: SENSE_FAN,
      effect: "led",
      bare: true,
    }),
  },
  ...(
    [
      ["fan-led-4", 4, false, "led"],
      ["fan-led-4m", 4, true, "led"],
      ["fan-led-8", 8, false, "led"],
      ["fan-bloom-4m", 4, true, "bloom"],
    ] as const
  ).map(
    ([take, fold, mirror, effect]): ReleaseScene => ({
      take,
      sequence: () => publicSequence("DCKΨ-"),
      options: async (sequence) => ({
        propType: PropType.FAN,
        fanAppearance: SENSE_FAN,
        effect,
        bare: true,
        layersForBeat: await tunnelLayers(sequence, {
          ...DEFAULT_CONFIG,
          fold,
          mirror,
        }),
      }),
    })
  ),
];

import {
  MediaCompositionPresetSchema,
  type MediaCompositionPreset,
  type PresetClip,
  type PresetSourceRole,
} from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { LayoutRegion } from "$lib/shared/media-composition/domain/media-layout-schema";

const OUTPUT = {
  width: 1080,
  height: 1920,
  frameRate: 30,
  backgroundColor: "#08080c",
} as const;

const FULL_DURATION = {
  start: { unit: "duration-fraction", value: 0 },
  end: { unit: "duration-fraction", value: 1 },
  sourceIn: { unit: "duration-fraction", value: 0 },
  sourceOut: { unit: "duration-fraction", value: 1 },
  playbackRate: 1,
  loop: false,
} as const;

const DEFAULT_TRANSFORM = {
  scale: 1,
  rotationDegrees: 0,
  translateX: 0,
  translateY: 0,
  flipHorizontal: false,
} as const;

type VisualPresetClip = Extract<PresetClip, { kind: "visual" }>;

export const POST_STUDIO_ROLE = {
  performance: "performance-video",
  animation: "sequence-animation",
  card: "choreo-card",
  tunnel: "sequence-tunnel",
  scene3d: "sequence-scene-3d",
  mandala: "sequence-mandala",
  carousel: "sequence-carousel",
} as const;

export type PostStudioRoleKey =
  (typeof POST_STUDIO_ROLE)[keyof typeof POST_STUDIO_ROLE];

/** How a layer element is built and how the compositor reads a frame from it. */
export type PostStudioRenderMode =
  | "external-media"
  | "sequence-animation"
  | "choreo-card"
  | "tunnel"
  | "scene-3d"
  | "mandala"
  /** Drawn by a `PostStudioLayerPainter`, identically in preview and export. */
  | "painted";

function role(
  key: PostStudioRoleKey,
  label: string,
  resolution: PresetSourceRole["resolution"],
  acceptedKinds: PresetSourceRole["acceptedKinds"]
): PresetSourceRole {
  return { key, label, acceptedKinds, required: true, resolution };
}

function region(
  id: string,
  label: string,
  geometry: Pick<LayoutRegion, "x" | "y" | "width" | "height">,
  fit: LayoutRegion["fit"]
): LayoutRegion {
  return {
    id,
    label,
    ...geometry,
    zIndex: 0,
    fit,
    clipContent: true,
    respectSafeArea: false,
  };
}

function visualClip(
  id: string,
  sourceRole: PostStudioRoleKey,
  regionId: string
): VisualPresetClip {
  return {
    id,
    kind: "visual",
    sourceRole,
    regionId,
    ...FULL_DURATION,
    opacity: 1,
    transform: DEFAULT_TRANSFORM,
    // Every sequence-derived visual reads the same resolved timeline. The
    // performance clip uses it for media sync, the animation for fractional
    // motion, and the card for its highlighted pictograph.
    useResolvedTimeMap: true,
  };
}

function breakdownStripClip(
  id: string,
  sourceRole: PostStudioRoleKey,
  regionId: string
): VisualPresetClip {
  return {
    ...visualClip(id, sourceRole, regionId),
    start: {
      unit: "marker",
      markerId: BREAKDOWN_MARKER.start,
      offsetSeconds: 0,
    },
    end: {
      unit: "marker",
      markerId: BREAKDOWN_MARKER.end,
      offsetSeconds: 0,
    },
    fadeInSeconds: 0.5,
    fadeOutSeconds: 0.5,
  };
}

function fractionVisualClip(
  id: string,
  sourceRole: PostStudioRoleKey,
  regionId: string,
  start: number,
  end: number
): PresetClip {
  return {
    ...visualClip(id, sourceRole, regionId),
    start: { unit: "duration-fraction", value: start },
    end: { unit: "duration-fraction", value: end },
    sourceIn: { unit: "duration-fraction", value: start },
    sourceOut: { unit: "duration-fraction", value: end },
  };
}

function preset(
  input: Omit<
    MediaCompositionPreset,
    | "schemaVersion"
    | "ownerId"
    | "createdAt"
    | "updatedAt"
    | "output"
    | "transitions"
    | "audioMix"
    | "targetDefaults"
  > & {
    transitions?: MediaCompositionPreset["transitions"];
  }
): MediaCompositionPreset {
  return MediaCompositionPresetSchema.parse({
    schemaVersion: 1,
    ownerId: "tka-system",
    createdAt: 0,
    updatedAt: 0,
    output: OUTPUT,
    transitions: [],
    audioMix: { masterGain: 1, tracks: [] },
    targetDefaults: {
      instagram: { delivery: "handoff", coverFrameSeconds: 0 },
    },
    ...input,
  });
}

const CARD_ROLE = role(
  POST_STUDIO_ROLE.card,
  "Choreo card",
  "linked-choreo-card",
  ["choreo-card"]
);
// These labels name a slot in the preview and an option in its source chooser,
// so they are the short spoken names — "Animation", not "Sequence animation".
const ANIMATION_ROLE = role(
  POST_STUDIO_ROLE.animation,
  "Animation",
  "linked-sequence-animation",
  ["sequence-animation"]
);
const PERFORMANCE_ROLE = role(
  POST_STUDIO_ROLE.performance,
  "Performance",
  "selected-video",
  ["video"]
);
const TUNNEL_ROLE = role(
  POST_STUDIO_ROLE.tunnel,
  "Tunnel",
  "linked-sequence-derived",
  ["tunnel"]
);
const SCENE_3D_ROLE = role(
  POST_STUDIO_ROLE.scene3d,
  "3D view",
  "linked-sequence-derived",
  ["scene-3d"]
);
const MANDALA_ROLE = role(
  POST_STUDIO_ROLE.mandala,
  "Mandala",
  "linked-sequence-derived",
  ["mandala"]
);
const CAROUSEL_ROLE = role(
  POST_STUDIO_ROLE.carousel,
  "Carousel",
  "linked-sequence-derived",
  ["beat-carousel"]
);

export interface PostStudioSource {
  readonly key: PostStudioRoleKey;
  readonly label: string;
  readonly role: PresetSourceRole;
  readonly renderMode: PostStudioRenderMode;
  /** Whether the source fills its slot or is letterboxed inside it. */
  readonly defaultFit: LayoutRegion["fit"];
  /**
   * A still image has no timeline of its own. The compositor renders one frame
   * and holds it, and the timeline lane draws it as a hold rather than a strip.
   */
  readonly isStill: boolean;
  /**
   * WebGL scenes are expensive enough that two live contexts in one preview is
   * a hardware-tier gamble, so 3D is limited to one slot at a time.
   */
  readonly exclusive: boolean;
  readonly clip: (id: string, regionId: string) => PresetClip;
}

function source(
  key: PostStudioRoleKey,
  presetRole: PresetSourceRole,
  renderMode: PostStudioRenderMode,
  defaultFit: LayoutRegion["fit"],
  options: { isStill?: boolean; exclusive?: boolean } = {}
): PostStudioSource {
  return {
    key,
    label: presetRole.label,
    role: presetRole,
    renderMode,
    defaultFit,
    isStill: options.isStill ?? false,
    exclusive: options.exclusive ?? false,
    clip: (id, regionId) => visualClip(id, key, regionId),
  };
}

/**
 * Every media type a slot can hold. This is the list the empty-slot chooser
 * renders and the only place a new source type has to be declared — the slot
 * verbs in `post-studio-slots.ts` read roles, fit and clip shape from here
 * rather than each carrying their own switch.
 */
export const POST_STUDIO_SOURCES: Readonly<
  Record<PostStudioRoleKey, PostStudioSource>
> = {
  [POST_STUDIO_ROLE.animation]: source(
    POST_STUDIO_ROLE.animation,
    ANIMATION_ROLE,
    "sequence-animation",
    "cover"
  ),
  [POST_STUDIO_ROLE.performance]: source(
    POST_STUDIO_ROLE.performance,
    PERFORMANCE_ROLE,
    "external-media",
    "cover"
  ),
  [POST_STUDIO_ROLE.card]: source(
    POST_STUDIO_ROLE.card,
    CARD_ROLE,
    "choreo-card",
    "contain"
  ),
  [POST_STUDIO_ROLE.tunnel]: source(
    POST_STUDIO_ROLE.tunnel,
    TUNNEL_ROLE,
    "tunnel",
    "cover"
  ),
  [POST_STUDIO_ROLE.scene3d]: source(
    POST_STUDIO_ROLE.scene3d,
    SCENE_3D_ROLE,
    "scene-3d",
    "cover",
    { exclusive: true }
  ),
  [POST_STUDIO_ROLE.mandala]: source(
    POST_STUDIO_ROLE.mandala,
    MANDALA_ROLE,
    "mandala",
    "contain",
    // The mandala is a whole-sequence fingerprint, not a frame at a time:
    // `SequenceMandala` declares a `currentStep` prop and never reads it.
    { isStill: true }
  ),
  [POST_STUDIO_ROLE.carousel]: source(
    POST_STUDIO_ROLE.carousel,
    CAROUSEL_ROLE,
    "painted",
    "contain"
  ),
};

export const POST_STUDIO_SOURCE_ORDER: readonly PostStudioRoleKey[] = [
  POST_STUDIO_ROLE.animation,
  POST_STUDIO_ROLE.performance,
  POST_STUDIO_ROLE.card,
  POST_STUDIO_ROLE.tunnel,
  POST_STUDIO_ROLE.scene3d,
  POST_STUDIO_ROLE.mandala,
  POST_STUDIO_ROLE.carousel,
];

/**
 * Structural arrangements, kept as fixtures rather than as a product feature.
 * Post Studio no longer offers these as a template menu — a post is a top slot
 * and a bottom slot, both picked in the preview, which reaches every pairing
 * including the ones nobody enumerated here. `DEFAULT_POST_LAYOUT` is the one
 * the studio boots into; the rest exist for tests and for reference.
 *
 * They bind by role, never by one sequence's concrete URLs.
 */
export const POST_STUDIO_PRESETS: readonly MediaCompositionPreset[] = [
  preset({
    id: "sequence-breakdown",
    name: "Sequence breakdown",
    description: "Animation above the full choreo card.",
    duration: { mode: "sequence-tempo", bpm: 60 },
    sourceRoles: [ANIMATION_ROLE, CARD_ROLE],
    regions: [
      region(
        "motion",
        "Animation",
        { x: 0, y: 0, width: 1, height: 0.56 },
        "cover"
      ),
      region(
        "card",
        "Choreo card",
        { x: 0, y: 0.56, width: 1, height: 0.44 },
        "contain"
      ),
    ],
    clips: [
      visualClip("animation", POST_STUDIO_ROLE.animation, "motion"),
      visualClip("card", POST_STUDIO_ROLE.card, "card"),
    ],
  }),
  preset({
    id: "performance-breakdown",
    name: "Performance breakdown",
    description: "Performance above the choreo card.",
    duration: {
      mode: "follow-source-role",
      sourceRole: POST_STUDIO_ROLE.performance,
    },
    sourceRoles: [PERFORMANCE_ROLE, ANIMATION_ROLE, CARD_ROLE],
    regions: [
      region(
        "performance",
        "Performance",
        { x: 0, y: 0, width: 1, height: 0.6 },
        "cover"
      ),
      region(
        "card",
        "Choreo card",
        { x: 0, y: 0.6, width: 1, height: 0.4 },
        "contain"
      ),
    ],
    clips: [
      fractionVisualClip(
        "performance",
        POST_STUDIO_ROLE.performance,
        "performance",
        0,
        0.56
      ),
      fractionVisualClip(
        "performance-animation",
        POST_STUDIO_ROLE.animation,
        "performance",
        0.44,
        1
      ),
      visualClip("card", POST_STUDIO_ROLE.card, "card"),
    ],
    transitions: [
      {
        id: "performance-to-animation",
        kind: "crossfade",
        outgoingClipId: "performance",
        incomingClipId: "performance-animation",
        start: { unit: "duration-fraction", value: 0.44 },
        end: { unit: "duration-fraction", value: 0.56 },
        curve: "ease-in-out",
      },
    ],
  }),
  preset({
    id: "motion-focus",
    name: "Motion focus",
    description: "The sequence animation fills the vertical frame.",
    duration: { mode: "sequence-tempo", bpm: 60 },
    sourceRoles: [ANIMATION_ROLE],
    regions: [
      region(
        "motion",
        "Animation",
        { x: 0, y: 0, width: 1, height: 1 },
        "contain"
      ),
    ],
    clips: [visualClip("animation", POST_STUDIO_ROLE.animation, "motion")],
  }),
  preset({
    id: "card-focus",
    name: "Card focus",
    description: "The full choreo card, framed for a Reel.",
    duration: { mode: "fixed", seconds: 5 },
    sourceRoles: [CARD_ROLE],
    regions: [
      region(
        "card",
        "Choreo card",
        { x: 0, y: 0, width: 1, height: 1 },
        "contain"
      ),
    ],
    clips: [visualClip("card", POST_STUDIO_ROLE.card, "card")],
  }),
];

/** Animation over the choreo card — where every post starts before editing. */
export const DEFAULT_POST_LAYOUT: MediaCompositionPreset =
  POST_STUDIO_PRESETS.find((entry) => entry.id === "sequence-breakdown") ??
  POST_STUDIO_PRESETS[0]!;

/**
 * The breakdown strip's geometry, in output fractions of a 1080x1920 post:
 * the performance keeps the top 1420px and a 500px strip below it holds the
 * animation square and the carousel. Widths and heights are written as
 * `1 - x` so their sums land on exactly 1, which the region schema checks.
 */
export const BREAKDOWN_GEOMETRY = {
  stripTop: 1420 / 1920,
  stripHeight: 1 - 1420 / 1920,
  animationWidth: 500 / 1080,
  carouselWidth: 1 - 500 / 1080,
  /** Seconds the strip takes to slide in, and again to slide out. */
  transitionSeconds: 0.8,
} as const;

export const BREAKDOWN_MARKER = {
  start: "breakdown-start",
  end: "breakdown-end",
} as const;

export const BREAKDOWN_REGION = {
  performance: "performance",
  animation: "strip-animation",
  carousel: "strip-carousel",
} as const;

type BreakdownRect = { x: number; y: number; width: number; height: number };

/**
 * Keyframes that hold `outside` until the section starts, travel to `inside`
 * over the transition, hold it, and travel back out as the section ends. Every
 * time follows a marker, so moving a marker moves its slide with it.
 */
export function breakdownKeyframes(
  outside: BreakdownRect,
  inside: BreakdownRect
): NonNullable<MediaCompositionPreset["regionMotion"]>[number]["keyframes"] {
  const at = (markerId: string, offsetSeconds: number) => ({
    unit: "marker" as const,
    markerId,
    offsetSeconds,
  });
  const { transitionSeconds } = BREAKDOWN_GEOMETRY;
  return [
    { at: at(BREAKDOWN_MARKER.start, 0), rect: outside, curve: "linear" },
    {
      at: at(BREAKDOWN_MARKER.start, transitionSeconds),
      rect: inside,
      curve: "ease-in-out",
    },
    {
      at: at(BREAKDOWN_MARKER.end, -transitionSeconds),
      rect: inside,
      curve: "linear",
    },
    { at: at(BREAKDOWN_MARKER.end, 0), rect: outside, curve: "ease-in-out" },
  ];
}

export const BREAKDOWN_PERFORMANCE_INSIDE: BreakdownRect = {
  x: 0,
  y: 0,
  width: 1,
  height: BREAKDOWN_GEOMETRY.stripTop,
};
export const FULL_FRAME: BreakdownRect = { x: 0, y: 0, width: 1, height: 1 };

const ANIMATION_INSIDE: BreakdownRect = {
  x: 0,
  y: BREAKDOWN_GEOMETRY.stripTop,
  width: BREAKDOWN_GEOMETRY.animationWidth,
  height: BREAKDOWN_GEOMETRY.stripHeight,
};
const CAROUSEL_INSIDE: BreakdownRect = {
  x: BREAKDOWN_GEOMETRY.animationWidth,
  y: BREAKDOWN_GEOMETRY.stripTop,
  width: BREAKDOWN_GEOMETRY.carouselWidth,
  height: BREAKDOWN_GEOMETRY.stripHeight,
};
/** Below the bottom edge: the strip waits there, drawn nowhere. */
const belowFrame = (rect: BreakdownRect): BreakdownRect => ({ ...rect, y: 1 });

/**
 * The performance runs full frame; between the two breakdown markers it lifts
 * to make room for a strip carrying the animation and a carousel of the
 * upcoming beats, all three reading one clock. The strip clips follow the
 * markers, so their fades and the region slide move together when edited.
 *
 * Free layout: the slot verbs cannot express a region that moves.
 */
export const BREAKDOWN_POST_LAYOUT: MediaCompositionPreset = preset({
  id: "performance-breakdown-strip",
  name: "Breakdown",
  description:
    "Performance full frame, lifting for a breakdown strip between two markers.",
  layoutModel: "free",
  duration: {
    mode: "follow-source-role",
    sourceRole: POST_STUDIO_ROLE.performance,
  },
  sourceRoles: [PERFORMANCE_ROLE, ANIMATION_ROLE, CAROUSEL_ROLE],
  markers: [
    {
      id: BREAKDOWN_MARKER.start,
      label: "Breakdown start",
      time: { unit: "duration-fraction", value: 0.25 },
    },
    {
      id: BREAKDOWN_MARKER.end,
      label: "Breakdown end",
      time: { unit: "duration-fraction", value: 0.9 },
    },
  ],
  regions: [
    region(
      BREAKDOWN_REGION.performance,
      "Performance",
      BREAKDOWN_PERFORMANCE_INSIDE,
      "contain"
    ),
    {
      ...region(
        BREAKDOWN_REGION.animation,
        "Animation",
        ANIMATION_INSIDE,
        "contain"
      ),
      zIndex: 1,
    },
    {
      ...region(
        BREAKDOWN_REGION.carousel,
        "Carousel",
        CAROUSEL_INSIDE,
        "contain"
      ),
      zIndex: 1,
    },
  ],
  regionMotion: [
    {
      regionId: BREAKDOWN_REGION.performance,
      keyframes: breakdownKeyframes(FULL_FRAME, BREAKDOWN_PERFORMANCE_INSIDE),
    },
    {
      regionId: BREAKDOWN_REGION.animation,
      keyframes: breakdownKeyframes(
        belowFrame(ANIMATION_INSIDE),
        ANIMATION_INSIDE
      ),
    },
    {
      regionId: BREAKDOWN_REGION.carousel,
      keyframes: breakdownKeyframes(
        belowFrame(CAROUSEL_INSIDE),
        CAROUSEL_INSIDE
      ),
    },
  ],
  clips: [
    visualClip(
      BREAKDOWN_REGION.performance,
      POST_STUDIO_ROLE.performance,
      BREAKDOWN_REGION.performance
    ),
    breakdownStripClip(
      BREAKDOWN_REGION.animation,
      POST_STUDIO_ROLE.animation,
      BREAKDOWN_REGION.animation
    ),
    breakdownStripClip(
      BREAKDOWN_REGION.carousel,
      POST_STUDIO_ROLE.carousel,
      BREAKDOWN_REGION.carousel
    ),
  ],
});

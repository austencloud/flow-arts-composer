import { z } from "zod";
import { PostTakeSchema } from "$lib/shared/media-composition/domain/post-plan";
import { BREAKDOWN_GEOMETRY } from "$lib/shared/media-composition/domain/post-studio-presets";

/**
 * A post as Austen edits it on the timeline: tracks of items, InShot style.
 *
 * `tracks[0]` is the main track. Its clips sit end to end, so trimming or
 * removing one closes the gap. Every later track is an overlay track drawn
 * above the ones before it; its items keep their own times and follow the
 * main clip they are anchored to. `normalizeProject` in
 * `post-project-normalize.ts` owns those rules; every edit ends there.
 *
 * The compiler turns a project into the free-layout preset the evaluator,
 * the preview and the export already play.
 */

const IdSchema = z.string().trim().min(1);
const SecondsSchema = z.number().finite().nonnegative();

export const POST_PROJECT_SCHEMA_VERSION = 2;

export const POST_MIN_SPEED = 0.25;
export const POST_MAX_SPEED = 4;
export const POST_MIN_ZOOM = 0.5;
export const POST_MAX_ZOOM = 4;
export const POST_MAX_VOLUME = 2;
/** Shorter than this, a piece is too small to see or to grab. */
export const POST_MIN_ITEM_SECONDS = 0.1;
/** A box smaller than this, as a share of the frame, cannot be grabbed. */
export const POST_MIN_BOX_SIZE = 0.05;
export const POST_MAX_TEXT_LENGTH = 140;
export const POST_MAX_LABEL_LENGTH = 60;
export const POST_DEFAULT_CARD_SECONDS = 5;
export const POST_DEFAULT_OVERLAY_SECONDS = 3;
/** The export's frame rate; nudges step by one of its frames. */
export const POST_FRAME_RATE = 30;
/** Times closer than this are the same time. */
export const POST_TIME_EPSILON = 1e-6;
/** Keyframes this close in post seconds are the same moment, and merge. */
export const POST_KEYFRAME_MERGE_SECONDS = 1 / (2 * POST_FRAME_RATE);
/** A bezier control point's x, like CSS, must stay inside the unit interval. */
export const POST_EASING_X_MIN = 0;
export const POST_EASING_X_MAX = 1;
/** A bezier control point's y may over- or undershoot, for a spring feel. */
export const POST_EASING_Y_MIN = -1;
export const POST_EASING_Y_MAX = 2;

export const MAIN_TRACK_INDEX = 0;

/** Where an item sits in the frame, as shares of its width and height. */
export const PostBoxSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().min(POST_MIN_BOX_SIZE).max(1),
    height: z.number().finite().min(POST_MIN_BOX_SIZE).max(1),
  })
  .strict()
  .refine((box) => box.x + box.width <= 1 + POST_TIME_EPSILON, {
    message: "A box must stay inside the frame",
    path: ["width"],
  })
  .refine((box) => box.y + box.height <= 1 + POST_TIME_EPSILON, {
    message: "A box must stay inside the frame",
    path: ["height"],
  });

export type PostBox = z.infer<typeof PostBoxSchema>;

/**
 * The main clip an overlay follows. Its start is the clip's start plus the
 * offset, so moving or retiming the clip carries the overlay with it.
 */
export const PostAnchorSchema = z
  .object({
    itemId: IdSchema,
    offset: z.number().finite(),
  })
  .strict();

export type PostAnchor = z.infer<typeof PostAnchorSchema>;

// ---------------------------------------------------------------------------
// Keyframes
// ---------------------------------------------------------------------------

const easingXSchema = z.number().finite().min(POST_EASING_X_MIN).max(POST_EASING_X_MAX);
const easingYSchema = z.number().finite().min(POST_EASING_Y_MIN).max(POST_EASING_Y_MAX);

/** A CSS `cubic-bezier(x1, y1, x2, y2)`, or a hold until the next keyframe. */
export const PostEasingSchema = z.union([
  z.literal("hold"),
  z.tuple([easingXSchema, easingYSchema, easingXSchema, easingYSchema]),
]);

export type PostEasing = z.infer<typeof PostEasingSchema>;

/** Zoom, pan and turn together, as one keyframed picture framing. */
export const PostFramingSchema = z
  .object({
    zoom: z.number().finite().min(POST_MIN_ZOOM).max(POST_MAX_ZOOM),
    panX: z.number().finite().min(-0.5).max(0.5),
    panY: z.number().finite().min(-0.5).max(0.5),
    rotation: z.number().finite().min(-180).max(180),
  })
  .strict();

export type PostFraming = z.infer<typeof PostFramingSchema>;

function postKeyframeSchema<V extends z.ZodTypeAny>(value: V) {
  return z
    .object({
      /** Content time: see `post-project-keyframes.ts` for the two clocks. */
      t: z.number().finite(),
      value,
      /** How the value travels to the next keyframe. */
      easing: PostEasingSchema,
    })
    .strict();
}

export type PostKeyframe<V> = { t: number; value: V; easing: PostEasing };

/** Channels an item's `keyframes` may animate; `framing` is video only. */
export type PostKeyframeChannel = "framing" | "box" | "opacity";

const PostKeyframeBoxSchema = postKeyframeSchema(PostBoxSchema);
const PostKeyframeOpacitySchema = postKeyframeSchema(
  z.number().finite().min(0).max(1)
);
const PostKeyframeFramingSchema = postKeyframeSchema(PostFramingSchema);

/** Every kind: where it sits, and how it fades in and out over its fades. */
const PostItemKeyframesSchema = z
  .object({
    box: z.array(PostKeyframeBoxSchema).optional(),
    opacity: z.array(PostKeyframeOpacitySchema).optional(),
  })
  .strict();

/** Video only: also its zoom, pan and turn. */
const PostVideoItemKeyframesSchema = z
  .object({
    framing: z.array(PostKeyframeFramingSchema).optional(),
    box: z.array(PostKeyframeBoxSchema).optional(),
    opacity: z.array(PostKeyframeOpacitySchema).optional(),
  })
  .strict();

export interface PostItemKeyframes {
  framing?: PostKeyframe<PostFraming>[];
  box?: PostKeyframe<PostBox>[];
  opacity?: PostKeyframe<number>[];
}

/**
 * Effects that can follow a take's lit staff ends: trails, plus every effect
 * the shared canvas 2D host draws (`CANVAS2D_HOSTED_EFFECTS`). A test keeps
 * the two lists in step; the host is not imported here, since it pulls in
 * every renderer.
 */
export const POST_STAFF_EFFECTS = [
  "trails",
  "sparkles",
  "smoke",
  "zap",
  "bloom",
  "silk",
  "bubbles",
  "petals",
  "ink",
  "goo",
  "pulse",
  "animal",
] as const;

export type PostStaffEffectId = (typeof POST_STAFF_EFFECTS)[number];

/** What a clip draws on the lit ends of its take's staffs. */
export const PostStaffEffectSchema = z
  .object({
    effect: z.enum(POST_STAFF_EFFECTS),
  })
  .strict();

export type PostStaffEffect = z.infer<typeof PostStaffEffectSchema>;

/** The shapes a post can be, width by height; 9:16 when a project names none. */
export const POST_CANVAS_RATIOS = ["9:16", "4:5", "1:1", "16:9", "3:4", "4:3"] as const;
export type PostCanvasRatio = (typeof POST_CANVAS_RATIOS)[number];
export const POST_DEFAULT_CANVAS: PostCanvasRatio = "9:16";

/**
 * What fills the frame where no item covers it: the dark colour, or the main
 * clip playing, filling the frame and blurred, as phone editors offer.
 */
export const POST_BACKGROUNDS = ["dark", "blur"] as const;
export type PostBackground = (typeof POST_BACKGROUNDS)[number];
export const POST_DEFAULT_BACKGROUND: PostBackground = "dark";

/**
 * A clip's own shape inside its spot. `original` is the footage's shape and
 * `free` one dragged by hand; either way `ratio` holds the width over height
 * it was given, in output pixels.
 */
export const POST_CLIP_SHAPES = ["original", "free", ...POST_CANVAS_RATIOS] as const;
export type PostClipShapeKind = (typeof POST_CLIP_SHAPES)[number];
export const POST_SHAPE_RATIO_MIN = 0.25;
export const POST_SHAPE_RATIO_MAX = 4;

export const PostClipShapeSchema = z
  .object({
    kind: z.enum(POST_CLIP_SHAPES),
    ratio: z.number().finite().min(POST_SHAPE_RATIO_MIN).max(POST_SHAPE_RATIO_MAX),
  })
  .strict();

export type PostClipShape = z.infer<typeof PostClipShapeSchema>;

/** The colours a clip's border comes in. */
export const POST_EDGE_COLORS = [
  "white",
  "black",
  "red",
  "orange",
  "gold",
  "blue",
  "violet",
] as const;
export type PostEdgeColor = (typeof POST_EDGE_COLORS)[number];
/** A border this wide, as a share of the post's shorter side, is the widest. */
export const POST_MAX_EDGE_BORDER = 0.03;
/** A corner this round, as a share of the picture's shorter side, is a full curve. */
export const POST_MAX_EDGE_CORNERS = 0.5;

/**
 * A clip's edges, as editors dress picture-in-picture: rounded corners, a
 * border inside them and a drop shadow under the picture.
 */
export const PostClipEdgeSchema = z
  .object({
    /** Corner radius, as a share of the drawn picture's shorter side. */
    corners: z.number().finite().min(0).max(POST_MAX_EDGE_CORNERS),
    /** Border width, as a share of the post's shorter side. */
    border: z.number().finite().min(0).max(POST_MAX_EDGE_BORDER),
    borderColor: z.enum(POST_EDGE_COLORS),
    /** Drop shadow strength: 0 is none, 1 the darkest. */
    shadow: z.number().finite().min(0).max(1),
  })
  .strict();

export type PostClipEdge = z.infer<typeof PostClipEdgeSchema>;

/** Plain square edges: what a clip without `edge` shows. */
export const POST_PLAIN_EDGE: PostClipEdge = {
  corners: 0,
  border: 0,
  borderColor: "white",
  shadow: 0,
};

const itemBase = {
  id: IdSchema,
  /** Austen's own name for it; the kind's name shows when absent. */
  label: z.string().trim().max(POST_MAX_LABEL_LENGTH).optional(),
  /** Post seconds. Derived on the main track and for anchored overlays. */
  start: SecondsSchema,
  /** Post seconds. Derived for video, from its source span and speed. */
  duration: z.number().finite().positive(),
  box: PostBoxSchema,
  opacity: z.number().finite().min(0).max(1),
  fadeIn: SecondsSchema,
  fadeOut: SecondsSchema,
  /** Overlays only; always null on the main track. */
  anchor: PostAnchorSchema.nullable(),
  /** Overlays only: span exactly the anchored main clip. */
  fill: z.boolean(),
  /** Optional animation on this item's box and opacity. */
  keyframes: PostItemKeyframesSchema.optional(),
};

export const PostVideoItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("video"),
    /** Overrides the base: video also keyframes its framing. */
    keyframes: PostVideoItemKeyframesSchema.optional(),
    takeId: IdSchema,
    /** Take media seconds. */
    sourceIn: SecondsSchema,
    /** Take media seconds. */
    sourceOut: z.number().finite().positive(),
    speed: z.number().finite().min(POST_MIN_SPEED).max(POST_MAX_SPEED),
    /** cover crops to fill the box; contain shows the whole picture. */
    fit: z.enum(["cover", "contain"]),
    /**
     * The clip's own shape, the largest of it centred in the box. Without
     * one the clip fills the box.
     */
    shape: PostClipShapeSchema.optional(),
    /** Rounded corners, a border and a shadow; square and bare when absent. */
    edge: PostClipEdgeSchema.optional(),
    /** Scales the picture about the box's centre. */
    zoom: z.number().finite().min(POST_MIN_ZOOM).max(POST_MAX_ZOOM),
    /**
     * Moves the picture across whatever overflows the box: ±0.5 reaches
     * either edge, and with nothing overflowing it has no effect.
     */
    panX: z.number().finite().min(-0.5).max(0.5),
    panY: z.number().finite().min(-0.5).max(0.5),
    rotation: z.number().finite().min(-180).max(180),
    /** Mirrors the footage; notation is never flipped with it. */
    flip: z.boolean(),
    /** 1 is the take as recorded; 0 is silent. */
    volume: z.number().finite().min(0).max(POST_MAX_VOLUME),
    /**
     * An effect drawn on the take's lit staff ends, from the staff track
     * saved with the take. Nothing draws until the take has one.
     */
    staffEffect: PostStaffEffectSchema.optional(),
  })
  .strict()
  .refine((item) => item.sourceOut > item.sourceIn, {
    message: "A clip must end after it starts",
    path: ["sourceOut"],
  });

export type PostVideoItem = z.infer<typeof PostVideoItemSchema>;

export const PostCardItemSchema = z
  .object({ ...itemBase, kind: z.literal("card") })
  .strict();

export type PostCardItem = z.infer<typeof PostCardItemSchema>;

/** The sequence animation: the dual view's lower panel. */
export const PostAnimationItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("animation"),
    /** Paint the beat number, letter and progress over it. */
    overlay: z.boolean(),
  })
  .strict();

export type PostAnimationItem = z.infer<typeof PostAnimationItemSchema>;

export const PostMovesModeSchema = z.enum(["arrows", "mandala", "alternate"]);
export type PostMovesMode = z.infer<typeof PostMovesModeSchema>;

/** The picture-in-picture square: arrows, the mandala, or both in turn. */
export const PostMovesItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("moves"),
    mode: PostMovesModeSchema,
  })
  .strict();

export type PostMovesItem = z.infer<typeof PostMovesItemSchema>;

/** The row of upcoming moves. */
export const PostCarouselItemSchema = z
  .object({ ...itemBase, kind: z.literal("carousel") })
  .strict();

export type PostCarouselItem = z.infer<typeof PostCarouselItemSchema>;

export const PostTextSizeSchema = z.enum(["s", "m", "l"]);
export type PostTextSize = z.infer<typeof PostTextSizeSchema>;

export const PostTextItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("text"),
    text: z.string().max(POST_MAX_TEXT_LENGTH),
    size: PostTextSizeSchema,
  })
  .strict();

export type PostTextItem = z.infer<typeof PostTextItemSchema>;

export const PostItemSchema = z.discriminatedUnion("kind", [
  PostVideoItemSchema,
  PostCardItemSchema,
  PostAnimationItemSchema,
  PostMovesItemSchema,
  PostCarouselItemSchema,
  PostTextItemSchema,
]);

export type PostItem = z.infer<typeof PostItemSchema>;
export type PostItemKind = PostItem["kind"];

/** Kinds the main track holds; anything else lives on an overlay track. */
export const MAIN_TRACK_KINDS: readonly PostItemKind[] = ["video", "card"];

/** Kinds drawn from the sequence, which read the move of the footage under them. */
export const SEQUENCE_ITEM_KINDS: readonly PostItemKind[] = [
  "animation",
  "moves",
  "carousel",
];

export const PostTrackSchema = z
  .object({
    id: IdSchema,
    /** Left out of the preview and the export. */
    hidden: z.boolean(),
    /** Its items cannot be moved, trimmed or removed. */
    locked: z.boolean(),
    items: z.array(PostItemSchema),
  })
  .strict();

export type PostTrack = z.infer<typeof PostTrackSchema>;

export const PostProjectSchema = z
  .object({
    schemaVersion: z.literal(POST_PROJECT_SCHEMA_VERSION),
    sequenceId: IdSchema,
    takes: z.array(PostTakeSchema),
    tracks: z.array(PostTrackSchema).min(1),
    /**
     * - takes: each clip carries its take's sound at its own volume.
     * - silent: no sound, for music added in the app it is posted from.
     */
    audio: z.enum(["takes", "silent"]),
    /** The post's shape, and so the export's size; 9:16 when absent. */
    canvas: z.enum(POST_CANVAS_RATIOS).optional(),
    /** What fills the frame where no item covers it; dark when absent. */
    background: z.enum(POST_BACKGROUNDS).optional(),
    updatedAt: z.number().finite().int().nonnegative(),
  })
  .strict()
  .superRefine((project, context) => {
    const unique = (
      ids: readonly string[],
      path: (index: number) => (string | number)[],
      message: string
    ) => {
      const seen = new Set<string>();
      ids.forEach((id, index) => {
        if (seen.has(id)) {
          context.addIssue({ code: "custom", path: path(index), message });
        }
        seen.add(id);
      });
    };
    unique(
      project.takes.map((take) => take.id),
      (index) => ["takes", index, "id"],
      "Duplicate take id"
    );
    unique(
      project.tracks.map((track) => track.id),
      (index) => ["tracks", index, "id"],
      "Duplicate track id"
    );
    const itemIds = project.tracks.flatMap((track, trackIndex) =>
      track.items.map((item, itemIndex) => ({
        id: item.id,
        path: ["tracks", trackIndex, "items", itemIndex, "id"],
      }))
    );
    unique(
      itemIds.map((entry) => entry.id),
      (index) => itemIds[index]!.path,
      "Duplicate item id"
    );
  });

export type PostProject = z.infer<typeof PostProjectSchema>;

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

/** Named places in the frame the looks and the Add menu use. */
export const POST_BOX = {
  full: { x: 0, y: 0, width: 1, height: 1 },
  /** The dual view: the take above... */
  top: { x: 0, y: 0, width: 1, height: 0.5 },
  /** ...and the animation below, a 1080 × 960 panel. */
  bottom: { x: 0, y: 0.5, width: 1, height: 0.5 },
  /** The breakdown strip's square, bottom left. */
  stripSquare: {
    x: 0,
    y: BREAKDOWN_GEOMETRY.stripTop,
    width: BREAKDOWN_GEOMETRY.animationWidth,
    height: BREAKDOWN_GEOMETRY.stripHeight,
  },
  /** The strip's carousel, beside the square. */
  stripCarousel: {
    x: BREAKDOWN_GEOMETRY.animationWidth,
    y: BREAKDOWN_GEOMETRY.stripTop,
    width: BREAKDOWN_GEOMETRY.carouselWidth,
    height: BREAKDOWN_GEOMETRY.stripHeight,
  },
  /** The whole strip, for a square or a carousel on its own. */
  stripWide: {
    x: 0,
    y: BREAKDOWN_GEOMETRY.stripTop,
    width: 1,
    height: BREAKDOWN_GEOMETRY.stripHeight,
  },
  /** The frame above the strip, so the footage is not covered. */
  aboveStrip: {
    x: 0,
    y: 0,
    width: 1,
    height: BREAKDOWN_GEOMETRY.stripTop,
  },
} as const satisfies Record<string, PostBox>;

export type PostTextPlacement = "top" | "middle" | "bottom";

/** A text box is 86% of the frame wide, like a caption, and two lines tall. */
export const TEXT_BOX_WIDTH = 0.86;
export const TEXT_BOX_HEIGHT = 0.14;
/**
 * Where a text box's centre sits for each quick placement: top and bottom
 * stay clear of a phone's status bar and Instagram's controls, and bottom
 * clears the strip.
 */
export const TEXT_PLACEMENT_CENTER: Record<PostTextPlacement, number> = {
  top: 0.12,
  middle: 0.5,
  bottom: 0.82,
};

export function textBox(placement: PostTextPlacement): PostBox {
  return {
    x: (1 - TEXT_BOX_WIDTH) / 2,
    y: TEXT_PLACEMENT_CENTER[placement] - TEXT_BOX_HEIGHT / 2,
    width: TEXT_BOX_WIDTH,
    height: TEXT_BOX_HEIGHT,
  };
}

/** Where an item added from the Add menu first appears. */
export function defaultBoxFor(kind: PostItemKind): PostBox {
  switch (kind) {
    case "video":
    case "card":
      return { ...POST_BOX.full };
    case "animation":
      return { ...POST_BOX.bottom };
    case "moves":
      return { ...POST_BOX.stripSquare };
    case "carousel":
      return { ...POST_BOX.stripCarousel };
    case "text":
      return textBox("top");
  }
}

/**
 * A box moved or resized into the frame: at least the minimum size, no
 * larger than the frame, and shifted back inside rather than cut.
 */
export function clampBox(box: PostBox): PostBox {
  const width = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.width));
  const height = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.height));
  return {
    x: Math.min(1 - width, Math.max(0, box.x)),
    y: Math.min(1 - height, Math.max(0, box.y)),
    width,
    height,
  };
}

/** Degrees folded into [-180, 180]; values already inside are kept. */
export function wrapDegrees(value: number): number {
  if (value >= -180 && value <= 180) return value;
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

/**
 * The turn from one angle to another the short way round, in degrees
 * (-180 to 180), so a blend from -180 to 175 turns 5 degrees, not 355.
 */
export function shortestTurn(from: number, to: number): number {
  return wrapDegrees(to - from);
}

/** A framing moved or turned back into its bounds, rotation wrapped. */
export function clampFraming(framing: PostFraming): PostFraming {
  return {
    zoom: Math.min(POST_MAX_ZOOM, Math.max(POST_MIN_ZOOM, framing.zoom)),
    panX: Math.min(0.5, Math.max(-0.5, framing.panX)),
    panY: Math.min(0.5, Math.max(-0.5, framing.panY)),
    rotation: wrapDegrees(framing.rotation),
  };
}

// ---------------------------------------------------------------------------
// Reading a project
// ---------------------------------------------------------------------------

export function itemEnd(item: Pick<PostItem, "start" | "duration">): number {
  return item.start + item.duration;
}

/** How long a clip plays in the post: its source span at its speed. */
export function videoPostSeconds(
  item: Pick<PostVideoItem, "sourceIn" | "sourceOut" | "speed">
): number {
  return (item.sourceOut - item.sourceIn) / item.speed;
}

export interface LocatedItem {
  item: PostItem;
  trackIndex: number;
  itemIndex: number;
}

export function findItem(
  project: PostProject,
  itemId: string
): LocatedItem | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const items = project.tracks[trackIndex]!.items;
    const itemIndex = items.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      return { item: items[itemIndex]!, trackIndex, itemIndex };
    }
  }
  return null;
}

export function mainItems(project: PostProject): readonly PostItem[] {
  return project.tracks[MAIN_TRACK_INDEX]?.items ?? [];
}

/** The main clip playing at a post time; the later one at a shared edge. */
export function mainItemAt(
  project: PostProject,
  seconds: number
): PostItem | null {
  for (const item of mainItems(project)) {
    if (
      seconds >= item.start - POST_TIME_EPSILON &&
      seconds < itemEnd(item) - POST_TIME_EPSILON
    ) {
      return item;
    }
  }
  return null;
}

/** The overlays that follow a main clip, on every track. */
export function overlaysAnchoredTo(
  project: PostProject,
  mainItemId: string
): LocatedItem[] {
  const found: LocatedItem[] = [];
  project.tracks.forEach((track, trackIndex) => {
    if (trackIndex === MAIN_TRACK_INDEX) return;
    track.items.forEach((item, itemIndex) => {
      if (item.anchor?.itemId === mainItemId) {
        found.push({ item, trackIndex, itemIndex });
      }
    });
  });
  return found;
}

export function projectDurationSeconds(project: PostProject): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const item of track.items) end = Math.max(end, itemEnd(item));
  }
  return end;
}

/**
 * True when [start, end) is free on a track, ignoring the item being moved.
 * Items that only touch at an edge do not overlap.
 */
export function trackHasRoom(
  track: PostTrack,
  start: number,
  end: number,
  exceptItemId?: string
): boolean {
  return track.items.every(
    (item) =>
      item.id === exceptItemId ||
      end <= item.start + POST_TIME_EPSILON ||
      start >= itemEnd(item) - POST_TIME_EPSILON
  );
}

/**
 * Hands out ids no item or track in the project uses yet: `video-1`,
 * `text-3`, `track-2`. Deterministic, so edits stay pure and testable.
 */
export function createIdAllocator(
  project: PostProject
): (prefix: string) => string {
  const used = new Set<string>([
    ...project.tracks.map((track) => track.id),
    ...project.tracks.flatMap((track) => track.items.map((item) => item.id)),
  ]);
  return (prefix) => {
    let n = 1;
    while (used.has(`${prefix}-${n}`)) n += 1;
    const id = `${prefix}-${n}`;
    used.add(id);
    return id;
  };
}

export const MAIN_TRACK_ID = "main";

export function createEmptyPostProject(input: {
  sequenceId: string;
  now: number;
}): PostProject {
  return {
    schemaVersion: POST_PROJECT_SCHEMA_VERSION,
    sequenceId: input.sequenceId,
    takes: [],
    tracks: [{ id: MAIN_TRACK_ID, hidden: false, locked: false, items: [] }],
    audio: "takes",
    updatedAt: input.now,
  };
}

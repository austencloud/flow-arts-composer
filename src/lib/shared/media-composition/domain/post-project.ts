import { z } from "zod";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { PROP_LOOKS } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import {
  PostTakeRefSchema,
  PostTakeSchema,
} from "#lib/shared/media-composition/domain/post-plan.js";
import { BREAKDOWN_GEOMETRY } from "#lib/shared/media-composition/domain/post-studio-presets.js";
import { TakeTimingSchema } from "#lib/shared/media-composition/domain/take-timing.js";
import { TunnelHookSchema } from "#lib/shared/media-composition/domain/tunnel-hook.js";
import { PostMusicSchema } from "#lib/shared/media-composition/domain/post-music.js";
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import {
  TrackingMode,
  TrailEffect,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

/**
 * A post as Austen edits it on the timeline: tracks of items, InShot style.
 *
 * `tracks[0]` is the main track. Clips normally follow one another, but a
 * dragged clip keeps its chosen start and can leave a gap. Every later track is drawn
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
/** Longest "how to say it" line a titles clip takes. */
export const POST_MAX_SPOKEN_LENGTH = 60;
export const POST_DEFAULT_CARD_SECONDS = 5;
/** Longest scan link a card keeps. */
export const POST_MAX_QR_URL_LENGTH = 200;
export const POST_QR_URL_RULE = `A card's link must be an https address with no spaces, at most ${POST_MAX_QR_URL_LENGTH} characters.`;
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

/**
 * Where an item sits in the frame, as shares of its width and height, and
 * how far the whole item is turned about the box's centre: degrees
 * clockwise, left out when it sits straight. The unturned box stays inside
 * the frame; turned, its corners may run past the edge.
 */
export const PostBoxSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().min(POST_MIN_BOX_SIZE).max(1),
    height: z.number().finite().min(POST_MIN_BOX_SIZE).max(1),
    turn: z.number().finite().min(-180).max(180).optional(),
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

const easingXSchema = z
  .number()
  .finite()
  .min(POST_EASING_X_MIN)
  .max(POST_EASING_X_MAX);
const easingYSchema = z
  .number()
  .finite()
  .min(POST_EASING_Y_MIN)
  .max(POST_EASING_Y_MAX);

/** A CSS `cubic-bezier(x1, y1, x2, y2)`, or a hold until the next keyframe. */
export const PostEasingSchema = z.union([
  z.literal("hold"),
  z.tuple([easingXSchema, easingYSchema, easingXSchema, easingYSchema]),
  z
    .object({
      kind: z.literal("sampled-bezier"),
      curve: z.tuple([
        easingXSchema,
        easingYSchema,
        easingXSchema,
        easingYSchema,
      ]),
      samples: z.literal(300),
    })
    .strict(),
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
      /**
       * Written by the opening tunnel or the picture-in-picture hand-off, and
       * kept in step with them until edited; an edit makes the key the
       * author's own (see `post-project-motion-keys.ts`).
       */
      auto: PostMotionKeySchema.optional(),
    })
    .strict();
}

/** Which automatic move wrote a keyframe. */
export const PostMotionKeySchema = z.enum(["tunnel", "handoff"]);
export type PostMotionKey = z.infer<typeof PostMotionKeySchema>;

export type PostKeyframe<V> = {
  t: number;
  value: V;
  easing: PostEasing;
  auto?: PostMotionKey;
};

/** Channels an item's `keyframes` may animate; `framing` is video only. */
export type PostKeyframeChannel =
  | "framing"
  | "sourceGeometry"
  | "box"
  | "opacity";

/** The drawn media rectangle may pass outside the canvas. Crop coordinates are source UVs. */
export const PostSourceGeometrySchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    rotation: z.number().finite(),
    crop: z
      .object({
        left: z.number().finite().min(0).max(1),
        top: z.number().finite().min(0).max(1),
        right: z.number().finite().min(0).max(1),
        bottom: z.number().finite().min(0).max(1),
      })
      .strict()
      .refine((crop) => crop.right > crop.left && crop.bottom > crop.top),
  })
  .strict();
export type PostSourceGeometry = z.infer<typeof PostSourceGeometrySchema>;

export const PostAutoAdjustSchema = z
  .object({
    enabled: z.boolean(),
    strength: z.number().finite().min(0).max(1),
    startSeconds: SecondsSchema.optional(),
    endSeconds: SecondsSchema.optional(),
  })
  .strict();
export type PostAutoAdjust = z.infer<typeof PostAutoAdjustSchema>;

export const PostTransitionOutSchema = z
  .object({
    duration: SecondsSchema,
    type: z.enum(["crossfade", "fade-black"]),
    sourceTypeCode: z.string().optional(),
    incomingId: z.string().optional(),
    editorAddedSeconds: SecondsSchema.optional(),
  })
  .strict();
export type PostTransitionOut = z.infer<typeof PostTransitionOutSchema>;

const PostKeyframeBoxSchema = postKeyframeSchema(PostBoxSchema);
const PostKeyframeOpacitySchema = postKeyframeSchema(
  z.number().finite().min(0).max(1)
);
const PostKeyframeFramingSchema = postKeyframeSchema(PostFramingSchema);
const PostKeyframeSourceGeometrySchema = postKeyframeSchema(
  PostSourceGeometrySchema
);

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
    sourceGeometry: z.array(PostKeyframeSourceGeometrySchema).optional(),
    box: z.array(PostKeyframeBoxSchema).optional(),
    opacity: z.array(PostKeyframeOpacitySchema).optional(),
  })
  .strict();

export interface PostItemKeyframes {
  framing?: PostKeyframe<PostFraming>[];
  sourceGeometry?: PostKeyframe<PostSourceGeometry>[];
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
export const POST_CANVAS_RATIOS = [
  "9:16",
  "4:5",
  "1:1",
  "16:9",
  "3:4",
  "4:3",
] as const;
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
 * Whole-sequence changes a post makes to its notation, in press order. See
 * `post-sequence-actions.ts`.
 */
export const POST_SEQUENCE_ACTIONS = [
  "mirror",
  "flip",
  "rotate-left",
  "rotate-right",
  "swap",
] as const;
export type PostSequenceAction = (typeof POST_SEQUENCE_ACTIONS)[number];
export const POST_MAX_SEQUENCE_ACTIONS = 64;

/**
 * A clip's own shape inside its spot. `original` is the footage's shape and
 * `free` one dragged by hand; either way `ratio` holds the width over height
 * it was given, in output pixels.
 */
export const POST_CLIP_SHAPES = [
  "original",
  "free",
  ...POST_CANVAS_RATIOS,
] as const;
export type PostClipShapeKind = (typeof POST_CLIP_SHAPES)[number];
export const POST_SHAPE_RATIO_MIN = 0.25;
export const POST_SHAPE_RATIO_MAX = 4;

export const PostClipShapeSchema = z
  .object({
    kind: z.enum(POST_CLIP_SHAPES),
    ratio: z
      .number()
      .finite()
      .min(POST_SHAPE_RATIO_MIN)
      .max(POST_SHAPE_RATIO_MAX),
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
  /** Post seconds. Derived on the main track unless pinnedStart is true. */
  start: SecondsSchema,
  /** A main clip placed by hand keeps its timeline time through normalization. */
  pinnedStart: z.boolean().optional(),
  /** Post seconds. Derived for video, from its source span and speed. */
  duration: z.number().finite().positive(),
  box: PostBoxSchema,
  opacity: z.number().finite().min(0).max(1),
  fadeIn: SecondsSchema,
  fadeOut: SecondsSchema,
  transitionOut: PostTransitionOutSchema.optional(),
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
    sourceGeometry: PostSourceGeometrySchema.optional(),
    autoAdjust: PostAutoAdjustSchema.optional(),
    colorGrade: z
      .object({
        brightness: z.number().finite().min(0.5).max(1.5),
        contrast: z.number().finite().min(0.5).max(1.5),
        saturation: z.number().finite().min(0).max(2),
        hue: z.number().finite().min(-180).max(180).optional(),
      })
      .strict()
      .optional(),
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

export const PostImageItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("image"),
    imageId: IdSchema,
    /** QR artwork can follow the post theme or use a chosen contrast. */
    qrAppearance: z.enum(["light", "dark"]).optional(),
    sourceGeometry: PostSourceGeometrySchema.optional(),
    keyframes: z
      .object({
        sourceGeometry: z.array(PostKeyframeSourceGeometrySchema).optional(),
        box: z.array(PostKeyframeBoxSchema).optional(),
        opacity: z.array(PostKeyframeOpacitySchema).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type PostImageItem = z.infer<typeof PostImageItemSchema>;

export const PostImageSchema = z
  .object({
    id: IdSchema,
    label: z.string().trim().min(1).max(120),
    ref: PostTakeRefSchema,
  })
  .strict();
export type PostImage = z.infer<typeof PostImageSchema>;
export const PostFontSchema = z
  .object({
    family: z.string().min(1),
    ref: PostTakeRefSchema,
  })
  .strict();
export type PostFont = z.infer<typeof PostFontSchema>;

/**
 * Whether a card can carry this scan link: an https address with a host, no
 * spaces, and at most POST_MAX_QR_URL_LENGTH characters.
 */
export function isPostCardQrUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > POST_MAX_QR_URL_LENGTH ||
    /\s/.test(value) ||
    !value.startsWith("https://")
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export const PostCardItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("card"),
    /** The link the card's QR shows instead of the account's own code. */
    qrUrl: z.string().refine(isPostCardQrUrl, POST_QR_URL_RULE).optional(),
    /** Overrides for this card only; absent fields retain the viewer look. */
    cardAppearance: z
      .object({
        addWord: z.boolean().optional(),
        addStepNumbers: z.boolean().optional(),
        includeStartPlacement: z.boolean().optional(),
        addDifficultyLevel: z.boolean().optional(),
        showLoopGlyph: z.boolean().optional(),
        showNotes: z.boolean().optional(),
        showGrid: z.boolean().optional(),
        showTKA: z.boolean().optional(),
        showTnD: z.boolean().optional(),
        showPlacements: z.boolean().optional(),
        showReversals: z.boolean().optional(),
        showPropTnD: z.boolean().optional(),
        showHandColorKey: z.boolean().optional(),
        showNonRadialPoints: z.boolean().optional(),
        showQRCode: z.boolean().optional(),
        showMandala: z.boolean().optional(),
        infoCellChoice: z.enum(["qr", "mandala", "none"]).optional(),
        startPlacementLayout: z.enum(["row", "column"]).optional(),
        columnCount: z.number().int().positive().nullable().optional(),
        darkMode: z.boolean().optional(),
        customNotesText: z.string().max(120).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PostCardItem = z.infer<typeof PostCardItemSchema>;

/** Display flags for a live animation, independent of viewer settings. */
export const PostAnimationAppearanceSchema = z
  .object({
    propType: z.nativeEnum(PropType).optional(),
    propLook: z.enum(PROP_LOOKS).optional(),
    gridMode: z.enum(["none", "8point", "auto"]).optional(),
    props: z.boolean().optional(),
    tkaGlyph: z.boolean().optional(),
    elementalGlyph: z.boolean().optional(),
    propElementalGlyph: z.boolean().optional(),
    stepNumbers: z.boolean().optional(),
    progressBar: z.boolean().optional(),
    wordHeader: z.boolean().optional(),
    wordHeaderHighlight: z.enum(["arrival", "travel"]).optional(),
    mandala: z.boolean().optional(),
    /** Line width of the mandala guide in canvas pixels; 2.5 when absent. */
    mandalaThickness: z.number().min(1).max(12).optional(),
    leftPathLines: z.boolean().optional(),
    rightPathLines: z.boolean().optional(),
    pathShape: z.enum(["arc", "linear", "concave"]).optional(),
    motionAwarePaths: z.boolean().optional(),
    effortPreset: z
      .enum([
        "linear",
        "glide",
        "dab",
        "press",
        "punch",
        "elastic",
        "bounce",
        "anticipation",
      ])
      .optional(),
    darkMode: z.boolean().optional(),
    /** Full canonical effects snapshot, scoped to this timeline item. */
    effects: z
      .custom<EffectsConfig>(
        (value) =>
          value !== null &&
          typeof value === "object" &&
          typeof (value as EffectsConfig).version === "number" &&
          typeof (value as EffectsConfig).activeEffect === "string" &&
          typeof (value as EffectsConfig).tipEffectMap === "object"
      )
      .optional(),
    trail: z
      .object({
        enabled: z.boolean(),
        trackingMode: z.nativeEnum(TrackingMode),
        thickness: z.number().finite().min(1).max(12),
        brightness: z.number().finite().min(0.3).max(1),
        tailLength: z.number().int().min(10).max(400),
        leftColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        rightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        /** Complete rendering settings; older projects retain the fields above. */
        settings: z
          .object({
            mode: z.nativeEnum(TrailMode),
            effect: z.nativeEnum(TrailEffect),
            fadeDurationMs: z.number().finite().nonnegative(),
            maxPoints: z.number().int().positive(),
            lineWidth: z.number().finite().positive(),
            glowBlur: z.number().finite().nonnegative(),
            leftColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            rightColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            additionalLayerColors: z.array(
              z
                .object({
                  left: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                  right: z.string().regex(/^#[0-9a-fA-F]{6}$/),
                })
                .strict()
            ),
            minOpacity: z.number().finite().min(0).max(1),
            maxOpacity: z.number().finite().min(0).max(1),
            trackingMode: z.nativeEnum(TrackingMode),
            hideProps: z.boolean(),
            usePathCache: z.boolean(),
            previewMode: z.boolean(),
            tailLength: z.number().int().min(10).max(400),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PostAnimationAppearance = z.infer<
  typeof PostAnimationAppearanceSchema
>;

/** The sequence animation: the dual view's lower panel. */
export const PostAnimationItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("animation"),
    /** Paint the beat number, letter and progress over it. */
    overlay: z.boolean(),
    /**
     * Makes this item the opening hook: the sequence's tunnel plays through
     * over the item's whole span, then the extra performers fade out. The
     * sequence clock belongs to the hook, not to a take.
     */
    tunnelHook: TunnelHookSchema.optional(),
    /** Display flags for this live animation, independent of viewer settings. */
    animationAppearance: PostAnimationAppearanceSchema.optional(),
    /**
     * What the opening tunnel shows differently from the animation it opens:
     * only the flags set here, read over `animationAppearance` while the
     * intro plays. Everything else follows the animation. Meaningless
     * without a `tunnelHook`.
     */
    tunnelAppearance: PostAnimationAppearanceSchema.optional(),
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
    /** PiP uses the same scoped canvas appearance as an animation item. */
    animationAppearance: PostAnimationItemSchema.shape.animationAppearance,
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

export const PostTextStyleSchema = z
  .object({
    fontFamily: z.string().min(1),
    fontSizeNative: z.number().finite().positive(),
    fontScale: z.number().finite().positive().optional(),
    sourceCanvasWidth: z.number().finite().positive().optional(),
    letterSpacing: z.number().finite(),
    lineSpacing: z.number().finite().positive(),
    alignment: z.enum(["left", "center", "right"]),
    alpha: z.number().finite().min(0).max(1),
  })
  .strict();
export type PostTextStyle = z.infer<typeof PostTextStyleSchema>;

export const PostTextAnimationSchema = z
  .object({
    kind: z.literal("letter-slide"),
    inDurationSeconds: SecondsSchema,
    outDurationSeconds: SecondsSchema,
    entranceProgress: z.number().finite(),
    exitProgress: z.number().finite(),
  })
  .strict();
export type PostTextAnimation = z.infer<typeof PostTextAnimationSchema>;

export const PostTextItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("text"),
    text: z.string().max(POST_MAX_TEXT_LENGTH),
    size: PostTextSizeSchema,
    style: PostTextStyleSchema.optional(),
    animation: PostTextAnimationSchema.optional(),
  })
  .strict();

export type PostTextItem = z.infer<typeof PostTextItemSchema>;

/**
 * The sequence's name in its glyphs, with how to say it under the name. The
 * words come in as the clip starts and lift away as it ends; see
 * `tunnel-titles.ts`.
 */
export const PostTitlesItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("titles"),
    /** How to say the name, shown in quotes under it. */
    spoken: z.string().max(POST_MAX_SPOKEN_LENGTH).optional(),
  })
  .strict();

export type PostTitlesItem = z.infer<typeof PostTitlesItemSchema>;

export const PostItemSchema = z.discriminatedUnion("kind", [
  PostVideoItemSchema,
  PostImageItemSchema,
  PostCardItemSchema,
  PostAnimationItemSchema,
  PostMovesItemSchema,
  PostCarouselItemSchema,
  PostTextItemSchema,
  PostTitlesItemSchema,
]);

export type PostItem = z.infer<typeof PostItemSchema>;
export type PostItemKind = PostItem["kind"];

/** Kinds the main track holds; anything else lives on an overlay track. */
export const MAIN_TRACK_KINDS: readonly PostItemKind[] = [
  "video",
  "image",
  "card",
];

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
    /** Prop used by this post's card and animation when an item has no override. */
    propType: z.nativeEnum(PropType).optional(),
    takes: z.array(PostTakeSchema),
    /** Maps travel with a post, keyed by the take id they were edited against. */
    timings: z.record(z.string(), TakeTimingSchema).optional(),
    /** Scoped appearance for each take's timing preview, independent of timeline layers. */
    mappingPreviewAppearances: z
      .record(
        z.string(),
        PostAnimationItemSchema.shape.animationAppearance.unwrap()
      )
      .optional(),
    images: z.array(PostImageSchema).optional(),
    fonts: z.array(PostFontSchema).optional(),
    importSource: z
      .object({
        format: z.literal("inshot-recovery"),
        rawDraftText: z.string(),
        unresolved: z.array(z.string()),
      })
      .strict()
      .optional(),
    tracks: z.array(PostTrackSchema).min(1),
    /**
     * - takes: each clip carries its take's sound at its own volume.
     * - silent: the takes are muted, for music added in the app it is
     *   posted from. A feature video's own `music` plays either way.
     */
    audio: z.enum(["takes", "silent"]),
    /**
     * A feature video's song under the whole post, heard in the preview and
     * the export.
     */
    music: PostMusicSchema.optional(),
    /** The post's shape, and so the export's size; 9:16 when absent. */
    canvas: z.enum(POST_CANVAS_RATIOS).optional(),
    /** What fills the frame where no item covers it; dark when absent. */
    background: z.enum(POST_BACKGROUNDS).optional(),
    /** Reflect the post's layout and footage for a mirrored teaching view. */
    mirrored: z.boolean().optional(),
    /** Mirror, flip, turn or swap the notation alone; the footage keeps its own. */
    sequenceActions: z
      .array(z.enum(POST_SEQUENCE_ACTIONS))
      .max(POST_MAX_SEQUENCE_ACTIONS)
      .optional(),
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
    case "image":
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
    case "titles":
      return { ...POST_BOX.full };
  }
}

/**
 * A box moved or resized into the frame: at least the minimum size, no
 * larger than the frame, and shifted back inside rather than cut.
 */
export function clampBox(box: PostBox): PostBox {
  const width = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.width));
  const height = Math.min(1, Math.max(POST_MIN_BOX_SIZE, box.height));
  const turn = wrapDegrees(box.turn ?? 0);
  return {
    x: Math.min(1 - width, Math.max(0, box.x)),
    y: Math.min(1 - height, Math.max(0, box.y)),
    width,
    height,
    // A box turned back to straight drops its turn, so it reads as it did.
    ...(turn !== 0 ? { turn } : {}),
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

/** Keep linked motion on its own take during an overlap; free layers follow the incoming take. */
export function timingVideoAt(
  items: readonly PostItem[],
  seconds: number,
  anchorItemId?: string
): PostVideoItem | null {
  let covering: PostVideoItem | null = null;
  for (const item of items) {
    if (
      item.kind !== "video" ||
      seconds < item.start - POST_TIME_EPSILON ||
      seconds >= itemEnd(item) - POST_TIME_EPSILON
    )
      continue;
    if (item.id === anchorItemId) return item;
    if (!covering || item.start >= covering.start) covering = item;
  }
  return covering;
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

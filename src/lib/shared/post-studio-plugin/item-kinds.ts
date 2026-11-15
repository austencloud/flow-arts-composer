import { z } from "zod";
import {
  POST_BOX,
  POST_ITEM_BASE_SHAPE,
  POST_MAX_SPEED,
  POST_MIN_SPEED,
  TunnelHookSchema,
  type CoreItemKind,
  type ItemKindDefinition,
  type PostCardItem,
  type PostItemKind,
  type ShapeExtension,
} from "@austencloud/video-editor/core";
import {
  PostAnimationAppearanceSchema,
  type PostAnimationAppearance,
} from "#lib/shared/media-composition/domain/post-animation-appearance.js";
import {
  arrangementSnapshotSchema,
  type ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import { PostAnimationSplitSchema } from "#lib/shared/media-composition/domain/post-animation-split.js";
import { PostPanelLiftSchema } from "#lib/shared/media-composition/domain/post-panel-lift.js";
import {
  PostCometTrailsSchema,
  type PostCometTrails,
} from "#lib/shared/media-composition/domain/comet-trails.js";
import { arrangementDurationSeconds } from "#lib/shared/media-composition/domain/arrangement-timing.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  MANDALA_MAX_SEQUENCES,
  MandalaLookSchema,
  MandalaShiftSchema,
  type MandalaLook,
  type MandalaShift,
} from "#lib/shared/mandala/domain/mandala-shift-types.js";
import type { TunnelTitlesPlan } from "#lib/shared/media-composition/domain/tunnel-titles.js";
import {
  FLASH_DEFAULT_FADE_SECONDS,
  FLASH_DEFAULT_STRENGTH,
  FLASH_MAX_FADE_SECONDS,
  FLASH_MAX_STRENGTH,
  FLASH_MIN_FADE_SECONDS,
  FLASH_MIN_STRENGTH,
  type FlashPlan,
} from "#lib/shared/media-composition/domain/flash.js";
import {
  CREDIT_DEFAULT_BOX,
  CREDIT_DEFAULT_LEAD,
  CREDIT_MAX_LEAD_LENGTH,
  type CreditPlan,
} from "#lib/shared/media-composition/domain/credit.js";
import type { tkaProjectShape } from "./project-extension";
import {
  compileArrangementItem,
  compileCreditItem,
  compileFlashItem,
  compileMandalaItem,
  compileSequenceItem,
  compileTitlesItem,
} from "./compile-hooks";
import { POST_QR_URL_RULE, isPostCardQrUrl } from "./card-qr";
import {
  POST_CARD_HEADER_TITLES,
  PostCardEnterSchema,
  PostCardQrExitSchema,
  PostCardRingSchema,
  type PostCardEnter,
  type PostCardHeaderTitle,
  type PostCardQrExit,
  type PostCardRing,
} from "./card-ending";

/**
 * TKA's item kinds and the fields TKA adds to the core kinds of
 * `@austencloud/video-editor`: the sequence animation, the
 * picture-in-picture moves, the carousel and the titles, plus a video's staff
 * effect and a card's scan link and appearance overrides. The augmentation
 * below makes the core's `PostItem`, `PostVideoItem`, `PostCardItem` and
 * `PostProject` carry them, so every tka importer stays fully typed.
 */

type TkaProjectFields = z.infer<z.ZodObject<typeof tkaProjectShape>>;
type TkaVideoFields = z.infer<z.ZodObject<typeof tkaVideoShape>>;
type TkaCardFields = z.infer<z.ZodObject<typeof tkaCardShape>>;

/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module "@austencloud/video-editor/core" {
  interface PluginItemKinds {
    animation: PostAnimationItem;
    moves: PostMovesItem;
    carousel: PostCarouselItem;
    titles: PostTitlesItem;
    arrangement: PostArrangementItem;
    mandala: PostMandalaItem;
    flash: PostFlashItem;
    credit: PostCreditItem;
  }
  interface PluginVideoFields extends TkaVideoFields {}
  interface PluginCardFields extends TkaCardFields {}
  interface PluginProjectFields extends TkaProjectFields {}
  interface PluginCompiledOutputs {
    titles: TunnelTitlesPlan[];
    flashes: FlashPlan[];
    credits: CreditPlan[];
  }
  interface PluginOverlaySpec {
    mode?: PostMovesMode;
    /** A titles clip's "how to say it" line. */
    spoken?: string;
    overlay?: boolean;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    cardAppearance?: PostCardItem["cardAppearance"] | null;
    /** A flash clip's veil and marks. */
    strength?: number;
    fade?: number;
    marks?: boolean;
    /** A credit's small line over the wordmark. */
    lead?: string;
  }
  interface PluginItemPatch {
    overlay?: boolean;
    mode?: PostMovesMode;
    /** A titles clip's "how to say it" line; blank removes it. */
    spoken?: string;
    /** How a titles clip's words go and come; the default value removes it. */
    leave?: PostTitlesLeave;
    /**
     * A titles clip's arrival (its default value removes it), or a card's
     * cascade (null removes it).
     */
    enter?: PostTitlesEnter | PostCardEnter | null;
    /** A titles clip's lit-letter span; null removes it. */
    lit?: PostTitlesLit | null;
    /** A titles clip's span with the spoken line hidden; null removes it. */
    quiet?: PostTitlesLit | null;
    /**
     * A titles clip's spoken line against its name, at its tallest box and
     * at its shortest; null removes each.
     */
    spokenSize?: number | null;
    spokenSizeSmall?: number | null;
    /** A card's ring on the beats, and its QR's flight out; null removes each. */
    ring?: PostCardRing | null;
    qrExit?: PostCardQrExit | null;
    /** Whose title a card's header shows; "card" (the default) removes it. */
    headerTitle?: PostCardHeaderTitle;
    /** A clip's effect on its staff ends; null removes it. */
    staffEffect?: PostStaffEffectId | null;
    /** A clip's comet trails on its filmed LEDs; null removes them. */
    cometTrails?: PostCometTrails | null;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    cardAppearance?: PostCardItem["cardAppearance"] | null;
    /** An animation's staggered performers; null removes them. */
    followers?: PostAnimationItem["followers"] | null;
    /** An animation drawn in 3D, and its camera; null puts it back in 2D. */
    stage3d?: PostAnimationItem["stage3d"] | null;
    /** An animation's split hands; null removes it. */
    split?: PostAnimationItem["split"] | null;
    /** An animation's lifted panel; null removes it. */
    panelLift?: PostAnimationItem["panelLift"] | null;
    /** A card's scan link; null removes it. A link that breaks the rule is passed over. */
    qrUrl?: string | null;
    /** A mandala clip's ordered sequences, and how it shifts and looks. */
    sequences?: MandalaSequenceSnapshot[];
    shift?: MandalaShift;
    look?: MandalaLook;
    /** A flash clip's veil strength (0 to 1), fade in seconds, and corner marks. */
    strength?: number;
    fade?: number;
    marks?: boolean;
    /** A credit's small line over the wordmark; empty draws the wordmark alone. */
    lead?: string;
  }
}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/** The fields every item kind shares, from the core. */
const itemBase = POST_ITEM_BASE_SHAPE;

/** Longest "how to say it" line a titles clip takes. */
export const POST_MAX_SPOKEN_LENGTH = 60;
/** Smallest and largest a titles clip's spoken line may be against its name. */
export const POST_TITLES_SPOKEN_SIZE_MIN = 0.2;
export const POST_TITLES_SPOKEN_SIZE_MAX = 1;

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

// The appearance lives in its own module because an arrangement's cells carry
// one too, and `arrangement.ts` must not import this file.
export { PostAnimationAppearanceSchema, type PostAnimationAppearance };

/** How far behind a staggered performer can start, and how many there can be. */
export const POST_MAX_BEATS_BEHIND = 32;
export const POST_MAX_FOLLOWERS = 7;

/** The camera shots a 3D animation clip can use. */
export const POST_STAGE_3D_SHOTS = ["front", "orbit", "saved"] as const;
export type PostStage3DShot = (typeof POST_STAGE_3D_SHOTS)[number];
export const POST_STAGE_3D_MIN_SECONDS_PER_TURN = 2;
export const POST_STAGE_3D_MAX_SECONDS_PER_TURN = 600;
/** Metres between neighbouring performers in the file; absent = 1.7. */
export const POST_STAGE_3D_MIN_SPACING = 0.4;
export const POST_STAGE_3D_MAX_SPACING = 3;
/** The front and orbit shots' distance factor; absent = 1. */
export const POST_STAGE_3D_MIN_ZOOM = 0.35;
export const POST_STAGE_3D_MAX_ZOOM = 2;
/** The front and orbit shots' angle above the ground, degrees; absent = 36. */
export const POST_STAGE_3D_MIN_ELEVATION = 5;
export const POST_STAGE_3D_MAX_ELEVATION = 60;
export const POST_STAGE_3D_DEFAULT_ELEVATION = 36;

const PostStagePointSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict();

/**
 * Who plays one performer on the 3D stage: a character id from the 3D
 * viewer's catalog. Read leniently, like the environment: an id the catalog
 * does not know leaves that performer as the default figure, so this file
 * never imports the scene package.
 */
const PostStageCastMemberSchema = z
  .object({ character: z.string().min(1).max(48).optional() })
  .strict();

/**
 * An animation clip drawn as the 3D stage instead of the 2D grid: every
 * performer on its own beat from the clip's clock, seen through one shot.
 * Front holds a still camera on the cast; orbit circles it at a steady rate,
 * so the angle is a function of post time alone; saved holds the camera the
 * user left it at. The environment is a 3D viewer environment id, read
 * leniently (an unknown id falls back to the default) so this file never
 * imports the backgrounds package.
 */
export const PostStage3DSchema = z
  .object({
    shot: z.enum(POST_STAGE_3D_SHOTS),
    orbitSecondsPerTurn: z
      .number()
      .finite()
      .min(POST_STAGE_3D_MIN_SECONDS_PER_TURN)
      .max(POST_STAGE_3D_MAX_SECONDS_PER_TURN)
      .optional(),
    orbitDirection: z.union([z.literal(1), z.literal(-1)]).optional(),
    camera: z
      .object({ position: PostStagePointSchema, target: PostStagePointSchema })
      .strict()
      .optional(),
    environment: z.string().min(1).max(32).optional(),
    /** Who plays each performer, the front one first, then each follower. */
    cast: z
      .array(PostStageCastMemberSchema)
      .max(1 + POST_MAX_FOLLOWERS)
      .optional(),
    /** Metres between neighbouring performers, front to back. */
    spacing: z
      .number()
      .finite()
      .min(POST_STAGE_3D_MIN_SPACING)
      .max(POST_STAGE_3D_MAX_SPACING)
      .optional(),
    /** Front and orbit: the camera's distance as a factor of the framing's. */
    zoom: z
      .number()
      .finite()
      .min(POST_STAGE_3D_MIN_ZOOM)
      .max(POST_STAGE_3D_MAX_ZOOM)
      .optional(),
    /** Front and orbit: the camera's angle above the ground, in degrees. */
    elevation: z
      .number()
      .finite()
      .min(POST_STAGE_3D_MIN_ELEVATION)
      .max(POST_STAGE_3D_MAX_ELEVATION)
      .optional(),
  })
  .strict();

export type PostStage3D = z.infer<typeof PostStage3DSchema>;

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
    /**
     * More performers doing the sequence with the red/blue one, as in a tunnel
     * filmed live: each some beats behind (0 for together), and each may do it
     * mirrored, flipped or hands swapped, as a partner facing the other way
     * does. The tapped beats run from the first performer's first move to the
     * last performer's last landing.
     */
    followers: z
      .array(
        z
          .object({
            beatsBehind: z.number().int().min(0).max(POST_MAX_BEATS_BEHIND),
            mirror: z.boolean().optional(),
            flip: z.boolean().optional(),
            swap: z.boolean().optional(),
          })
          .strict()
      )
      .min(1)
      .max(POST_MAX_FOLLOWERS)
      .optional(),
    /**
     * Draw only part of the cast, as one canvas of a disassembled tunnel: one
     * performer (0 is the front, 1 the first follower, and so on) and, of
     * whoever is drawn, one hand. Absent draws everyone. The clip keeps its
     * `followers`, so its clock, each performer's beats behind and each
     * performer's colours stay the tunnel's.
     */
    part: z
      .object({
        performer: z.number().int().min(0).max(POST_MAX_FOLLOWERS).optional(),
        hand: z.enum(["left", "right"]).optional(),
      })
      .strict()
      .optional(),
    /** Draw this clip as the 3D stage; absent draws the 2D animation. */
    stage3d: PostStage3DSchema.optional(),
    /**
     * Partway through, the one canvas parts into two, the left hand's on the
     * left and the right hand's on the right, and may rejoin. Its times are
     * content time, like the keyframes'. See `post-animation-split.ts`.
     * Ignored while `part.hand` is set.
     */
    split: PostAnimationSplitSchema.optional(),
    /**
     * The panel's lifted layout: the canvas higher and smaller in its box, the
     * step number in the box's top-left corner and the progress bar on its
     * top edge, coming in and going back at content times. Absent keeps the
     * app's own layout. See `post-panel-lift.ts`.
     */
    panelLift: PostPanelLiftSchema.optional(),
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

/** How a titles clip's words go as it ends: lifted away, or held to its last frame. */
export const POST_TITLES_LEAVES = ["lift", "stay"] as const;
export type PostTitlesLeave = (typeof POST_TITLES_LEAVES)[number];
/** How a titles clip's words come in: rising, or already there. */
export const POST_TITLES_ENTERS = ["rise", "none"] as const;
export type PostTitlesEnter = (typeof POST_TITLES_ENTERS)[number];

/**
 * The span, in the clip's keyframe time (seconds from its start), over which
 * only the letter of the move being performed is lit.
 */
export const PostTitlesLitSchema = z
  .object({
    from: z.number().finite().min(0),
    to: z.number().finite().min(0),
  })
  .strict()
  .refine((lit) => lit.to > lit.from, {
    message: "A lit span must end after it starts",
    path: ["to"],
  });
export type PostTitlesLit = z.infer<typeof PostTitlesLitSchema>;

/**
 * The sequence's name in its glyphs, with how to say it under the name. The
 * words come in as the clip starts and lift away as it ends, unless `enter`
 * or `leave` says otherwise; see `tunnel-titles.ts`. A clip with box
 * keyframes draws the two as one pair that fills its box.
 */
export const PostTitlesItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("titles"),
    /** How to say the name, shown in quotes under it. */
    spoken: z.string().max(POST_MAX_SPOKEN_LENGTH).optional(),
    /** Absent is `lift`. */
    leave: z.enum(POST_TITLES_LEAVES).optional(),
    /** Absent is `rise`. */
    enter: z.enum(POST_TITLES_ENTERS).optional(),
    lit: PostTitlesLitSchema.optional(),
    /**
     * A span, in the same time as `lit`, over which the spoken line is
     * hidden: it fades out from `from` and back in after `to`.
     */
    quiet: PostTitlesLitSchema.optional(),
    /**
     * The spoken line's size against the name's letters; absent is 0.42.
     * With box keys it is the size at the tallest box.
     */
    spokenSize: z
      .number()
      .min(POST_TITLES_SPOKEN_SIZE_MIN)
      .max(POST_TITLES_SPOKEN_SIZE_MAX)
      .optional(),
    /**
     * The spoken line's size at the clip's shortest box, the size moving
     * between the two with the box's height; absent is `spokenSize`. A
     * parked name reads better with a larger line than the hook's.
     */
    spokenSizeSmall: z
      .number()
      .min(POST_TITLES_SPOKEN_SIZE_MIN)
      .max(POST_TITLES_SPOKEN_SIZE_MAX)
      .optional(),
  })
  .strict();

export type PostTitlesItem = z.infer<typeof PostTitlesItemSchema>;

// The schema checks a snapshot's JSON shape; its parsed value is the editor's
// own ArrangementSnapshot (layers carry full SequenceData, which an interface
// cannot express as the schema's string-keyed record).
const ArrangementSnapshotFieldSchema =
  arrangementSnapshotSchema as unknown as z.ZodType<ArrangementSnapshot>;

/**
 * An editable Arrange grid, sampled on its own beat clock. It plays a span of
 * one grid cycle as a clip plays its take; normalize keeps the span inside the
 * cycle and after its start.
 */
export const PostArrangementItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("arrangement"),
    snapshot: ArrangementSnapshotFieldSchema,
    sourceIn: z.number().finite().nonnegative(),
    sourceOut: z.number().finite().positive(),
    speed: z.number().finite().min(POST_MIN_SPEED).max(POST_MAX_SPEED),
  })
  .strict();

export type PostArrangementItem = z.infer<typeof PostArrangementItemSchema>;

/** One sequence a mandala clip shifts through: the full record, as an arrangement layer carries it. */
export interface MandalaSequenceSnapshot {
  id: string;
  name: string;
  sequence: SequenceData;
}

// The schema checks the entry's JSON shape; the record itself is the editor's
// SequenceData, which a string-keyed record cannot express.
const MandalaSequenceSnapshotSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    sequence: z.record(z.string(), z.unknown()),
  })
  .passthrough() as unknown as z.ZodType<MandalaSequenceSnapshot>;

/** A mandala clip's take never runs out: an hour of source, trimmed like any clip. */
export const MANDALA_SOURCE_SECONDS = 3600;
/** How long a new mandala clip is. */
export const MANDALA_ITEM_SECONDS = 16;

/**
 * A mandala that shifts between its sequences on the post's beat. The
 * picture is a pure function of post time, so the preview and the exported
 * file agree; see `mandala-item-clock.ts` for how beats are counted.
 */
export const PostMandalaItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("mandala"),
    sequences: z
      .array(MandalaSequenceSnapshotSchema)
      .max(MANDALA_MAX_SEQUENCES),
    shift: MandalaShiftSchema,
    look: MandalaLookSchema,
    sourceIn: z.number().finite().nonnegative(),
    sourceOut: z.number().finite().positive(),
    speed: z.number().finite().min(POST_MIN_SPEED).max(POST_MAX_SPEED),
  })
  .strict();

export type PostMandalaItem = z.infer<typeof PostMandalaItemSchema>;

/**
 * A camera flash on a hit: a white veil over the whole frame at `strength`
 * on the clip's first frame, gone after `fade` seconds, and four corner
 * marks around the clip's box from its first frame to its last. The box says
 * where the marks sit; the veil reaches past it to the frame's edges. See
 * `media-composition/domain/flash.ts`.
 */
export const PostFlashItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("flash"),
    strength: z
      .number()
      .finite()
      .min(FLASH_MIN_STRENGTH)
      .max(FLASH_MAX_STRENGTH),
    fade: z
      .number()
      .finite()
      .min(FLASH_MIN_FADE_SECONDS)
      .max(FLASH_MAX_FADE_SECONDS),
    marks: z.boolean(),
  })
  .strict();

export type PostFlashItem = z.infer<typeof PostFlashItemSchema>;

/** A flash value kept inside its range; one that is not a number gives `fallback`. */
export function clampFlashValue(
  field: "strength" | "fade",
  value: number,
  fallback: number
): number {
  if (!Number.isFinite(value)) return fallback;
  const [min, max] =
    field === "strength"
      ? [FLASH_MIN_STRENGTH, FLASH_MAX_STRENGTH]
      : [FLASH_MIN_FADE_SECONDS, FLASH_MAX_FADE_SECONDS];
  return Math.min(max, Math.max(min, value));
}

/**
 * The ready-made credit: a small grey line ("made with") over the Flow Arts
 * Composer wordmark in its brand serif and gradient, fitted to the box. The
 * wordmark is fixed; only the small line is the clip's own. See
 * `media-composition/domain/credit.ts`.
 */
export const PostCreditItemSchema = z
  .object({
    ...itemBase,
    kind: z.literal("credit"),
    lead: z.string().max(CREDIT_MAX_LEAD_LENGTH),
  })
  .strict();

export type PostCreditItem = z.infer<typeof PostCreditItemSchema>;

/** Kinds drawn from the sequence, which read the move of the footage under them. */
export const SEQUENCE_ITEM_KINDS: readonly PostItemKind[] = [
  "animation",
  "moves",
  "carousel",
];

// ---------------------------------------------------------------------------
// Fields tka adds to the core video and card kinds
// ---------------------------------------------------------------------------

export const tkaVideoShape = {
  /**
   * An effect drawn on the take's lit staff ends, from the staff track
   * saved with the take. Nothing draws until the take has one.
   */
  staffEffect: PostStaffEffectSchema.optional(),
  /**
   * Comet trails behind the take's LED bulbs, replayed from a light map
   * read once from the take (`scripts/feature-video/comet-map.mjs`).
   */
  cometTrails: PostCometTrailsSchema.optional(),
};

export const tkaCardShape = {
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
  /**
   * The card's ending, all optional; see `card-ending.ts`. A card with none
   * of them draws and exports as it always has.
   */
  enter: PostCardEnterSchema.optional(),
  ring: PostCardRingSchema.optional(),
  qrExit: PostCardQrExitSchema.optional(),
  /** Absent is "card": the header draws its own word. */
  headerTitle: z.enum(POST_CARD_HEADER_TITLES).optional(),
};

/** Every item's shared keys, in the order the core's item base gives them. */
const BASE_ORDER = [
  "id",
  "label",
  "start",
  "pinnedStart",
  "duration",
  "box",
  "opacity",
  "fadeIn",
  "fadeOut",
  "transitionOut",
  "anchor",
  "fill",
  "keyframes",
] as const;

/**
 * The video and card kinds with tka's fields, in the key order a saved
 * project has always had, so parsing keeps every object byte for byte.
 */
export const TKA_KIND_EXTENSIONS: Partial<
  Record<CoreItemKind, ShapeExtension>
> = {
  video: {
    shape: tkaVideoShape,
    order: [
      ...BASE_ORDER,
      "kind",
      "sourceGeometry",
      "autoAdjust",
      "colorGrade",
      "takeId",
      "sourceIn",
      "sourceOut",
      "speed",
      "holdOut",
      "fit",
      "shape",
      "edge",
      "zoom",
      "panX",
      "panY",
      "rotation",
      "flip",
      "volume",
      "staffEffect",
      "cometTrails",
    ],
  },
  card: {
    shape: tkaCardShape,
    order: [
      ...BASE_ORDER,
      "kind",
      "qrUrl",
      "cardAppearance",
      "enter",
      "ring",
      "qrExit",
      "headerTitle",
    ],
  },
};

// ---------------------------------------------------------------------------
// Kind definitions
// ---------------------------------------------------------------------------

/**
 * tka's kinds in union order, after the core's four. Labels are the editor's
 * English names; boxes are where the Add menu first puts each kind.
 */
export const TKA_ITEM_KINDS: readonly ItemKindDefinition[] = [
  {
    kind: "animation",
    schema: PostAnimationItemSchema,
    label: "Animation",
    defaultBox: () => ({ ...POST_BOX.bottom }),
    transitionVisual: true,
    // An animation with a tunnel intro opens that long before its footage, so
    // the intro and the animation are one item on one canvas. When the
    // footage plays behind the intro, it opens with the footage instead.
    placement: (item) => {
      if (item.kind !== "animation") return null;
      const intro = item.tunnelHook?.seconds ?? 0;
      return { intro, lead: item.tunnelHook?.backdrop ? 0 : intro };
    },
    // An animation's intro is written as its own keys, which may be edited.
    ownsIntroKeys: true,
    compile: compileSequenceItem,
    create: (base, spec) => ({
      ...base,
      kind: "animation",
      overlay: spec.overlay ?? true,
    }),
  },
  {
    kind: "moves",
    schema: PostMovesItemSchema,
    label: "Picture in picture",
    defaultBox: () => ({ ...POST_BOX.stripSquare }),
    transitionVisual: true,
    compile: compileSequenceItem,
    create: (base, spec) => ({
      ...base,
      kind: "moves",
      mode: spec.mode ?? "arrows",
    }),
  },
  {
    kind: "carousel",
    schema: PostCarouselItemSchema,
    label: "Carousel",
    defaultBox: () => ({ ...POST_BOX.stripCarousel }),
    transitionVisual: true,
    compile: compileSequenceItem,
  },
  {
    kind: "arrangement",
    schema: PostArrangementItemSchema,
    label: "Arrangement",
    defaultBox: () => ({ ...POST_BOX.full }),
    transitionVisual: true,
    mainTrack: true,
    sourceLength: (item) =>
      item.kind === "arrangement"
        ? arrangementDurationSeconds(item.snapshot)
        : item.duration,
    compile: compileArrangementItem,
  },
  {
    kind: "titles",
    schema: PostTitlesItemSchema,
    label: "Titles",
    defaultBox: () => ({ ...POST_BOX.full }),
    compile: compileTitlesItem,
    create: (base, spec) => {
      const spoken = spec.spoken?.slice(0, POST_MAX_SPOKEN_LENGTH);
      // The new-item base is typed as a card; its ending fields are the
      // card's alone, and a card's `enter` is not a titles clip's.
      const {
        enter: _enter,
        ring: _ring,
        qrExit: _qrExit,
        headerTitle: _headerTitle,
        ...shared
      } = base;
      return {
        ...shared,
        kind: "titles",
        ...(spoken?.trim() ? { spoken } : {}),
      };
    },
  },
  {
    kind: "mandala",
    schema: PostMandalaItemSchema,
    label: "Mandala",
    defaultBox: () => ({ ...POST_BOX.full }),
    transitionVisual: true,
    mainTrack: true,
    sourceLength: () => MANDALA_SOURCE_SECONDS,
    compile: compileMandalaItem,
  },
  {
    kind: "flash",
    schema: PostFlashItemSchema,
    label: "Flash",
    // A centred square on a 9:16 frame; the Add menu fits it to the canvas.
    defaultBox: () => ({ x: 0.2, y: 0.33125, width: 0.6, height: 0.3375 }),
    compile: compileFlashItem,
    create: (base, spec) => ({
      ...base,
      kind: "flash",
      strength: clampFlashValue(
        "strength",
        spec.strength ?? FLASH_DEFAULT_STRENGTH,
        FLASH_DEFAULT_STRENGTH
      ),
      fade: clampFlashValue(
        "fade",
        spec.fade ?? FLASH_DEFAULT_FADE_SECONDS,
        FLASH_DEFAULT_FADE_SECONDS
      ),
      marks: spec.marks ?? true,
    }),
  },
  {
    kind: "credit",
    schema: PostCreditItemSchema,
    label: "Credit",
    defaultBox: () => ({ ...CREDIT_DEFAULT_BOX }),
    compile: compileCreditItem,
    create: (base, spec) => ({
      ...base,
      kind: "credit",
      lead: (spec.lead ?? CREDIT_DEFAULT_LEAD).slice(0, CREDIT_MAX_LEAD_LENGTH),
    }),
  },
];

import { z } from "zod";
import {
  POST_BOX,
  POST_ITEM_BASE_SHAPE,
  TunnelHookSchema,
  type CoreItemKind,
  type ItemKindDefinition,
  type PostCardItem,
  type PostItemKind,
  type ShapeExtension,
} from "@austencloud/video-editor/core";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { PROP_LOOKS } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import {
  TrackingMode,
  TrailEffect,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { TunnelTitlesPlan } from "#lib/shared/media-composition/domain/tunnel-titles.js";
import type { tkaProjectShape } from "./project-extension";
import { compileSequenceItem, compileTitlesItem } from "./compile-hooks";
import { POST_QR_URL_RULE, isPostCardQrUrl } from "./card-qr";

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
  }
  interface PluginVideoFields extends TkaVideoFields {}
  interface PluginCardFields extends TkaCardFields {}
  interface PluginProjectFields extends TkaProjectFields {}
  interface PluginCompiledOutputs {
    titles: TunnelTitlesPlan[];
  }
  interface PluginOverlaySpec {
    mode?: PostMovesMode;
    /** A titles clip's "how to say it" line. */
    spoken?: string;
    overlay?: boolean;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    cardAppearance?: PostCardItem["cardAppearance"] | null;
  }
  interface PluginItemPatch {
    overlay?: boolean;
    mode?: PostMovesMode;
    /** A titles clip's "how to say it" line; blank removes it. */
    spoken?: string;
    /** A clip's effect on its staff ends; null removes it. */
    staffEffect?: PostStaffEffectId | null;
    animationAppearance?: PostAnimationItem["animationAppearance"] | null;
    cardAppearance?: PostCardItem["cardAppearance"] | null;
    /** A card's scan link; null removes it. A link that breaks the rule is passed over. */
    qrUrl?: string | null;
  }
}
/* eslint-enable @typescript-eslint/no-empty-object-type */

/** The fields every item kind shares, from the core. */
const itemBase = POST_ITEM_BASE_SHAPE;

/** Longest "how to say it" line a titles clip takes. */
export const POST_MAX_SPOKEN_LENGTH = 60;

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
    ],
  },
  card: {
    shape: tkaCardShape,
    order: [...BASE_ORDER, "kind", "qrUrl", "cardAppearance"],
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
    kind: "titles",
    schema: PostTitlesItemSchema,
    label: "Titles",
    defaultBox: () => ({ ...POST_BOX.full }),
    compile: compileTitlesItem,
    create: (base, spec) => {
      const spoken = spec.spoken?.slice(0, POST_MAX_SPOKEN_LENGTH);
      return { ...base, kind: "titles", ...(spoken?.trim() ? { spoken } : {}) };
    },
  },
];

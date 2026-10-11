import { z } from "zod";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { PROP_LOOKS } from "#lib/shared/pictograph/prop/domain/prop-look.js";
import type { EffectsConfig } from "#lib/shared/effects/domain/effects-config.js";
import {
  TrackingMode,
  TrailEffect,
  TrailMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

/**
 * Display flags for a live animation, independent of viewer settings.
 *
 * A Studio animation item carries one as `animationAppearance`; an
 * arrangement carries one for its grid and an optional override per cell
 * (`arrangement.ts`). Only set flags apply, so an override merges over its
 * base. The schema lives here, not in `post-project.ts`, because
 * `arrangement.ts` needs it and `post-project.ts` imports `arrangement.ts`.
 */
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

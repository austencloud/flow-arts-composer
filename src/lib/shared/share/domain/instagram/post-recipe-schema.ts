import { z } from "zod";
import {
  InstagramPublishOptionsSchema,
  StorageTimestampSchema,
} from "#lib/shared/share/domain/instagram/instagram-post-draft-schema.js";

const NonEmptyIdSchema = z.string().trim().min(1);

export const CarouselRecipeItemSchema = z
  .object({
    id: NonEmptyIdSchema,
    role: z.enum([
      "title",
      "performance",
      "animation",
      "full-card",
      "beat-breakdown",
      "qr-ending",
    ]),
    sourceRole: NonEmptyIdSchema.nullable(),
  })
  .strict();

export const InstagramPublishDefaultsSchema = InstagramPublishOptionsSchema;

export const PostRecipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: NonEmptyIdSchema,
    ownerId: NonEmptyIdSchema,
    name: z.string().trim().min(1).max(120),
    format: z.enum(["image", "reel", "carousel", "story"]),
    compositionPresetId: NonEmptyIdSchema.nullable(),
    carouselStructure: z
      .array(CarouselRecipeItemSchema)
      .min(2)
      .max(10)
      .nullable(),
    captionPresetId: NonEmptyIdSchema.nullable(),
    deliveryDefaults: InstagramPublishDefaultsSchema,
    createdAt: StorageTimestampSchema,
    updatedAt: StorageTimestampSchema,
  })
  .strict()
  .superRefine((recipe, context) => {
    if (recipe.format === "carousel" && recipe.carouselStructure === null) {
      context.addIssue({
        code: "custom",
        path: ["carouselStructure"],
        message: "Carousel recipes need an item structure",
      });
    }
    if (recipe.format !== "carousel" && recipe.carouselStructure !== null) {
      context.addIssue({
        code: "custom",
        path: ["carouselStructure"],
        message: "Only carousel recipes can define carousel items",
      });
    }
  });

export type PostRecipe = z.infer<typeof PostRecipeSchema>;

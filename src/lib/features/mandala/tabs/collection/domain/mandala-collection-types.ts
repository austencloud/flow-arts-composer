import { z } from "zod";
import { StepDataSchema } from "#lib/shared/foundation/domain/schemas.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type {
  MandalaHandVisibility,
  MandalaPathShape,
} from "#lib/shared/mandala/domain/mandala-types.js";
import { normalizeLegacyPropConfig } from "@tka/tka-types";
import type { HandColorPair } from "@tka/render-composition";

export interface CollectedMandala {
  id: string;
  name: string;
  steps: StepData[];
  variant: MandalaHandVisibility;
  leftPropType: string;
  rightPropType: string;
  pathShape?: MandalaPathShape;
  /** The hand colors the maker saw when saving. Absent on anything saved before
   *  colors were recorded, or with none chosen: those draw in the one fixed look
   *  (`savedMandalaPalette`). A viewer's own settings never recolor a saved piece. */
  colors?: HandColorPair;
  createdAt: number;
  source?: "studio" | "sequence" | "default";
  /** Lineage stamp — the source sequence's simplified word (never a raw
   *  repeated word; see simplifyRepeatedWord) and, when known at save time,
   *  its library id. Optional: old entries simply lack them. */
  sourceWord?: string;
  sourceSequenceId?: string;
  /** Stable work id lives in `id`; these fields identify the exact current
   * immutable payload. Legacy entries are baselined when they next hydrate. */
  currentRevisionId?: string;
  currentContentDigest?: string;
  currentRevisionCreatedAt?: number;
  revisionDigestAlgorithm?: "SHA-256";
  revisionDigestVersion?: 1;
}

const HandHexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Exported so a save refuses what a later load would throw away. */
export const SavedHandColorsSchema = z.object({
  left: HandHexColorSchema,
  right: HandHexColorSchema,
});

export const CollectedMandalaSchema = z.preprocess(
  normalizeLegacyPropConfig,
  z.object({
    id: z.string().min(1),
    name: z.string(),
    steps: z.array(StepDataSchema),
    variant: z.preprocess(
      (value) =>
        value === "blue" ? "left" : value === "red" ? "right" : value,
      z.enum(["left", "right", "both"])
    ),
    leftPropType: z.string(),
    rightPropType: z.string(),
    pathShape: z.enum(["arc", "linear", "concave", "hybrid"]).optional(),
    // Published payloads reach guests' browsers and end up inside SVG markup, and
    // the database rules do not inspect them, so only a real hex color gets
    // through. Anything else loses its colors, not the whole mandala.
    colors: SavedHandColorsSchema.optional().catch(undefined),
    createdAt: z.any(),
    updatedAt: z.any().optional(),
    source: z.enum(["studio", "sequence", "default"]).optional(),
    sourceWord: z.string().optional(),
    sourceSequenceId: z.string().optional(),
    currentRevisionId: z.string().min(1).optional(),
    currentContentDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    currentRevisionCreatedAt: z.number().optional(),
    revisionDigestAlgorithm: z.literal("SHA-256").optional(),
    revisionDigestVersion: z.literal(1).optional(),
  })
);

export const MANDALA_COLLECTION_STORAGE_KEY = "tka:mandala-collection";
export const MANDALA_COLLECTION_SCHEMA_VERSION = 1;

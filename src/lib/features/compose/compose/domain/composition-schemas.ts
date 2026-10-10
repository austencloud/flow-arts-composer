import { z } from "zod";
import { firestoreDate } from "$lib/shared/firestore";
import { normalizeLegacySequence } from "@tka/tka-types";
import { arrangementSnapshotSchema } from "$lib/shared/media-composition/domain/arrangement";

const PersistedSequenceSchema = z.preprocess(
  normalizeLegacySequence,
  z.record(z.string(), z.unknown())
);

const CellConfigSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    sequences: z.array(PersistedSequenceSchema),
    trailSettings: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export const CompositionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    layout: z.object({ rows: z.number(), cols: z.number() }),
    cells: z.array(CellConfigSchema),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
    creator: z.string(),
    isFavorite: z.boolean(),
    thumbnailUrl: z.string().optional(),
    ownerId: z.string().optional(),
    arrangement: arrangementSnapshotSchema.optional(),
  })
  .passthrough();

export type CompositionParsed = z.infer<typeof CompositionSchema>;

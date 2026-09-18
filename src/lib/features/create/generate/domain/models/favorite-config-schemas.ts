import { z } from "zod";
import { firestoreDate } from "$lib/shared/firestore";

export const SavedGeneratorSetupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    config: z.record(z.string(), z.unknown()),
    startEndOptions: z.record(z.string(), z.unknown()).nullable().optional(),
    isPublic: z.boolean().optional(),
    createdAt: firestoreDate.optional(),
    updatedAt: firestoreDate.optional(),
  })
  .passthrough();

export type SavedGeneratorSetupDoc = z.infer<
  typeof SavedGeneratorSetupSchema
>;

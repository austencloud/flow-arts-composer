import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

export const HandPathDataSchema = z
  .object({
    id: z.string(),
    locations: z.array(z.string()),
    contentHash: z.string(),
    startLocation: z.string(),
    endLocation: z.string(),
    length: z.number(),
    bigrams: z.array(z.string()),
    uniqueLocations: z.array(z.string()),
    impliedGridMode: z.string(),
    isClosed: z.boolean(),
    name: z.string().optional(),
    author: z.string().optional(),
    notes: z.string().optional(),
    thumbnails: z.array(z.string()).optional(),
    dateCreated: firestoreDate.optional(),
    ownerId: z.string().optional(),
    ownerDisplayName: z.string().optional(),
  })
  .passthrough();

export type HandPathDataParsed = z.infer<typeof HandPathDataSchema>;

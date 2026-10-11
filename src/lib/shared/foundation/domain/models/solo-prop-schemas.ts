import { z } from "zod";
import { Plane } from "@tka/tka-types";
import { firestoreDate } from "#lib/shared/firestore/index.js";
import { HandPathDataSchema } from "./hand-path-schemas";

const SoloPropStepSchema = z
  .object({
    startLocation: z.string(),
    endLocation: z.string(),
    startOrientation: z.string(),
    endOrientation: z.string(),
    motionType: z.string(),
    rotationDirection: z.string(),
    turns: z.union([z.number(), z.literal("fl")]),
    duration: z.number(),
    plane: z.nativeEnum(Plane).optional(),
  })
  .passthrough();

export const SoloPropDataSchema = z
  .object({
    id: z.string(),
    steps: z.array(SoloPropStepSchema),
    startLocation: z.string(),
    startOrientation: z.string(),
    contentHash: z.string(),
    handPath: HandPathDataSchema,
    length: z.number(),
    bigrams: z.array(z.string()),
    impliedGridMode: z.string(),
    name: z.string().optional(),
    authoredHand: z.enum(["left", "right"]).optional(),
    author: z.string().optional(),
    notes: z.string().optional(),
    thumbnails: z.array(z.string()).optional(),
    dateCreated: firestoreDate.optional(),
    ownerId: z.string().optional(),
    ownerDisplayName: z.string().optional(),
  })
  .passthrough();

export type SoloPropDataParsed = z.infer<typeof SoloPropDataSchema>;

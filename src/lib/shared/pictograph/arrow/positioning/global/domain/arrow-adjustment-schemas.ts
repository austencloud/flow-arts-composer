import { z } from "zod";
// Worker-safe leaf (no auth/firebase-client): the barrel pulls authState → $app/navigation.
import { firestoreDate } from "#lib/shared/firestore/firestore-date.js";
import { PlacementFrame } from "../../placement/domain/placement-frame";

export const GlobalArrowAdjustmentSchema = z
  .object({
    placementFrame: z.enum([PlacementFrame.CANONICAL, PlacementFrame.SKEWED]),
    oriKey: z.string(),
    letter: z.string(),
    turnsTuple: z.string(),
    arrowKey: z.string(),
    propType: z.string().optional(),
    otherPropType: z.string().optional(),
    adjustmentX: z.number(),
    adjustmentY: z.number(),
    updatedAt: firestoreDate,
    updatedBy: z.string(),
  })
  .passthrough();

export type GlobalArrowAdjustmentParsed = z.infer<
  typeof GlobalArrowAdjustmentSchema
>;

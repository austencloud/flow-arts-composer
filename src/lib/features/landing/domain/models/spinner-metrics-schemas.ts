import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

export const SpinnerMetricsSchema = z
  .object({
    totalGenerated: z.number(),
    lastGeneratedAt: firestoreDate.nullable(),
  })
  .passthrough();

export type SpinnerMetrics = z.infer<typeof SpinnerMetricsSchema>;

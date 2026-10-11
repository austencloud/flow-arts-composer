import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

export const UserFestivalTrackerSchema = z
  .object({
    userId: z.string(),
    festivalId: z.string(),
    status: z.enum(["interested", "applying", "applied", "accepted", "declined", "attending"]),
    appliedAs: z.array(z.enum(["instructor", "performer"])),
    workshopsSubmitted: z.array(z.string()),
    actsSubmitted: z.array(z.string()),
    stipendRequested: z.number().optional(),
    notes: z.string(),
    applicationDate: firestoreDate.optional(),
    responseDate: firestoreDate.optional(),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
  })
  .passthrough();

export type UserFestivalTracker = z.infer<typeof UserFestivalTrackerSchema>;

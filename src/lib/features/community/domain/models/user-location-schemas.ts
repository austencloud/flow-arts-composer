import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

export const UserLocationSchema = z
  .object({
    userId: z.string(),
    city: z.string(),
    country: z.string(),
    countryCode: z.string().optional(),
    cityCenterCoordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    visibility: z.enum(["public", "private"]),
    updatedAt: firestoreDate,
  })
  .passthrough();

export type UserLocation = z.infer<typeof UserLocationSchema>;

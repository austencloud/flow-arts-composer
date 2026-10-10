import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

const CoordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const FestivalLocationSchema = z.object({
  venue: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  country: z.string(),
  coordinates: CoordinatesSchema,
});

export const FestivalSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    organizationId: z.string(),
    organization: z.string(),
    location: FestivalLocationSchema,
    dates: z.object({ start: firestoreDate, end: firestoreDate }),
    applicationDeadline: firestoreDate.optional(),
    applicationUrl: z.string().optional(),
    applicationContact: z.string().optional(),
    seekingInstructors: z.boolean(),
    seekingPerformers: z.boolean(),
    description: z.string(),
    websiteUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    socialLinks: z
      .object({ instagram: z.string().optional(), facebook: z.string().optional() })
      .optional(),
    estimatedSize: z.enum(["intimate", "medium", "large"]).optional(),
    region: z.enum(["north-america", "europe", "oceania", "asia", "south-america", "africa"]),
    status: z.enum(["upcoming", "past"]),
    tags: z.array(z.string()),
    source: z.enum(["scraped", "user-submitted", "curated"]),
    moderationStatus: z.enum(["pending", "approved"]),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
  })
  .passthrough();

export type Festival = z.infer<typeof FestivalSchema>;

export const FestivalAttendanceSchema = z
  .object({
    festivalId: z.string(),
    userId: z.string(),
    status: z.enum(["interested", "going"]),
    role: z.enum(["attendee", "instructor", "performer"]).optional(),
    createdAt: firestoreDate,
  })
  .passthrough();

export type FestivalAttendance = z.infer<typeof FestivalAttendanceSchema>;

export const FestivalSubmissionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    venue: z.string().optional(),
    dates: z.object({ start: firestoreDate, end: firestoreDate }),
    websiteUrl: z.string(),
    applicationUrl: z.string().optional(),
    description: z.string().optional(),
    seekingInstructors: z.boolean(),
    seekingPerformers: z.boolean(),
    tags: z.array(z.string()),
    submittedBy: z.string(),
    moderationStatus: z.enum(["pending", "approved"]),
    submittedAt: firestoreDate,
  })
  .passthrough();

export type FestivalSubmission = z.infer<typeof FestivalSubmissionSchema>;

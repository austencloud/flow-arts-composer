import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

const WorkshopTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  level: z.enum(["introductory", "beginner", "intermediate", "advanced", "mixed"]),
  props: z.array(z.string()),
  description: z.string(),
  themes: z.array(z.string()),
  solo: z.boolean(),
  imageUrl: z.string().optional(),
});

const BioVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
});

const ActTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  duration: z.string(),
  performerCount: z.number(),
  solo: z.boolean(),
  props: z.array(z.string()),
  fire: z.boolean(),
  requirements: z.string(),
  videoUrl: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const TeachingPortfolioSchema = z
  .object({
    userId: z.string(),
    classes: z.array(WorkshopTemplateSchema),
    acts: z.array(ActTemplateSchema),
    bios: z.array(BioVersionSchema),
    performanceCredits: z.array(z.string()),
    performanceVideos: z.array(z.string()),
    socialLinks: z
      .object({
        website: z.string().optional(),
        instagram: z.string().optional(),
        facebook: z.string().optional(),
        youtube: z.string().optional(),
        tiktok: z.string().optional(),
      })
      .passthrough(),
    insuranceInfo: z
      .object({
        provider: z.string(),
        policyExpiration: firestoreDate.optional(),
      })
      .optional(),
    homeCity: z.string(),
    homeCountry: z.string(),
    yearsTeaching: z.number(),
    yearsPerforming: z.number(),
    createdAt: firestoreDate,
    updatedAt: firestoreDate,
  })
  .passthrough();

export type TeachingPortfolio = z.infer<typeof TeachingPortfolioSchema>;

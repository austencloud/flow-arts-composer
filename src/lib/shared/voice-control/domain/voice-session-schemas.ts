import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

const VoiceSessionEventSchema = z
  .object({
    index: z.number(),
    offsetMs: z.number(),
    transcript: z.string(),
    speechConfidence: z.number(),
    tier: z.string(),
    latencyMs: z.number(),
  })
  .passthrough();

const VoiceSessionStatsSchema = z
  .object({
    totalEvents: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    unresolvedCount: z.number(),
    avgLatencyMs: z.number(),
  })
  .passthrough();

export const VoiceSessionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    startedAt: firestoreDate,
    endedAt: firestoreDate,
    durationMs: z.number(),
    events: z.array(VoiceSessionEventSchema),
    stats: VoiceSessionStatsSchema,
  })
  .passthrough();

export type VoiceSessionParsed = z.infer<typeof VoiceSessionSchema>;

export const VoiceSessionPreviewSchema = z
  .object({
    id: z.string(),
    startedAt: firestoreDate,
    endedAt: firestoreDate,
    durationMs: z.number(),
    stats: VoiceSessionStatsSchema,
  })
  .passthrough();

export type VoiceSessionPreviewParsed = z.infer<typeof VoiceSessionPreviewSchema>;

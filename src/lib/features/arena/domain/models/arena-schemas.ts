import { z } from "zod";
import { firestoreDate } from "#lib/shared/firestore/index.js";

export const ArenaRatingSchema = z
  .object({
    entryId: z.string(),
    entryKind: z.string(),
    mu: z.number(),
    phi: z.number(),
    sigma: z.number(),
    displayRating: z.number(),
    totalMatchups: z.number(),
    wins: z.number(),
    losses: z.number(),
    peakRating: z.number(),
    peakRatingDate: firestoreDate,
    lastMatchAt: firestoreDate,
    enteredPoolAt: firestoreDate,
    word: z.string(),
    ownerId: z.string(),
  })
  .passthrough();

export type ArenaRatingParsed = z.infer<typeof ArenaRatingSchema>;

export const ArenaVoteSchema = z
  .object({
    voterId: z.string(),
    winnerEntryId: z.string(),
    loserEntryId: z.string(),
    timestamp: firestoreDate,
    matchupReason: z.string(),
  })
  .passthrough();

export type ArenaVoteParsed = z.infer<typeof ArenaVoteSchema>;

export const ArenaEntrySchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    word: z.string(),
    ownerId: z.string(),
    ownerDisplayName: z.string().optional(),
  })
  .passthrough();

export type ArenaEntryParsed = z.infer<typeof ArenaEntrySchema>;

/**
 * Zod schemas for Library domain models.
 * Used by the shared Firestore CRUD layer for runtime validation.
 *
 * These schemas validate what comes FROM Firestore (DocumentData),
 * not the full domain model. The mapping/transform layer handles
 * conversion from validated Firestore data to domain types.
 */

import { z } from "zod";
// Import from the leaf module, not the $lib/shared/firestore barrel: the barrel
// pulls in the CRUD layer, creating an import cycle that leaves firestoreDate in
// the temporal dead zone (undefined) when this module evaluates first.
import {
  firestoreDate,
  firestoreDateLenient,
} from "#lib/shared/firestore/firestore-date.js";


const ForkAttributionSchema = z
  .object({
    originalSequenceId: z.string(),
    originalCreatorId: z.string(),
    originalCreatorName: z.string(),
    originalCreatorPhotoUrl: z.string().optional(),
    forkedAt: firestoreDate,
    forkChain: z.array(z.string()).optional(),
  })
  .passthrough();

const SequenceTagSchema = z
  .object({
    tagId: z.string(),
    source: z.enum(["user", "ai", "rule-based"]),
    confidence: z.number().optional(),
    addedAt: firestoreDate,
  })
  .passthrough();

// --- LibrarySequence Firestore document schema ---
// Validates the raw document shape coming from Firestore.
// Fields use firestoreDate for Timestamp -> Date conversion.
// .passthrough() allows extra/legacy fields to flow through.

export const LibrarySequenceDocSchema = z
  .object({
    id: z.string(),
    name: z.string().default(""),
    sequenceKind: z.enum(["prop", "hand-path"]).optional(),
    displayName: z.string().optional(),
    intendedWord: z.string().optional(),
    word: z.string().default(""),

    // Ownership
    ownerId: z.string().optional(),
    source: z.enum(["created", "forked", "imported"]).optional(),
    forkAttribution: ForkAttributionSchema.optional(),

    // Visibility
    visibility: z.enum(["private", "unlisted", "public"]).optional(),
    visibilityChangedAt: firestoreDate.optional(),
    isFeatured: z.boolean().optional(),

    // Organization
    collectionIds: z.array(z.string()).default([]),
    tagIds: z.array(z.string()).default([]),
    sequenceTags: z.array(SequenceTagSchema).default([]),
    notes: z.string().optional(),

    // Engagement
    forkCount: z.number().default(0),
    viewCount: z.number().default(0),
    starCount: z.number().default(0),
    publicPerformanceCount: z.number().int().nonnegative().default(0),
    latestPublicPerformanceAt: firestoreDateLenient,

    // Sync
    _version: z.number().optional(),
    contentHash: z.string().optional(),
    // Identity-hash basis the contentHash was computed under (absent === V1).
    contentHashVersion: z.number().optional(),

    // Soft delete
    isDeleted: z.boolean().optional(),
    deletedAt: z.preprocess((v) => v ?? undefined, firestoreDate.optional()),

    // Timestamps. Lenient: real docs exist whose createdAt/updatedAt hold an
    // unresolved serverTimestamp sentinel (see firestoreDateLenient) — a strict
    // parse fails the whole doc and the sequence reads as deleted.
    birthday: firestoreDateLenient,
    createdAt: firestoreDateLenient,
    updatedAt: firestoreDateLenient,
    dateAdded: firestoreDateLenient,
    lastAccessedAt: firestoreDateLenient,

    // Core sequence fields
    thumbnails: z.array(z.string()).default([]),
    sequenceLength: z.number().optional(),
    author: z.string().optional(),
    level: z.number().optional(),
    gridMode: z.string().optional(),
    timeSignature: z.string().optional(),
    isFavorite: z.boolean().default(false),
    isCircular: z.boolean().default(false),
    loopType: z.string().nullable().optional(),
    orientationCycleCount: z.number().optional(),
    period: z.number().optional(),
    tags: z.array(z.string()).default([]),
    metadata: z.record(z.string(), z.unknown()).default({}),

    // Owner display info
    ownerDisplayName: z.string().optional(),
    ownerAvatarUrl: z.string().optional(),
  })
  .passthrough();

// --- User profile (minimal, for enrichment lookups) ---

export const UserProfileDocSchema = z
  .object({
    id: z.string(),
    displayName: z.string().nullish(),
    photoURL: z.string().nullish(),
  })
  .passthrough();

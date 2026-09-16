/**
 * Public projection wire schema — runtime validation for `publicSequences/{id}`.
 *
 * Phase 1 of the sequence/public parity repair
 * (docs/superpowers/specs/active/2026-07-25-sequence-public-parity-repair-design.md,
 * section 3). Pure functions and types only: nothing here writes Firestore and
 * nothing is wired into a runtime caller yet.
 *
 * Why this file exists
 * --------------------
 * Two read paths currently reach a public document and NEITHER validates it as a
 * public projection:
 *
 *   1. `PublicSequencesLoader.fetchPublicSequences` casts raw Firestore data to
 *      `PublicSequenceIndex` (public-sequences-loader.ts:267,271) — a bare cast,
 *      zero runtime checking — then re-casts inside
 *      `mapPublicIndexToSequenceData` (:301-306) to reach `displayName`,
 *      `components`, `componentDomains`, and `isCircular`, none of which the
 *      interface declares.
 *   2. `batchFetchPublicSequences` validates with `LibrarySequenceDocSchema`
 *      (collection-firestore-mapper.ts:196) — the general *library* doc schema,
 *      which knows nothing about projection self-containment.
 *
 *   `PublicSequenceHashMatcher.findPublicMatch` (public-sequence-hash-matcher.ts:51)
 *   is a third bare cast.
 *
 * This module declares the real wire shape — every field the syncer writes plus
 * every field a consumer reads — so those casts can be deleted once the readers
 * migrate (Phase 2+; see "Migration targets" at the bottom of this file).
 *
 * Dependency policy
 * -----------------
 * Runtime dependencies: `zod` plus the pure `@tka/tka-types` legacy normalizer.
 * Every application-domain import remains type-only. That keeps the offline
 * cache, Browse loader, hash matcher, and Admin migration tooling free of
 * Firebase and Svelte runtime dependencies while giving every ingress path the
 * same blue/red-to-left/right compatibility behavior. The existing
 * `SoloPropDataSchema`
 * (`./solo-prop-schemas.ts`) is NOT reused for `leftSoloProp`/`rightSoloProp`
 * because it imports the `$lib/shared/firestore` barrel, which pulls
 * `firestore-crud` → the Firebase client SDK → `authState` → `$app/navigation`.
 * That barrel is unavailable under `tsx` and is the exact import-cycle hazard
 * documented in `library-schemas.ts:11-14`. It is also the wrong validator here:
 * it validates a `soloProps` COLLECTION document for
 * `solo-prop-repository-store.ts`, whereas this schema only needs to know
 * whether the embedded payload is present and renderable. Deep motion validation
 * stays with the hydrator.
 */

import { z } from "zod";
import { normalizeLegacySequence } from "@tka/tka-types";

import type { PublicSequenceIndex } from "./public-sequence-index";
import type { SequenceData } from "./sequence-data";
import type { SoloPropData } from "./solo-prop-data";
import type { StepPairingData } from "./step-pairing-data";
import type { CreatorIntent } from "./creator-intent";

// Schema version

/**
 * The self-contained public projection. A document carrying this version
 * promises it can render without fetching `sourceRef`; failing that promise is
 * an invariant violation, not a reason to fall back.
 */
export const PUBLIC_PROJECTION_SCHEMA_VERSION = 2;

/** Effective version of a document written before the stamp existed. */
export const LEGACY_PUBLIC_PROJECTION_SCHEMA_VERSION = 0;

// Timestamps: the wire value, and the ONE conversion function

/**
 * Every physical encoding of a date that a public document is known to arrive
 * in. The same logical field (`publishedAt`) appears in all of these depending
 * on where it came from:
 *
 * - live Firestore SDK `Timestamp` (`{ toDate() }`) — the normal online read
 * - `{ seconds, nanoseconds }` / `{ _seconds, _nanoseconds }` — a Timestamp that
 *   went through JSON serialization (Admin exports, snapshots)
 * - ISO string — `GalleryOfflineCache.persist` rewrites the five known date
 *   fields to ISO before the IndexedDB JSON round-trip
 *   (gallery-offline-cache.ts:20-35,55-59)
 * - `Date` — already converted, or a locally constructed fixture
 * - epoch number
 */
export type WireTimestamp =
  | Date
  | { toDate(): Date }
  | { seconds: number; nanoseconds?: number }
  | { _seconds: number; _nanoseconds?: number }
  | string
  | number;

function hasToDate(value: object): value is { toDate(): Date } {
  return typeof (value as { toDate?: unknown }).toDate === "function";
}

function secondsOf(value: object): number | undefined {
  const record = value as { seconds?: unknown; _seconds?: unknown };
  const seconds = record.seconds ?? record._seconds;
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? seconds
    : undefined;
}

function nanosecondsOf(value: object): number {
  const record = value as { nanoseconds?: unknown; _nanoseconds?: unknown };
  const nanos = record.nanoseconds ?? record._nanoseconds;
  return typeof nanos === "number" && Number.isFinite(nanos) ? nanos : 0;
}

/**
 * THE canonical timestamp conversion. Wire value in, application `Date` out.
 *
 * Fails closed: an unreadable value returns `undefined` rather than a
 * manufactured "now". `collection-firestore-mapper.ts:56-64` returns
 * `new Date()` on failure, which invents a publication time out of nothing and
 * hides exactly the drift the parity audit is meant to surface. Do not copy that
 * behavior here.
 *
 * Idempotent by construction: a `Date` is returned as the SAME instance, so
 * running a document through conversion twice cannot double-convert or drift.
 */
export function toApplicationDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) return undefined;

  // Already an application Date — hand back the same instance, never re-wrap.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "object") {
    if (hasToDate(value)) {
      const converted = (value as { toDate(): Date }).toDate();
      return converted instanceof Date && !Number.isNaN(converted.getTime())
        ? converted
        : undefined;
    }
    const seconds = secondsOf(value);
    if (seconds !== undefined) {
      return new Date(seconds * 1000 + Math.floor(nanosecondsOf(value) / 1e6));
    }
    return undefined;
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }

  return undefined;
}

/**
 * True when a value is one of the recognized wire encodings of a date.
 *
 * Shape check only — it never calls `toDate()`. Probing by invoking would make
 * validation itself a conversion, so a caller could no longer prove a Timestamp
 * is converted exactly once, and a hostile or half-deserialized object could
 * throw inside the validator.
 */
export function isWireTimestamp(value: unknown): value is WireTimestamp {
  if (value instanceof Date) return !Number.isNaN(value.getTime());

  if (value !== null && typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function")
      return true;
    return secondsOf(value) !== undefined;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && !Number.isNaN(new Date(value).getTime());
  }

  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates that a date field is READABLE without converting it. Conversion is
 * the job of `toPublicSequenceProjection`, so the wire type stays honest about
 * carrying Firestore values rather than application values.
 *
 * This is why the schema does not reuse `firestoreDate`
 * (`$lib/shared/firestore/firestore-date.ts:13-18`): that preprocessor converts
 * during parse, which would erase the wire/application distinction the spec
 * requires, and its `z.coerce.date()` fallback does not understand the
 * `{ seconds, nanoseconds }` shape the offline/export paths produce.
 */
export const wireTimestamp = z.custom<WireTimestamp>(isWireTimestamp, {
  message:
    "Expected a Firestore Timestamp, {seconds,nanoseconds}, Date, ISO string, or epoch number",
});

// Nested payload shapes

/** Any JSON object, extra keys preserved. Rejects arrays and primitives. */
const looseObject = () => z.object({}).passthrough();

/**
 * Presence-and-shape check only. Whether the payload is actually renderable is
 * decided by `checkPublicProjectionSelfContainment`, so a malformed embedded
 * prop is reported as an invariant violation rather than failing the whole
 * document's parse.
 */
const SoloPropWireSchema = z
  .object({
    steps: z.array(z.unknown()).optional(),
  })
  .passthrough();

/**
 * One entry per content beat. Everything is optional because legacy documents
 * vary and because an unresolved `letter` must reach the strict word gate
 * (`word-deriver.deriveWordStatusFromStepPairings`) as data, not as a parse
 * failure.
 */
const StepPairingWireSchema = z
  .object({
    letter: z.string().nullable().optional(),
    leftReversal: z.boolean().optional(),
    rightReversal: z.boolean().optional(),
    startPlacement: z.string().nullable().optional(),
    endPlacement: z.string().nullable().optional(),
  })
  .passthrough();

// The wire schema

/**
 * The `publicSequences/{id}` document as it comes off Firestore.
 *
 * `.passthrough()` matches the repo convention (`LibrarySequenceDocSchema`) and
 * is load-bearing here: an unrecognized field from a NEWER writer must survive a
 * round trip through an older client instead of being stripped or rejected.
 *
 * Field provenance:
 * - written today by `public-index-syncer.ts:148-198`
 * - read but never written (the field-consumer ledger's live bugs):
 *   `animatedSequenceUrl`, `gridMode`, `intendedWord`, `reversalPattern`,
 *   `componentDomains`
 * - read only by the public-collection path, dropped by the Browse mapper:
 *   `forkCount`, `viewCount`, `starCount`, `contentHash`, `contentHashVersion`,
 *   `creatorIntent`, `startPlacement`
 * - reached today only through a cast in `mapPublicIndexToSequenceData`:
 *   `displayName`, `components`, `componentDomains`, `isCircular`
 * - new in schema 2: the three `publicProjection*` stamps
 */
const PublicSequenceWireObjectSchema = z
  .object({
    id: z.string().min(1),
    /** `users/{ownerId}/sequences/{id}` — attribution, NOT a render dependency. */
    sourceRef: z.string().min(1),
    ownerId: z.string().min(1),
    ownerDisplayName: z.string().default(""),
    ownerAvatarUrl: z.string().optional(),

    name: z.string().default(""),
    sequenceKind: z.enum(["prop", "hand-path"]).optional(),
    displayName: z.string().optional(),
    /** Searched by `browse-filter.ts:196`; never written by the syncer today. */
    intendedWord: z.string().optional(),
    word: z.string().default(""),
    thumbnails: z.array(z.string()).default([]),

    // --- canonical count and difficulty -------------------------------------
    sequenceLength: z.number().optional(),
    difficultyLevel: z.string().optional(),
    level: z.number().optional(),

    isCircular: z.boolean().default(false),
    loopType: z.string().nullable().optional(),
    period: z.number().optional(),
    components: z.array(z.string()).optional(),
    /** Consumed via `loop-display-resolver.ts:302`; never written today. */
    componentDomains: z.record(z.string(), z.string()).optional(),
    loopSpec: looseObject().optional(),

    /** Grid Mode filter (`browse-filter.ts:459`); never written today. */
    gridMode: z.string().optional(),
    /** Reversal filter (`browse-filter.ts:649-655`); never written today. */
    reversalPattern: z.string().optional(),

    tags: z.array(z.string()).default([]),

    // --- engagement (public-owned; never rebuilt from source) ----------------
    forkCount: z.number().default(0),
    viewCount: z.number().default(0),
    starCount: z.number().default(0),
    publicPerformanceCount: z.number().int().nonnegative().default(0),
    latestPublicPerformanceAt: wireTimestamp.optional(),

    isForked: z.boolean().default(false),
    originalCreatorId: z.string().optional(),
    originalCreatorName: z.string().optional(),

    contentHash: z.string().optional(),
    contentHashVersion: z.number().optional(),
    encoderHash: z.string().optional(),
    leftPathHash: z.string().optional(),
    rightPathHash: z.string().optional(),
    leftSoloHash: z.string().optional(),
    rightSoloHash: z.string().optional(),

    // --- compositional payload (what makes the document self-contained) -----
    leftSoloProp: SoloPropWireSchema.optional(),
    rightSoloProp: SoloPropWireSchema.optional(),
    stepPairings: z.array(StepPairingWireSchema).optional(),
    /** Not derivable from composition; drives beat-0 avatar orientation. */
    startPlacement: looseObject().optional(),

    creatorIntent: looseObject().nullable().optional(),

    /** Splits the Watch feed (`feed-loader.ts:105,107`); never written today. */
    animatedSequenceUrl: z.string().optional(),
    /**
     * Companion to `animatedSequenceUrl` — the URL is ambiguous without it.
     * `z.string()` rather than an enum: an older client must pass a format
     * minted by a newer writer through unchanged, not reject the document.
     */
    animationFormat: z.string().optional(),

    // --- timestamps (wire values; convert with toPublicSequenceProjection) ---
    birthday: wireTimestamp.optional(),
    publishedAt: wireTimestamp.optional(),
    updatedAt: wireTimestamp.optional(),

    // --- projection stamps (schema 2) ---------------------------------------
    publicProjectionSchemaVersion: z.number().optional(),
    publicProjectionRevision: z.number().optional(),
    publicProjectionDigest: z.string().optional(),
  })
  .passthrough();

export const PublicSequenceWireSchema = z.preprocess(
  normalizeLegacySequence,
  PublicSequenceWireObjectSchema
);

/** The validated wire document. Date fields are still WIRE values here. */
export type PublicSequenceWireDocument = z.infer<
  typeof PublicSequenceWireSchema
>;

// The application model

/**
 * The canonical application-side public projection: `Date`s, not Timestamps,
 * and every field a consumer actually reads.
 *
 * It deliberately does NOT extend `PublicSequenceIndex` unchanged.
 * `PublicSequenceIndex` declares `publishedAt` and `updatedAt` as required, but
 * a legacy document may carry neither, and inventing a date to satisfy the type
 * is precisely the `collection-firestore-mapper` failure this module avoids.
 * Everything else is inherited, so the existing interface stays the shared
 * vocabulary while this type carries the fields it never declared.
 */
export interface PublicSequenceProjection extends Omit<
  PublicSequenceIndex,
  "publishedAt" | "updatedAt"
> {
  readonly publishedAt?: Date;
  readonly updatedAt?: Date;

  // Reached today only through the cast at public-sequences-loader.ts:301-306.
  readonly displayName?: string;
  readonly isCircular: boolean;
  readonly components?: SequenceData["components"];
  readonly componentDomains?: SequenceData["componentDomains"];

  // Read by a consumer, never written by the syncer.
  readonly intendedWord?: string;
  readonly gridMode?: SequenceData["gridMode"];
  readonly reversalPattern?: string;
  readonly animatedSequenceUrl?: string;
  readonly animationFormat?: SequenceData["animationFormat"];

  // Written by the syncer, dropped by the Browse mapper.
  readonly contentHashVersion?: number;
  readonly startPlacement?: SequenceData["startPlacement"];

  readonly loopSpec?: SequenceData["loopSpec"];

  // Schema-2 projection stamps.
  readonly publicProjectionSchemaVersion?: number;
  readonly publicProjectionRevision?: number;
  readonly publicProjectionDigest?: string;
}

/**
 * The ONE wire → application conversion. Every date goes through
 * `toApplicationDate`; no consumer needs its own `toDate`.
 *
 * The compositional payloads are validated for presence and shape, not for
 * motion correctness, so they are asserted to their domain types once here
 * rather than at each read site. The hydrator remains the authority on whether
 * they actually describe a sequence.
 */
export function toPublicSequenceProjection(
  wire: PublicSequenceWireDocument
): PublicSequenceProjection {
  // Convert each date once into a local. A conditional spread that calls the
  // converter in both the test and the value would convert twice, which on a
  // live Firestore Timestamp means two `toDate()` allocations per field per
  // document — 3 wasted conversions on every one of the gallery's documents.
  const birthday = toApplicationDate(wire.birthday);
  const publishedAt = toApplicationDate(wire.publishedAt);
  const updatedAt = toApplicationDate(wire.updatedAt);
  const latestPublicPerformanceAt = toApplicationDate(
    wire.latestPublicPerformanceAt
  );

  return {
    id: wire.id,
    sourceRef: wire.sourceRef,

    ownerId: wire.ownerId,
    ownerDisplayName: wire.ownerDisplayName,
    ...(wire.ownerAvatarUrl !== undefined && {
      ownerAvatarUrl: wire.ownerAvatarUrl,
    }),

    name: wire.name,
    ...(wire.sequenceKind !== undefined && { sequenceKind: wire.sequenceKind }),
    ...(wire.displayName !== undefined && { displayName: wire.displayName }),
    ...(wire.intendedWord !== undefined && { intendedWord: wire.intendedWord }),
    word: wire.word,
    thumbnails: wire.thumbnails,

    ...(wire.sequenceLength !== undefined && {
      sequenceLength: wire.sequenceLength,
    }),
    ...(wire.difficultyLevel !== undefined && {
      difficultyLevel: wire.difficultyLevel,
    }),
    ...(wire.level !== undefined && { level: wire.level }),

    isCircular: wire.isCircular,
    ...(wire.loopType !== undefined && { loopType: wire.loopType }),
    ...(wire.period !== undefined && { period: wire.period }),
    ...(wire.components !== undefined && {
      components: wire.components as unknown as SequenceData["components"],
    }),
    ...(wire.componentDomains !== undefined && {
      componentDomains:
        wire.componentDomains as unknown as SequenceData["componentDomains"],
    }),
    ...(wire.loopSpec !== undefined && {
      loopSpec: wire.loopSpec as unknown as SequenceData["loopSpec"],
    }),

    ...(wire.gridMode !== undefined && {
      gridMode: wire.gridMode as SequenceData["gridMode"],
    }),
    ...(wire.reversalPattern !== undefined && {
      reversalPattern: wire.reversalPattern,
    }),

    tags: wire.tags,

    forkCount: wire.forkCount,
    viewCount: wire.viewCount,
    starCount: wire.starCount,
    publicPerformanceCount: wire.publicPerformanceCount,
    ...(latestPublicPerformanceAt !== undefined && {
      latestPublicPerformanceAt,
    }),

    isForked: wire.isForked,
    ...(wire.originalCreatorId !== undefined && {
      originalCreatorId: wire.originalCreatorId,
    }),
    ...(wire.originalCreatorName !== undefined && {
      originalCreatorName: wire.originalCreatorName,
    }),

    ...(wire.contentHash !== undefined && { contentHash: wire.contentHash }),
    ...(wire.contentHashVersion !== undefined && {
      contentHashVersion: wire.contentHashVersion,
    }),
    ...(wire.encoderHash !== undefined && { encoderHash: wire.encoderHash }),
    ...(wire.leftPathHash !== undefined && { leftPathHash: wire.leftPathHash }),
    ...(wire.rightPathHash !== undefined && {
      rightPathHash: wire.rightPathHash,
    }),
    ...(wire.leftSoloHash !== undefined && { leftSoloHash: wire.leftSoloHash }),
    ...(wire.rightSoloHash !== undefined && {
      rightSoloHash: wire.rightSoloHash,
    }),

    ...(wire.leftSoloProp !== undefined && {
      leftSoloProp: wire.leftSoloProp as unknown as SoloPropData,
    }),
    ...(wire.rightSoloProp !== undefined && {
      rightSoloProp: wire.rightSoloProp as unknown as SoloPropData,
    }),
    ...(wire.stepPairings !== undefined && {
      stepPairings: wire.stepPairings as unknown as readonly StepPairingData[],
    }),
    ...(wire.startPlacement !== undefined && {
      startPlacement:
        wire.startPlacement as unknown as SequenceData["startPlacement"],
    }),

    ...(wire.creatorIntent !== undefined && {
      creatorIntent: wire.creatorIntent as unknown as CreatorIntent | null,
    }),

    ...(wire.animatedSequenceUrl !== undefined && {
      animatedSequenceUrl: wire.animatedSequenceUrl,
    }),
    ...(wire.animationFormat !== undefined && {
      animationFormat: wire.animationFormat as SequenceData["animationFormat"],
    }),

    ...(birthday !== undefined && { birthday }),
    ...(publishedAt !== undefined && { publishedAt }),
    ...(updatedAt !== undefined && { updatedAt }),

    ...(wire.publicProjectionSchemaVersion !== undefined && {
      publicProjectionSchemaVersion: wire.publicProjectionSchemaVersion,
    }),
    ...(wire.publicProjectionRevision !== undefined && {
      publicProjectionRevision: wire.publicProjectionRevision,
    }),
    ...(wire.publicProjectionDigest !== undefined && {
      publicProjectionDigest: wire.publicProjectionDigest,
    }),
  };
}

// Parsing

export type PublicSequenceParseResult =
  | { readonly ok: true; readonly document: PublicSequenceWireDocument }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Validate one raw Firestore document.
 *
 * Pass `id` from the snapshot. The snapshot id wins over any stored `id` field,
 * matching `public-sequences-loader.ts:271` — the document's real address is
 * authoritative over a denormalized copy of it.
 */
export function parsePublicSequenceWireDocument(
  raw: unknown,
  id?: string
): PublicSequenceParseResult {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>), ...(id !== undefined && { id }) }
      : raw;

  const result = PublicSequenceWireSchema.safeParse(candidate);
  if (result.success) {
    return { ok: true, document: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    ),
  };
}

// ---------------------------------------------------------------------------
// Self-containment
// ---------------------------------------------------------------------------

export type PublicProjectionIssueCode =
  | "MISSING_LEFT_SOLO_PROP"
  | "MISSING_RIGHT_SOLO_PROP"
  | "MISSING_STEP_PAIRINGS"
  | "EMPTY_STEP_PAIRINGS"
  | "EMPTY_LEFT_SOLO_PROP_STEPS"
  | "EMPTY_RIGHT_SOLO_PROP_STEPS"
  | "EMPTY_WORD"
  | "MISSING_SEQUENCE_LENGTH"
  | "SEQUENCE_LENGTH_MISMATCH"
  | "MISSING_PUBLISHED_AT";

export interface PublicProjectionSelfContainmentReport {
  /** Can this render without fetching `sourceRef`? */
  readonly selfContained: boolean;
  /** Codes that make rendering impossible. Non-empty means `selfContained` is false. */
  readonly blocking: readonly PublicProjectionIssueCode[];
  /**
   * Codes that do not block rendering but are still projection defects the
   * parity audit must report — a `sequenceLength` of 0 on a 16-beat sequence is
   * the live example (three such documents exist in the corpus).
   */
  readonly advisory: readonly PublicProjectionIssueCode[];
}

/**
 * The minimum a caller must supply. Accepts a parsed wire document, a converted
 * `PublicSequenceProjection`, or any structurally compatible object, so the
 * loader, the migration, and the audit all evaluate the same predicate.
 */
export interface SelfContainmentCandidate {
  readonly word?: string;
  readonly sequenceLength?: number;
  readonly leftSoloProp?: unknown;
  readonly rightSoloProp?: unknown;
  readonly stepPairings?: readonly unknown[];
  readonly publishedAt?: unknown;
}

function stepCountOf(soloProp: unknown): number | undefined {
  if (!soloProp || typeof soloProp !== "object") return undefined;
  const steps = (soloProp as { steps?: unknown }).steps;
  return Array.isArray(steps) ? steps.length : undefined;
}

/**
 * Answers "can this document render without fetching `sourceRef`?"
 *
 * The bar is the one `mapPublicIndexToSequenceData` already applies before it
 * hydrates (public-sequences-loader.ts:355): left solo prop, right solo prop, and
 * step pairings all present. This adds the emptiness checks that the `&&` guard
 * silently passes, plus a non-empty word, because a projection with a blank word
 * renders as an unnamed tile and sorts wrongly under `orderBy("word","asc")`.
 *
 * `sequenceLength` is advisory, not blocking: the loader already overrides it
 * with the hydrated step count (:360-362), so a wrong value cannot stop a
 * render. It is still a defect, so it is reported.
 */
export function checkPublicProjectionSelfContainment(
  candidate: SelfContainmentCandidate
): PublicProjectionSelfContainmentReport {
  const blocking: PublicProjectionIssueCode[] = [];
  const advisory: PublicProjectionIssueCode[] = [];

  if (!candidate.leftSoloProp) {
    blocking.push("MISSING_LEFT_SOLO_PROP");
  } else if (stepCountOf(candidate.leftSoloProp) === 0) {
    blocking.push("EMPTY_LEFT_SOLO_PROP_STEPS");
  }

  if (!candidate.rightSoloProp) {
    blocking.push("MISSING_RIGHT_SOLO_PROP");
  } else if (stepCountOf(candidate.rightSoloProp) === 0) {
    blocking.push("EMPTY_RIGHT_SOLO_PROP_STEPS");
  }

  if (!candidate.stepPairings) {
    blocking.push("MISSING_STEP_PAIRINGS");
  } else if (candidate.stepPairings.length === 0) {
    blocking.push("EMPTY_STEP_PAIRINGS");
  }

  if (!candidate.word || candidate.word.trim().length === 0) {
    blocking.push("EMPTY_WORD");
  }

  const length = candidate.sequenceLength;
  if (typeof length !== "number" || length <= 0) {
    advisory.push("MISSING_SEQUENCE_LENGTH");
  } else if (
    Array.isArray(candidate.stepPairings) &&
    candidate.stepPairings.length > 0 &&
    candidate.stepPairings.length !== length
  ) {
    // `withCanonicalStepCount` (sequence-min-length.ts:38) stamps
    // sequenceLength FROM stepPairings.length, so a normalized projection can
    // never disagree. Legacy documents can, which is why this is advisory.
    advisory.push("SEQUENCE_LENGTH_MISMATCH");
  }

  if (toApplicationDate(candidate.publishedAt) === undefined) {
    advisory.push("MISSING_PUBLISHED_AT");
  }

  return { selfContained: blocking.length === 0, blocking, advisory };
}

/** The bare predicate, for callers that do not need the report. */
export function isSelfContainedPublicProjection(
  candidate: SelfContainmentCandidate
): boolean {
  return checkPublicProjectionSelfContainment(candidate).selfContained;
}

// ---------------------------------------------------------------------------
// Legacy detection and disposition
// ---------------------------------------------------------------------------

/** Reads the projection schema stamp, treating an absent stamp as version 0. */
export function readPublicProjectionSchemaVersion(candidate: {
  readonly publicProjectionSchemaVersion?: number;
}): number {
  const version = candidate.publicProjectionSchemaVersion;
  return typeof version === "number" && Number.isFinite(version)
    ? version
    : LEGACY_PUBLIC_PROJECTION_SCHEMA_VERSION;
}

/**
 * True for a document written before schema 2. A legacy document that cannot
 * render on its own is allowed the `sourceRef` fallback during the compatibility
 * window; a schema-2 document is not.
 */
export function isLegacyPublicDocument(candidate: {
  readonly publicProjectionSchemaVersion?: number;
}): boolean {
  return (
    readPublicProjectionSchemaVersion(candidate) <
    PUBLIC_PROJECTION_SCHEMA_VERSION
  );
}

/** True for a document that carries the current projection schema stamp. */
export function isCurrentPublicProjection(candidate: {
  readonly publicProjectionSchemaVersion?: number;
}): boolean {
  return !isLegacyPublicDocument(candidate);
}

/**
 * What a reader should do with a document.
 *
 * - `current` — schema 2 and self-contained. Render from the projection.
 * - `invariant-violation` — schema 2 but NOT self-contained. Report it and
 *   exclude it from Browse. Do not fall back to `sourceRef`: fetching the owner
 *   source would hide new drift, which is the whole point of the stamp.
 * - `legacy-self-contained` — pre-schema-2 but carries composition. Render it;
 *   no fallback needed, so no fallback metric.
 * - `legacy-fallback` — pre-schema-2 and incomplete. The temporary `sourceRef`
 *   fallback is allowed; record a metric for every hit.
 * - `invalid` — failed wire validation. Not "legacy": a document missing `id`,
 *   `ownerId`, or `sourceRef` is broken in a way no fallback repairs.
 */
export type PublicSequenceDocumentDisposition =
  | "current"
  | "invariant-violation"
  | "legacy-self-contained"
  | "legacy-fallback"
  | "invalid";

export interface PublicSequenceDocumentClassification {
  readonly disposition: PublicSequenceDocumentDisposition;
  readonly schemaVersion: number;
  readonly legacy: boolean;
  readonly selfContainment: PublicProjectionSelfContainmentReport;
  /** Null only when `disposition` is `invalid`. */
  readonly projection: PublicSequenceProjection | null;
  /** Wire-validation issues. Empty unless `disposition` is `invalid`. */
  readonly issues: readonly string[];
}

const NO_SELF_CONTAINMENT: PublicProjectionSelfContainmentReport = {
  selfContained: false,
  blocking: [],
  advisory: [],
};

/**
 * Validate, convert, and decide in one call. This is what a reader migrating off
 * a bare cast should use.
 */
export function classifyPublicSequenceDocument(
  raw: unknown,
  id?: string
): PublicSequenceDocumentClassification {
  const parsed = parsePublicSequenceWireDocument(raw, id);
  if (!parsed.ok) {
    return {
      disposition: "invalid",
      schemaVersion: LEGACY_PUBLIC_PROJECTION_SCHEMA_VERSION,
      legacy: false,
      selfContainment: NO_SELF_CONTAINMENT,
      projection: null,
      issues: parsed.issues,
    };
  }

  const projection = toPublicSequenceProjection(parsed.document);
  const selfContainment = checkPublicProjectionSelfContainment(projection);
  const schemaVersion = readPublicProjectionSchemaVersion(projection);
  const legacy = schemaVersion < PUBLIC_PROJECTION_SCHEMA_VERSION;

  const disposition: PublicSequenceDocumentDisposition = legacy
    ? selfContainment.selfContained
      ? "legacy-self-contained"
      : "legacy-fallback"
    : selfContainment.selfContained
      ? "current"
      : "invariant-violation";

  return {
    disposition,
    schemaVersion,
    legacy,
    selfContainment,
    projection,
    issues: [],
  };
}

// ---------------------------------------------------------------------------
// Migration targets (Phase 2+, deliberately NOT wired up here)
// ---------------------------------------------------------------------------
//
// Ad-hoc date converters to retire in favour of `toApplicationDate`:
//   - public-sequences-loader.ts:385-402  private toDate()
//   - collection-firestore-mapper.ts:56-64 exported toDate() — also drop its
//     `new Date()` fallback, which fabricates a timestamp on failure
//   - gallery-offline-cache.ts:20-35      timestampToIso() — keep the ISO
//     rewrite for the IndexedDB round trip, but source it from this converter
//
// Bare casts to replace with `classifyPublicSequenceDocument`:
//   - public-sequences-loader.ts:267,271  `docSnap.data() as PublicSequenceIndex`
//   - public-sequences-loader.ts:301-306  the `displayName`/`components`/
//     `componentDomains`/`isCircular` narrowing cast
//   - public-sequence-hash-matcher.ts:51  `{ id, ...doc.data() } as PublicSequenceIndex`
//   - collection-firestore-mapper.ts:196  swap `LibrarySequenceDocSchema` for
//     `PublicSequenceWireSchema` on the publicSequences read
//   - offline-cache-types.ts:10-17        `GalleryCacheEntry.data` should carry
//     `PublicSequenceWireDocument`, whose ISO-string dates this schema accepts

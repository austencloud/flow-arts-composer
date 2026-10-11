/**
 * public-sequence-persister — atomic persistence for the public-sequence
 * aggregate: public projection, hash claim, and owner projection stamps.
 *
 * Parity-repair spec sections 6 (transaction) and 8 (hash claim). The previous
 * writer read the prior document and ran a `where("contentHash","==")` preflight
 * OUTSIDE the write, so two clients could interleave between read and write:
 * both observe "no duplicate", both `setDoc`. `runTransaction` closes that —
 * Firestore's serializable transactions force the losing writer to re-run its
 * callback against the winner's committed state. Same proven pattern as
 * `ShortCodeManager`'s `shortcodeHashes` allocation (short-code-manager.ts:658).
 *
 * ## Claim semantics vs shortcodes
 *
 * `publicSequenceHashes/{contentHashVersion}_{contentHash}` — one claim per
 * distinct movement identity. A shortcode loser can ADOPT the winner's code
 * (same immutable payload); a sequence publisher cannot adopt another owner's
 * sequence id, so a claim held by a different sequence is a typed
 * `PublicDuplicateError` and the transaction commits nothing. The claim id
 * embeds the hash version so a future hash-basis rollout cannot confuse values
 * computed under different bases.
 *
 * ## Transaction discipline
 *
 * The callback may run more than once under contention. Everything is derived
 * from `tx.get` reads inside the callback — no outer captures leak between
 * runs. All reads precede all writes (Firestore requirement). The digest await
 * (`buildPublicSequenceProjection`) sits between the last read and the first
 * write, which is legal; it only widens the contention window by milliseconds.
 *
 * Client transactions FAIL OFFLINE by design — publication is an online act.
 * Private saves keep their offline-capable batched path; the Dexie-first save
 * plus `library-sync-retry.ts` queue a public intent for retry when offline.
 *
 * ## What stays outside (spec section 10)
 *
 * Artifact fan-out (`publicHandPaths`, `publicSoloProps`), Browse-cache
 * injection, moderation, and context preparation (tags, encoder hash, loop
 * detection) all remain the caller's job — they are either unbounded writes or
 * reads that must not extend the transaction.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  deleteField,
  where,
  type Firestore,
} from "firebase/firestore";

import {
  buildPublicSequenceProjection,
  type ExistingPublicOwnedFields,
  type ProjectionSourceSequence,
  type PublicProjectionContext,
  type PublicProjectionPriorState,
  type PublicProjectionTimestamp,
} from "#lib/shared/library/services/public-sequence-projection.js";
import { computeStoredProjectionDigest } from "#lib/shared/library/services/public-sequence-projection.js";
import { PUBLIC_PROJECTION_SCHEMA_VERSION } from "#lib/shared/foundation/domain/models/public-sequence-wire-schema.js";
import type { NormalizedSequenceWrite } from "#lib/shared/library/services/sequence-persistence-normalizer.js";
import {
  getPublicSequencePath,
  getSequenceRevisionPath,
  getUserCollectionPath,
  getUserSequencePath,
} from "#lib/shared/library/data/firestore-paths.js";
import { buildSequenceRevisionRecord } from "#lib/shared/library/services/sequence-revision.js";
import type { ArtifactRevisionRef } from "#lib/shared/artifact-revisions/domain/artifact-revision.js";

// Claims

export const PUBLIC_SEQUENCE_HASH_COLLECTION = "publicSequenceHashes";

export interface PublicSequenceHashClaim {
  readonly sequenceId: string;
  readonly ownerId: string;
  readonly contentHash: string;
  readonly contentHashVersion: number;
  readonly createdAt: unknown;
}

/** `{contentHashVersion}_{contentHash}` — version first so bases never mix. */
export function publicSequenceClaimId(
  contentHashVersion: number,
  contentHash: string
): string {
  return `${contentHashVersion}_${contentHash}`;
}

/**
 * Another owner's public sequence already claims this exact movement identity.
 * Typed so the retry layer can classify it as a user-action state, never a
 * background retry (spec section 6).
 */
export class PublicDuplicateError extends Error {
  readonly code = "PUBLIC_DUPLICATE" as const;
  constructor(
    readonly claimedBySequenceId: string,
    readonly claimedByOwnerId: string,
    readonly claimedWord: string | undefined
  ) {
    super(
      `This exact sequence already exists in the gallery` +
        (claimedWord ? ` (published as "${claimedWord}")` : "")
    );
    this.name = "PublicDuplicateError";
  }
}

// ---------------------------------------------------------------------------
// Prior-state extraction
// ---------------------------------------------------------------------------

/**
 * Extract the public-owned fields of an existing `publicSequences/{id}`
 * document for the projection builder's prior state.
 *
 * Type-guarded rather than cast: a legacy document can carry anything, and a
 * malformed counter must read as "absent" (builder seeds it) rather than
 * poison the projection. Timestamps pass through as wire values — the builder
 * never inspects them, it only decides which field gets which value, and
 * writing a read Firestore `Timestamp` back is value-identical.
 */
export function readExistingPublicOwnedFields(
  data: Record<string, unknown>
): ExistingPublicOwnedFields {
  const finiteNumber = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const forkCount = finiteNumber(data["forkCount"]);
  const viewCount = finiteNumber(data["viewCount"]);
  const starCount = finiteNumber(data["starCount"]);
  const rawPublicPerformanceCount = finiteNumber(
    data["publicPerformanceCount"]
  );
  const publicPerformanceCount =
    rawPublicPerformanceCount !== undefined &&
    Number.isInteger(rawPublicPerformanceCount) &&
    rawPublicPerformanceCount >= 0
      ? rawPublicPerformanceCount
      : undefined;
  const publicProjectionRevision = finiteNumber(
    data["publicProjectionRevision"]
  );
  const publicProjectionDigest =
    typeof data["publicProjectionDigest"] === "string"
      ? data["publicProjectionDigest"]
      : undefined;

  return {
    ...(data["publishedAt"] != null && {
      publishedAt: data["publishedAt"] as PublicProjectionTimestamp,
    }),
    ...(data["updatedAt"] != null && {
      updatedAt: data["updatedAt"] as PublicProjectionTimestamp,
    }),
    ...(forkCount !== undefined && { forkCount }),
    ...(viewCount !== undefined && { viewCount }),
    ...(starCount !== undefined && { starCount }),
    ...(publicPerformanceCount !== undefined && { publicPerformanceCount }),
    ...(data["latestPublicPerformanceAt"] != null && {
      latestPublicPerformanceAt: data[
        "latestPublicPerformanceAt"
      ] as PublicProjectionTimestamp,
    }),
    ...(publicProjectionRevision !== undefined && { publicProjectionRevision }),
    ...(publicProjectionDigest !== undefined && { publicProjectionDigest }),
  };
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export interface PublishPublicSequenceResult {
  readonly revision: number;
  readonly digest: string;
  readonly firstPublication: boolean;
  readonly subjectRevision: ArtifactRevisionRef;
}

/**
 * Atomically publish (or republish) a sequence's public projection.
 *
 * One transaction, per spec section 6:
 *   reads  — public doc, hash claim, owner doc, stale claim (when the hash moved)
 *   writes — public projection (full set), claim create (when new identity),
 *            stale-claim delete (only when PROVEN owned by this sequence),
 *            owner projection stamps (revision/schema/digest + the normalized
 *            word/length/hash pair, so owner and mirror cannot disagree)
 *
 * Duplicate → throws {@link PublicDuplicateError}, commits nothing.
 * Owner doc absent → stamps are skipped, not invented; the publish itself
 * still lands (migration tooling projects sequences whose owner docs it is
 * separately repairing).
 *
 * @throws {PublicDuplicateError} when another sequence owns this content hash.
 */
export async function publishPublicSequence(
  firestore: Firestore,
  normalized: NormalizedSequenceWrite<ProjectionSourceSequence>,
  context: Omit<PublicProjectionContext, "now">,
  userId: string
): Promise<PublishPublicSequenceResult> {
  const sequenceId = normalized.ownerData.id;
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));
  const ownerRef = doc(firestore, getUserSequencePath(userId, sequenceId));
  const claimId = publicSequenceClaimId(
    normalized.contentHashVersion,
    normalized.contentHash
  );
  const claimRef = doc(firestore, PUBLIC_SEQUENCE_HASH_COLLECTION, claimId);

  return runTransaction(firestore, async (tx) => {
    // Everything below derives from this run's reads — nothing survives a
    // contention re-run (short-code-manager.ts:658 discipline).
    const publicSnap = await tx.get(publicRef);
    const claimSnap = await tx.get(claimRef);
    const ownerSnap = await tx.get(ownerRef);

    if (claimSnap.exists()) {
      const claim = claimSnap.data() as PublicSequenceHashClaim;
      if (claim.sequenceId !== sequenceId) {
        // A publisher cannot adopt another owner's sequence id, so unlike the
        // shortcode race there is no adoption path. Read the winner's word for
        // the user-facing message (still a read — no writes have happened).
        const winnerSnap = await tx.get(
          doc(firestore, getPublicSequencePath(claim.sequenceId))
        );
        const winnerWord = winnerSnap.exists()
          ? (winnerSnap.data() as { word?: string }).word
          : undefined;
        throw new PublicDuplicateError(
          claim.sequenceId,
          claim.ownerId,
          winnerWord
        );
      }
    }

    const publicData = publicSnap.exists()
      ? (publicSnap.data() as Record<string, unknown>)
      : undefined;
    const prior: PublicProjectionPriorState = publicData
      ? { kind: "existing", fields: readExistingPublicOwnedFields(publicData) }
      : { kind: "first-publication" };

    // Stale-claim cleanup: when the stored document carries a DIFFERENT hash
    // than the one being published, its old claim is released — but only after
    // this transaction PROVES the old claim belongs to this sequence (spec
    // section 6, step 10). Read before any write.
    let staleClaimRef: ReturnType<typeof doc> | null = null;
    const oldHash = publicData?.["contentHash"];
    const oldVersion = publicData?.["contentHashVersion"];
    if (
      typeof oldHash === "string" &&
      typeof oldVersion === "number" &&
      publicSequenceClaimId(oldVersion, oldHash) !== claimId
    ) {
      const candidateRef = doc(
        firestore,
        PUBLIC_SEQUENCE_HASH_COLLECTION,
        publicSequenceClaimId(oldVersion, oldHash)
      );
      const staleSnap = await tx.get(candidateRef);
      if (
        staleSnap.exists() &&
        (staleSnap.data() as PublicSequenceHashClaim).sequenceId === sequenceId
      ) {
        staleClaimRef = candidateRef;
      }
    }

    const revision =
      prior.kind === "existing"
        ? (prior.fields.publicProjectionRevision ?? 0) + 1
        : 1;

    const projection = await buildPublicSequenceProjection(
      normalized,
      { ...context, now: serverTimestamp() },
      revision,
      prior
    );
    const retainedRevision = await buildSequenceRevisionRecord(
      projection,
      serverTimestamp()
    );
    const retainedRevisionRef = doc(
      firestore,
      getSequenceRevisionPath(retainedRevision.revisionId)
    );
    const retainedRevisionSnap = await tx.get(retainedRevisionRef);
    if (retainedRevisionSnap.exists()) {
      const existingRevision = retainedRevisionSnap.data() as Record<
        string,
        unknown
      >;
      if (
        existingRevision["sequenceId"] !== sequenceId ||
        existingRevision["contentDigest"] !== retainedRevision.contentDigest
      ) {
        throw new Error(
          "Sequence revision id is already bound to another payload"
        );
      }
    }

    // --- writes (no reads past this point) ---------------------------------
    tx.set(publicRef, projection as unknown as Record<string, unknown>);

    if (!retainedRevisionSnap.exists()) {
      tx.set(
        retainedRevisionRef,
        retainedRevision as unknown as Record<string, unknown>
      );
    }

    if (!claimSnap.exists()) {
      const claim: PublicSequenceHashClaim = {
        sequenceId,
        ownerId: userId,
        contentHash: normalized.contentHash,
        contentHashVersion: normalized.contentHashVersion,
        createdAt: serverTimestamp(),
      };
      tx.set(claimRef, claim as unknown as Record<string, unknown>);
    }

    if (staleClaimRef) {
      tx.delete(staleClaimRef);
    }

    if (ownerSnap.exists()) {
      tx.update(ownerRef, {
        publicProjectionRevision: projection.publicProjectionRevision,
        publicProjectionSchemaVersion: projection.publicProjectionSchemaVersion,
        publicProjectionDigest: projection.publicProjectionDigest,
        word: normalized.exactWord,
        sequenceLength: normalized.sequenceLength,
        contentHash: normalized.contentHash,
        contentHashVersion: normalized.contentHashVersion,
      });
    }

    return {
      revision: projection.publicProjectionRevision,
      digest: projection.publicProjectionDigest,
      firstPublication: prior.kind === "first-publication",
      subjectRevision: {
        artifactId: retainedRevision.artifactId,
        revisionId: retainedRevision.revisionId,
        contentDigest: retainedRevision.contentDigest,
        digestAlgorithm: retainedRevision.digestAlgorithm,
        digestVersion: retainedRevision.digestVersion,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Unpublish
// ---------------------------------------------------------------------------

export type UnpublishPublicSequenceResult =
  | { readonly status: "unpublished" }
  /** No public document existed — nothing to remove, treated as success. */
  | { readonly status: "absent" };

/**
 * Atomically remove a sequence's public presence: public document, its owned
 * hash claim (proven by `claim.sequenceId`), and the owner document's
 * projection stamps. Owner id comes from the stored public document, so
 * callers that only know the sequence id (recycle bin, batch delete) need no
 * signature change.
 *
 * Owner VISIBILITY is not touched here — the owner document's `visibility`
 * field is the caller's domain (a private re-save has already written it; a
 * delete flow is about to remove the whole document).
 */
export async function unpublishPublicSequence(
  firestore: Firestore,
  sequenceId: string
): Promise<UnpublishPublicSequenceResult> {
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));

  return runTransaction(firestore, async (tx) => {
    const publicSnap = await tx.get(publicRef);
    if (!publicSnap.exists()) {
      return { status: "absent" as const };
    }
    const data = publicSnap.data() as Record<string, unknown>;

    // Owner stamps: cleared when the owner document still exists. It may not
    // (delete flows remove the owner first) — that is fine, not an error.
    let ownerRef: ReturnType<typeof doc> | null = null;
    let ownerData: Record<string, unknown> | undefined;
    const ownerId = data["ownerId"];
    if (typeof ownerId === "string" && ownerId.length > 0) {
      const candidateRef = doc(
        firestore,
        getUserSequencePath(ownerId, sequenceId)
      );
      const ownerSnap = await tx.get(candidateRef);
      if (ownerSnap.exists()) {
        ownerRef = candidateRef;
        ownerData = ownerSnap.data() as Record<string, unknown>;
      }
    }

    // Release every claim proven owned by this sequence. A stale mirror can
    // carry a DIFFERENT hash pair than the owner document, so both pairs are
    // candidates; legacy documents (no contentHash) contribute none.
    const ownedClaims = await collectOwnedClaimRefs(tx, firestore, sequenceId, [
      data,
      ownerData,
    ]);

    // --- writes -------------------------------------------------------------
    tx.delete(publicRef);
    for (const claimRef of ownedClaims) tx.delete(claimRef);
    if (ownerRef) {
      tx.update(ownerRef, {
        publicProjectionRevision: deleteField(),
        publicProjectionSchemaVersion: deleteField(),
        publicProjectionDigest: deleteField(),
      });
    }

    return { status: "unpublished" as const };
  });
}

// ---------------------------------------------------------------------------
// Delete / soft delete (spec section 7)
// ---------------------------------------------------------------------------

type DocRef = ReturnType<typeof doc>;

/**
 * Collect claim refs PROVEN to belong to this sequence, from every candidate
 * hash pair the stored documents carry. The public doc and the owner doc can
 * disagree on the hash (a stale mirror), in which case BOTH claims may be owned
 * by this sequence and both must be released. A claim whose `sequenceId` points
 * elsewhere, or whose owner differs from `expectedOwnerId`, is never touched.
 * Reads only — call before any write.
 */
async function collectOwnedClaimRefs(
  tx: { get: (ref: DocRef) => Promise<{ exists(): boolean; data(): unknown }> },
  firestore: Firestore,
  sequenceId: string,
  sources: ReadonlyArray<Record<string, unknown> | undefined>,
  expectedOwnerId?: string
): Promise<DocRef[]> {
  const candidateIds = new Set<string>();
  for (const source of sources) {
    const hash = source?.["contentHash"];
    const version = source?.["contentHashVersion"];
    if (typeof hash === "string" && typeof version === "number") {
      candidateIds.add(publicSequenceClaimId(version, hash));
    }
  }

  const owned: DocRef[] = [];
  for (const claimId of candidateIds) {
    const candidateRef = doc(
      firestore,
      PUBLIC_SEQUENCE_HASH_COLLECTION,
      claimId
    );
    const claimSnap = await tx.get(candidateRef);
    const claim = claimSnap.exists()
      ? (claimSnap.data() as PublicSequenceHashClaim)
      : undefined;
    if (
      claim?.sequenceId === sequenceId &&
      (!expectedOwnerId || claim.ownerId === expectedOwnerId)
    ) {
      owned.push(candidateRef);
    }
  }
  return owned;
}

export interface DeleteSequenceCompletelyResult {
  readonly ownerDeleted: boolean;
  readonly publicDeleted: boolean;
  readonly claimsDeleted: number;
  readonly collectionsUpdated: number;
}

/**
 * Hard-delete a sequence's entire persisted presence in one transaction:
 * owner document, public mirror (if any — regardless of what the owner's
 * `visibility` field claims, so existing drift gets cleaned rather than
 * preserved), and every hash claim proven owned by this sequence.
 *
 * Callers own the profile `sequenceCount` decrement: that counter is a
 * denormalized display value, not an invariant participant, and folding it
 * into every per-sequence transaction would put N concurrent transactions in
 * contention on the same `users/{uid}` document. Batch callers decrement once
 * with the count of owner docs actually deleted.
 */
export async function deleteSequenceCompletely(
  firestore: Firestore,
  userId: string,
  sequenceId: string
): Promise<DeleteSequenceCompletelyResult> {
  const ownerRef = doc(firestore, getUserSequencePath(userId, sequenceId));
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));

  return runTransaction(firestore, async (tx) => {
    const ownerSnap = await tx.get(ownerRef);
    const publicSnap = await tx.get(publicRef);
    const ownerData = ownerSnap.exists()
      ? (ownerSnap.data() as Record<string, unknown>)
      : undefined;
    const publicData = publicSnap.exists()
      ? (publicSnap.data() as Record<string, unknown>)
      : undefined;
    const publicOwnedByUser = publicData?.["ownerId"] === userId;

    const ownedClaims = await collectOwnedClaimRefs(
      tx,
      firestore,
      sequenceId,
      [publicOwnedByUser ? publicData : undefined, ownerData],
      userId
    );
    const collectionIds = Array.isArray(ownerData?.["collectionIds"])
      ? [
          ...new Set(
            (ownerData["collectionIds"] as unknown[]).filter(
              (id): id is string => typeof id === "string" && id.length > 0
            )
          ),
        ]
      : [];
    const collectionEntries = await Promise.all(
      collectionIds.map(async (collectionId) => {
        const ref = doc(firestore, getUserCollectionPath(userId, collectionId));
        return { ref, snapshot: await tx.get(ref) };
      })
    );

    // --- writes -------------------------------------------------------------
    if (ownerSnap.exists()) tx.delete(ownerRef);
    if (publicOwnedByUser) tx.delete(publicRef);
    for (const claimRef of ownedClaims) tx.delete(claimRef);
    let collectionsUpdated = 0;
    for (const { ref, snapshot } of collectionEntries) {
      if (!snapshot.exists()) continue;
      const data = snapshot.data() as Record<string, unknown>;
      const sequenceIds = Array.isArray(data["sequenceIds"])
        ? (data["sequenceIds"] as unknown[]).filter(
            (id): id is string => typeof id === "string"
          )
        : [];
      if (!sequenceIds.includes(sequenceId)) continue;
      const remainingIds = sequenceIds.filter((id) => id !== sequenceId);
      tx.update(ref, {
        sequenceIds: remainingIds,
        sequenceCount: remainingIds.length,
        updatedAt: serverTimestamp(),
      });
      collectionsUpdated++;
    }

    return {
      ownerDeleted: ownerSnap.exists(),
      publicDeleted: publicOwnedByUser,
      claimsDeleted: ownedClaims.length,
      collectionsUpdated,
    };
  });
}

export type SoftDeleteSequenceEverywhereResult =
  | { readonly status: "soft-deleted"; readonly publicRemoved: boolean }
  /** No owner document — nothing to mark; the caller decides how to report. */
  | { readonly status: "owner-missing" };

/**
 * Soft delete in one transaction (spec section 7): mark the owner
 * `isDeleted: true`, clear its public projection stamps, and remove the public
 * mirror and owned claim. The owner's `visibility` field is deliberately left
 * alone — a soft-deleted record is not publicly eligible regardless of stored
 * visibility, and restore uses that field to know the record WAS public so it
 * can rerun the full publish pipeline.
 */
export async function softDeleteSequenceEverywhere(
  firestore: Firestore,
  userId: string,
  sequenceId: string
): Promise<SoftDeleteSequenceEverywhereResult> {
  const ownerRef = doc(firestore, getUserSequencePath(userId, sequenceId));
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));

  return runTransaction(firestore, async (tx) => {
    const ownerSnap = await tx.get(ownerRef);
    if (!ownerSnap.exists()) {
      return { status: "owner-missing" as const };
    }
    const ownerData = ownerSnap.data() as Record<string, unknown>;
    const publicSnap = await tx.get(publicRef);
    const publicData = publicSnap.exists()
      ? (publicSnap.data() as Record<string, unknown>)
      : undefined;

    const ownedClaims = await collectOwnedClaimRefs(tx, firestore, sequenceId, [
      publicData,
      ownerData,
    ]);

    // --- writes -------------------------------------------------------------
    tx.update(ownerRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      publicProjectionRevision: deleteField(),
      publicProjectionSchemaVersion: deleteField(),
      publicProjectionDigest: deleteField(),
    });
    if (publicSnap.exists()) tx.delete(publicRef);
    for (const claimRef of ownedClaims) tx.delete(claimRef);

    return {
      status: "soft-deleted" as const,
      publicRemoved: publicSnap.exists(),
    };
  });
}

// ---------------------------------------------------------------------------
// Thumbnails (narrow patch)
// ---------------------------------------------------------------------------

export type UpdatePublicThumbnailsResult =
  | { readonly status: "updated" }
  | { readonly status: "absent" };

/**
 * Patch a completed background thumbnail without replaying a full sequence
 * snapshot that may already be stale (spec section 6). For a schema-2 document
 * the projection digest and revision are restamped from the PATCHED stored
 * document (`computeStoredProjectionDigest`), and the owner document's stamp
 * copies move with them so owner/mirror parity holds. Legacy documents get the
 * plain patch — they have no stamps to maintain.
 *
 * Also self-heals a missing claim: a schema-2 document published before the
 * claim collection existed gains its claim here, so the phase 4 strict rules
 * cannot strand it.
 */
export async function updatePublicThumbnails(
  firestore: Firestore,
  sequenceId: string,
  thumbnails: readonly string[],
  thumbnailLimit = 3
): Promise<UpdatePublicThumbnailsResult> {
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));
  const publicThumbnails = thumbnails.slice(0, thumbnailLimit);

  return runTransaction(firestore, async (tx) => {
    const publicSnap = await tx.get(publicRef);
    if (!publicSnap.exists()) {
      return { status: "absent" as const };
    }
    const data = publicSnap.data() as Record<string, unknown>;
    const isSchemaTwo =
      data["publicProjectionSchemaVersion"] ===
      PUBLIC_PROJECTION_SCHEMA_VERSION;

    if (!isSchemaTwo) {
      tx.update(publicRef, {
        thumbnails: publicThumbnails,
        updatedAt: serverTimestamp(),
      });
      return { status: "updated" as const };
    }

    // Claim self-heal read (before writes).
    let missingClaimRef: ReturnType<typeof doc> | null = null;
    const hash = data["contentHash"];
    const version = data["contentHashVersion"];
    if (typeof hash === "string" && typeof version === "number") {
      const candidateRef = doc(
        firestore,
        PUBLIC_SEQUENCE_HASH_COLLECTION,
        publicSequenceClaimId(version, hash)
      );
      const claimSnap = await tx.get(candidateRef);
      if (!claimSnap.exists()) {
        missingClaimRef = candidateRef;
      }
    }

    // Owner stamp parity read (before writes).
    let ownerRef: ReturnType<typeof doc> | null = null;
    const ownerId = data["ownerId"];
    if (typeof ownerId === "string" && ownerId.length > 0) {
      const candidateRef = doc(
        firestore,
        getUserSequencePath(ownerId, sequenceId)
      );
      const ownerSnap = await tx.get(candidateRef);
      if (ownerSnap.exists()) {
        ownerRef = candidateRef;
      }
    }

    const patched = { ...data, thumbnails: publicThumbnails };
    const digest = await computeStoredProjectionDigest(patched);
    const revision =
      digest === data["publicProjectionDigest"]
        ? ((data["publicProjectionRevision"] as number | undefined) ?? 1)
        : ((data["publicProjectionRevision"] as number | undefined) ?? 0) + 1;

    // --- writes -------------------------------------------------------------
    tx.update(publicRef, {
      thumbnails: publicThumbnails,
      updatedAt: serverTimestamp(),
      publicProjectionDigest: digest,
      publicProjectionRevision: revision,
    });
    if (
      missingClaimRef &&
      typeof hash === "string" &&
      typeof version === "number"
    ) {
      const claim: PublicSequenceHashClaim = {
        sequenceId,
        ownerId: String(data["ownerId"] ?? ""),
        contentHash: hash,
        contentHashVersion: version,
        createdAt: serverTimestamp(),
      };
      tx.set(missingClaimRef, claim as unknown as Record<string, unknown>);
    }
    if (ownerRef) {
      tx.update(ownerRef, {
        publicProjectionDigest: digest,
        publicProjectionRevision: revision,
      });
    }

    return { status: "updated" as const };
  });
}

// ---------------------------------------------------------------------------
// Owner profile projection (narrow patch)
// ---------------------------------------------------------------------------

export interface PublicSequenceOwnerProfile {
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export interface RefreshPublicSequenceOwnerProfileResult {
  readonly scanned: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
}

type UpdatePublicSequenceOwnerProfileResult =
  | { readonly status: "updated" }
  | { readonly status: "unchanged" }
  | { readonly status: "absent" };

const PROFILE_PROJECTION_CONCURRENCY = 4;

/**
 * Refresh the denormalized owner name and avatar on every public sequence the
 * user currently owns.
 *
 * Profile changes are a fan-out boundary: one user document can own any
 * number of public sequences, so they cannot share one bounded Firestore
 * transaction. Each sequence instead gets the same narrow transaction shape
 * as thumbnail completion: patch the stored schema-2 projection, recompute
 * its digest, and move the owner document's matching stamps in the same
 * commit. Retrying the whole fan-out is safe because unchanged projections do
 * not write or increment their revision.
 */
export async function refreshPublicSequenceOwnerProfile(
  firestore: Firestore,
  ownerId: string,
  profile: PublicSequenceOwnerProfile
): Promise<RefreshPublicSequenceOwnerProfileResult> {
  const snapshot = await getDocs(
    query(
      collection(firestore, "publicSequences"),
      where("ownerId", "==", ownerId)
    )
  );
  const sequenceIds = snapshot.docs
    .filter((document) => {
      const data = document.data() as Record<string, unknown>;
      const avatarUnchanged =
        profile.avatarUrl === undefined
          ? data["ownerAvatarUrl"] === undefined
          : data["ownerAvatarUrl"] === profile.avatarUrl;
      return (
        data["ownerDisplayName"] !== profile.displayName || !avatarUnchanged
      );
    })
    .map((document) => document.id);
  let updated = 0;
  let unchanged = snapshot.docs.length - sequenceIds.length;
  let skipped = 0;

  for (
    let index = 0;
    index < sequenceIds.length;
    index += PROFILE_PROJECTION_CONCURRENCY
  ) {
    const chunk = sequenceIds.slice(
      index,
      index + PROFILE_PROJECTION_CONCURRENCY
    );
    const results = await Promise.all(
      chunk.map((sequenceId) =>
        updatePublicSequenceOwnerProfile(
          firestore,
          ownerId,
          sequenceId,
          profile
        )
      )
    );
    for (const result of results) {
      if (result.status === "updated") updated += 1;
      if (result.status === "unchanged") unchanged += 1;
      if (result.status === "absent") skipped += 1;
    }
  }

  return { scanned: snapshot.docs.length, updated, unchanged, skipped };
}

async function updatePublicSequenceOwnerProfile(
  firestore: Firestore,
  ownerId: string,
  sequenceId: string,
  profile: PublicSequenceOwnerProfile
): Promise<UpdatePublicSequenceOwnerProfileResult> {
  const publicRef = doc(firestore, getPublicSequencePath(sequenceId));
  const ownerRef = doc(firestore, getUserSequencePath(ownerId, sequenceId));

  return runTransaction(firestore, async (tx) => {
    const publicSnap = await tx.get(publicRef);
    const ownerSnap = await tx.get(ownerRef);
    if (!publicSnap.exists() || !ownerSnap.exists()) {
      return { status: "absent" as const };
    }

    const data = publicSnap.data() as Record<string, unknown>;
    const ownerData = ownerSnap.data() as Record<string, unknown>;
    if (
      data["ownerId"] !== ownerId ||
      ownerData["visibility"] !== "public" ||
      data["publicProjectionSchemaVersion"] !== PUBLIC_PROJECTION_SCHEMA_VERSION
    ) {
      return { status: "absent" as const };
    }

    const storedAvatar = data["ownerAvatarUrl"];
    const avatarUnchanged =
      profile.avatarUrl === undefined
        ? storedAvatar === undefined
        : storedAvatar === profile.avatarUrl;
    if (data["ownerDisplayName"] === profile.displayName && avatarUnchanged) {
      return { status: "unchanged" as const };
    }

    const patched: Record<string, unknown> = {
      ...data,
      ownerDisplayName: profile.displayName,
    };
    if (profile.avatarUrl === undefined) {
      delete patched["ownerAvatarUrl"];
    } else {
      patched["ownerAvatarUrl"] = profile.avatarUrl;
    }

    const digest = await computeStoredProjectionDigest(patched);
    const revision =
      ((data["publicProjectionRevision"] as number | undefined) ?? 0) + 1;

    tx.update(publicRef, {
      ownerDisplayName: profile.displayName,
      ownerAvatarUrl: profile.avatarUrl ?? deleteField(),
      updatedAt: serverTimestamp(),
      publicProjectionDigest: digest,
      publicProjectionRevision: revision,
    });
    tx.update(ownerRef, {
      publicProjectionDigest: digest,
      publicProjectionRevision: revision,
    });

    return { status: "updated" as const };
  });
}

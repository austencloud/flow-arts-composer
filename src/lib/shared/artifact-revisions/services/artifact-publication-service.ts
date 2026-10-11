import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadString,
} from "firebase/storage";
import {
  getFirestoreInstance,
  getStorageInstance,
} from "#lib/shared/auth/firebase.js";
import { stripUndefined } from "#lib/shared/firestore/firestore-helpers.js";
import {
  ARTIFACT_PUBLICATION_SCHEMA_VERSION,
  publicationRequestId,
  type ArtifactPublicationRequest,
  type ArtifactPublicationStatus,
  type PublicArtifactEnvelope,
  type PublicArtifactRevisionRecord,
  type PublicArtifactType,
} from "../domain/public-artifact";
import {
  ARTIFACT_PUBLICATION_REQUESTS_COLLECTION,
  getArtifactPublicationRequestPath,
  getPublicArtifactPath,
  getPublicArtifactRevisionPath,
  publicArtifactPosterStoragePath,
} from "../data/artifact-publication-paths";
import type { ArtifactRevisionRef } from "../domain/artifact-revision";

/**
 * The owner-side publication boundary, shared by every artifact type.
 *
 * Publish-first: "Share publicly" makes the work live immediately — the ledger
 * entry, the immutable public revision, and the guest envelope land in one
 * batch whose shape firestore.rules verifies field by field. Moderation is a
 * retroactive takedown (artifact-publication-review.ts), and content it removed
 * can never be republished as-is.
 *
 * Everything type-specific lives in the caller's adapter: which private
 * revision provides provenance, how the sanitized public payload is built and
 * content-addressed, and how the discovery poster is produced. This service
 * owns only what is identical across types — the four-resource transaction, the
 * idempotency rules, and the lifecycle summary.
 */

export interface PublicationOwner {
  readonly uid: string;
  readonly displayName: string;
}

/** A sanitized, content-addressed payload ready to go public. */
export interface PublicRevisionInput<P> extends ArtifactRevisionRef {
  readonly payload: P;
}

export interface PublishArtifactInput<P> {
  readonly artifactId: string;
  readonly artifactType: PublicArtifactType;
  readonly title: string;
  /** Provenance: the exact PRIVATE revision this public payload came from. */
  readonly sourceRevision: ArtifactRevisionRef;
  readonly publicRevision: PublicRevisionInput<P>;
  /**
   * Produces the discovery poster as a data URL. Called lazily and only when
   * this revision has no poster in Storage yet, so republishing already-posted
   * content never pays to re-render it.
   */
  readonly posterDataUrl?: () => string | Promise<string>;
}

export type PublishArtifactResult =
  | { readonly status: "published"; readonly revisionId: string }
  | { readonly status: "already-live"; readonly revisionId: string }
  /** This exact content was taken down by moderation — edit to republish. */
  | { readonly status: "removed"; readonly revisionId: string };

export interface ArtifactPublicationSummary {
  /** The lifecycle of the artifact's CURRENT content, plus whether an older
   *  revision is still live publicly. */
  readonly state: ArtifactPublicationStatus | "unpublished";
  /** Live public revision id, when an envelope exists. */
  readonly liveRevisionId?: string;
  /** True when the live envelope shows an older revision than the work's
   *  current content — "publish update" territory. */
  readonly liveIsStale?: boolean;
  /** Public revision id of the work's current content. */
  readonly currentPublicRevisionId?: string;
}

async function uploadPublicPoster(
  owner: PublicationOwner,
  artifactId: string,
  publicRevisionId: string,
  posterDataUrl: string
): Promise<string> {
  const storage = await getStorageInstance();
  const target = storageRef(
    storage,
    publicArtifactPosterStoragePath(owner.uid, artifactId, publicRevisionId)
  );
  await uploadString(target, posterDataUrl, "data_url", {
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });
  return getDownloadURL(target);
}

/**
 * Publish the work's current content — live immediately. Idempotent per
 * content: the ledger id is `{artifactId}_{publicRevisionId}`, so publishing
 * identical content converges on the existing entry (and relists it when it
 * was previously withdrawn).
 */
export async function publishArtifact<P>(
  input: PublishArtifactInput<P>,
  owner: PublicationOwner
): Promise<PublishArtifactResult> {
  const { artifactId, artifactType, title, sourceRevision, publicRevision } =
    input;
  const requestId = publicationRequestId(artifactId, publicRevision.revisionId);
  const firestore = await getFirestoreInstance();
  const requestRef = doc(
    firestore,
    getArtifactPublicationRequestPath(requestId)
  );
  const envelopeRef = doc(firestore, getPublicArtifactPath(artifactId));
  const [existing, envelopeSnap] = await Promise.all([
    getDoc(requestRef),
    getDoc(envelopeRef),
  ]);

  const existingStatus = existing.exists()
    ? ((existing.data() as { status?: string }).status ?? "")
    : null;

  if (existingStatus === "removed") {
    // Moderation takedown is terminal for this exact content. Changed work
    // produces a new revision id and therefore a fresh ledger entry.
    return { status: "removed", revisionId: publicRevision.revisionId };
  }

  const liveRevisionId = envelopeSnap.exists()
    ? ((envelopeSnap.data() as { currentRevisionId?: string })
        .currentRevisionId ?? undefined)
    : undefined;
  const alreadyLive =
    existingStatus === "published" &&
    liveRevisionId === publicRevision.revisionId;

  // A publish is always an explicit owner action, so the poster is re-rendered
  // every time rather than reused off the ledger. That is what lets an improved
  // renderer heal an already-public preview; reuse meant the only way to replace
  // a bad poster was to unpublish the work. The Storage path carries the render
  // version, so re-rendering identical content with the same renderer overwrites
  // in place and costs one upload.
  const existingPosterUrl = existing.exists()
    ? ((existing.data() as { posterUrl?: string }).posterUrl ?? undefined)
    : undefined;
  let posterUrl = existingPosterUrl;
  if (input.posterDataUrl) {
    const posterDataUrl = await input.posterDataUrl();
    if (posterDataUrl) {
      posterUrl = await uploadPublicPoster(
        owner,
        artifactId,
        publicRevision.revisionId,
        posterDataUrl
      );
    }
  }

  if (alreadyLive && posterUrl === existingPosterUrl) {
    return { status: "already-live", revisionId: publicRevision.revisionId };
  }

  const batch = writeBatch(firestore);

  if (existingStatus === "withdrawn") {
    // Relist: only status/requestedAt are mutable on the ledger entry.
    batch.update(requestRef, {
      status: "published",
      requestedAt: serverTimestamp(),
    });
  } else if (existingStatus === "published") {
    // A superseded ledger entry the owner is reverting to — already
    // `published`, so only the envelope needs to advance back to it. Writing
    // it again would be a published-to-published transition, which the state
    // machine denies.
  } else {
    const request: ArtifactPublicationRequest<P> = {
      requestId,
      artifactId,
      artifactType,
      ownerId: owner.uid,
      ownerDisplayName: owner.displayName,
      title,
      revisionId: publicRevision.revisionId,
      contentDigest: publicRevision.contentDigest,
      digestAlgorithm: publicRevision.digestAlgorithm,
      digestVersion: publicRevision.digestVersion,
      payload: publicRevision.payload,
      ...(posterUrl !== undefined && { posterUrl }),
      sourceRevision,
      status: "published",
      requestedAt: serverTimestamp(),
      schemaVersion: ARTIFACT_PUBLICATION_SCHEMA_VERSION,
    };
    batch.set(requestRef, stripUndefined({ ...request }));

    const revisionRecord: PublicArtifactRevisionRecord<P> = {
      artifactId,
      revisionId: publicRevision.revisionId,
      contentDigest: publicRevision.contentDigest,
      digestAlgorithm: publicRevision.digestAlgorithm,
      digestVersion: publicRevision.digestVersion,
      artifactType,
      ownerId: owner.uid,
      payload: publicRevision.payload,
      createdAt: serverTimestamp(),
      schemaVersion: ARTIFACT_PUBLICATION_SCHEMA_VERSION,
    };
    batch.set(
      doc(
        firestore,
        getPublicArtifactRevisionPath(artifactId, publicRevision.revisionId)
      ),
      stripUndefined({ ...revisionRecord })
    );
  }

  const envelope: PublicArtifactEnvelope = {
    artifactId,
    artifactType,
    ownerId: owner.uid,
    ownerDisplayName: owner.displayName,
    title,
    ...(posterUrl !== undefined && { posterUrl }),
    currentRevisionId: publicRevision.revisionId,
    currentContentDigest: publicRevision.contentDigest,
    // First publish stamps publishedAt; later revisions preserve it (the
    // rules enforce equality on update).
    publishedAt: envelopeSnap.exists()
      ? (envelopeSnap.data() as { publishedAt?: unknown }).publishedAt
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
    schemaVersion: ARTIFACT_PUBLICATION_SCHEMA_VERSION,
  };
  batch.set(envelopeRef, stripUndefined({ ...envelope }));

  await batch.commit();
  return {
    status: alreadyLive ? "already-live" : "published",
    revisionId: publicRevision.revisionId,
  };
}

async function loadOwnerRequests(
  firestore: Firestore,
  artifactId: string,
  ownerId: string
) {
  const snapshot = await getDocs(
    query(
      collection(firestore, ARTIFACT_PUBLICATION_REQUESTS_COLLECTION),
      where("artifactId", "==", artifactId),
      where("ownerId", "==", ownerId)
    )
  );
  return snapshot.docs;
}

/**
 * Withdraw the artifact from public view: delete the envelope (delisting the
 * guest projection and, through the rules cascade, guest revision reads) and
 * mark the live ledger entries withdrawn in the same batch.
 */
export async function withdrawArtifactPublication(
  artifactId: string,
  owner: PublicationOwner
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const envelopeRef = doc(firestore, getPublicArtifactPath(artifactId));
  const envelope = await getDoc(envelopeRef);
  const requests = await loadOwnerRequests(firestore, artifactId, owner.uid);

  const batch = writeBatch(firestore);
  if (envelope.exists()) {
    batch.delete(envelopeRef);
  }
  for (const request of requests) {
    const status = (request.data() as { status?: string }).status;
    if (status === "published") {
      batch.update(request.ref, { status: "withdrawn" });
    }
  }
  await batch.commit();
}

/** Owner-facing lifecycle summary for one artifact's publication controls. */
export async function getArtifactPublicationSummary(
  artifactId: string,
  currentPublicRevisionId: string,
  owner: PublicationOwner
): Promise<ArtifactPublicationSummary> {
  const firestore = await getFirestoreInstance();
  const envelopeRef = doc(firestore, getPublicArtifactPath(artifactId));
  const [envelope, requests] = await Promise.all([
    getDoc(envelopeRef),
    loadOwnerRequests(firestore, artifactId, owner.uid),
  ]);

  const liveRevisionId = envelope.exists()
    ? ((envelope.data() as { currentRevisionId?: string }).currentRevisionId ??
      undefined)
    : undefined;
  const current = requests.find(
    (request) =>
      (request.data() as { revisionId?: string }).revisionId ===
      currentPublicRevisionId
  );
  const currentStatus = current
    ? ((current.data() as { status?: string }).status as
        | ArtifactPublicationStatus
        | undefined)
    : undefined;

  return {
    // `state` describes the work's CURRENT content. A live envelope showing an
    // older revision surfaces via liveRevisionId + liveIsStale instead.
    state: currentStatus ?? "unpublished",
    ...(liveRevisionId !== undefined && { liveRevisionId }),
    ...(liveRevisionId !== undefined && {
      liveIsStale: liveRevisionId !== currentPublicRevisionId,
    }),
    currentPublicRevisionId,
  };
}

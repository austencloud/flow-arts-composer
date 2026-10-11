import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import {
  isPublicArtifactEnvelope,
  type PublicArtifactEnvelope,
  type PublicArtifactRevisionRecord,
  type PublicArtifactType,
} from "../domain/public-artifact";
import {
  PUBLIC_ARTIFACTS_COLLECTION,
  getPublicArtifactPath,
  getPublicArtifactRevisionPath,
} from "../data/artifact-publication-paths";

/**
 * Guest-side reads of the approved projection. No authentication required:
 * envelopes exist only in approved state, and revision reads are gated by the
 * envelope's existence in the rules, so this loader can never surface
 * unapproved or withdrawn content by construction.
 */

const DEFAULT_LIST_LIMIT = 60;

export async function listPublicArtifacts(
  artifactType: PublicArtifactType,
  max: number = DEFAULT_LIST_LIMIT
): Promise<PublicArtifactEnvelope[]> {
  const firestore = await getFirestoreInstance();
  const snapshot = await getDocs(
    query(
      collection(firestore, PUBLIC_ARTIFACTS_COLLECTION),
      where("artifactType", "==", artifactType),
      orderBy("publishedAt", "desc"),
      limitTo(max)
    )
  );
  return snapshot.docs
    .map((document) => document.data())
    .filter(isPublicArtifactEnvelope);
}

export async function listPublicArtifactsByOwner(
  artifactType: PublicArtifactType,
  ownerId: string,
  max: number = DEFAULT_LIST_LIMIT
): Promise<PublicArtifactEnvelope[]> {
  const firestore = await getFirestoreInstance();
  const snapshot = await getDocs(
    query(
      collection(firestore, PUBLIC_ARTIFACTS_COLLECTION),
      where("artifactType", "==", artifactType),
      where("ownerId", "==", ownerId),
      limitTo(max)
    )
  );
  return snapshot.docs
    .map((document) => document.data())
    .filter(isPublicArtifactEnvelope);
}

export interface PublicArtifactDetail<P = unknown> {
  readonly envelope: PublicArtifactEnvelope;
  readonly revision: PublicArtifactRevisionRecord<P>;
}

/** Envelope plus its current immutable payload, or null when not published. */
export async function getPublicArtifactDetail<P = unknown>(
  artifactId: string
): Promise<PublicArtifactDetail<P> | null> {
  const firestore = await getFirestoreInstance();
  const envelopeSnap = await getDoc(
    doc(firestore, getPublicArtifactPath(artifactId))
  );
  if (!envelopeSnap.exists()) return null;
  const envelope = envelopeSnap.data();
  if (!isPublicArtifactEnvelope(envelope)) return null;

  const revisionSnap = await getDoc(
    doc(
      firestore,
      getPublicArtifactRevisionPath(artifactId, envelope.currentRevisionId)
    )
  );
  if (!revisionSnap.exists()) return null;
  return {
    envelope,
    revision: revisionSnap.data() as PublicArtifactRevisionRecord<P>,
  };
}

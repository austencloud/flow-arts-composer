import { doc, getDoc } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { getPublicSequencePath } from "#lib/shared/library/data/firestore-paths.js";
import type { ArtifactRevisionRef } from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import { createSequenceRevisionRef } from "./sequence-revision";

/** Resolve the retained subject identity from the canonical public projection. */
export async function getCurrentSequenceRevisionRef(
  sequenceId: string
): Promise<ArtifactRevisionRef | null> {
  const firestore = await getFirestoreInstance();
  const snapshot = await getDoc(
    doc(firestore, getPublicSequencePath(sequenceId))
  );
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, unknown>;
  const contentHash = data["contentHash"];
  const contentHashVersion = data["contentHashVersion"];
  if (
    typeof contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(contentHash) ||
    typeof contentHashVersion !== "number"
  ) {
    return null;
  }
  return createSequenceRevisionRef(sequenceId, contentHash, contentHashVersion);
}

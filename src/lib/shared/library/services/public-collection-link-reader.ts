/**
 * Resolve one collection share code through Firestore's REST transport.
 *
 * `collectionLinks/{code}` is world-readable and carries only the owner and
 * collection ids, so the resolver route can read it unauthenticated with a
 * plain fetch and no Firebase SDK on the server.
 */

import {
  fromFirestoreFields,
  type FirestoreFields,
} from "#lib/shared/firestore/firestore-value-codec.js";
import { COLLECTION_LINKS_COLLECTION } from "../domain/collection-share-code.js";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const DEFAULT_PROJECT_ID = "the-kinetic-alphabet";

export interface PublicCollectionLink {
  readonly ownerId: string;
  readonly collectionId: string;
}

interface PublicCollectionLinkReadOptions {
  projectId?: string;
  timeoutMs?: number;
}

/**
 * Returns null for an unknown or malformed record and throws only for
 * transport or server failures, so the caller can turn one into a 404 and
 * the other into a 5xx.
 */
export async function fetchPublicCollectionLink(
  code: string,
  options: PublicCollectionLinkReadOptions = {}
): Promise<PublicCollectionLink | null> {
  const mask = ["ownerId", "collectionId"]
    .map((path) => `mask.fieldPaths=${encodeURIComponent(path)}`)
    .join("&");
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID;
  const url =
    `${FIRESTORE_HOST}/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${COLLECTION_LINKS_COLLECTION}/${encodeURIComponent(code)}?${mask}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 2_500),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Firestore REST returned ${response.status} ${response.statusText}`
    );
  }

  const doc = (await response.json()) as { fields?: FirestoreFields };
  const decoded = fromFirestoreFields(doc.fields ?? {});
  const ownerId = decoded["ownerId"];
  const collectionId = decoded["collectionId"];

  return typeof ownerId === "string" &&
    ownerId.length > 0 &&
    typeof collectionId === "string" &&
    collectionId.length > 0
    ? { ownerId, collectionId }
    : null;
}

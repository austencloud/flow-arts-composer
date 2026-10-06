import {
  fromFirestoreFields,
  type FirestoreFields,
} from "$lib/shared/firestore/firestore-value-codec";
import { getPublicSequencesPath } from "$lib/shared/library/data/firestore-paths";
import type { PublicSequenceIndex } from "$lib/shared/foundation/domain/models/public-sequence-index";

const FIRESTORE_HOST = "https://firestore.googleapis.com/v1";
const PROJECT_ID = "the-kinetic-alphabet";

interface RunQueryRow {
  document?: { name?: string; fields?: FirestoreFields };
}

export interface PublicSequenceIndexDoc {
  readonly id: string;
  readonly data: PublicSequenceIndex;
}

/**
 * Read the first public index entries by word through Firestore's REST
 * transport, without the Firestore SDK.
 *
 * A page that only shows a few community cards must not start the SDK: it
 * opens IndexedDB persistence and Listen channels whose handlers held the
 * /composer main thread for 70-115 ms at a time. The public index is
 * world-readable, so one query answers it. Throws on a transport or server
 * failure so the caller can fall back to its saved catalog.
 */
export async function fetchPublicSequenceIndexPage(
  pageSize: number,
  timeoutMs = 6_000
): Promise<PublicSequenceIndexDoc[]> {
  const response = await fetch(
    `${FIRESTORE_HOST}/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: getPublicSequencesPath() }],
          orderBy: [{ field: { fieldPath: "word" }, direction: "ASCENDING" }],
          limit: pageSize,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Public sequence query returned ${response.status} ${response.statusText}`
    );
  }

  // An empty result is a single row with no document.
  const rows = (await response.json()) as RunQueryRow[];
  return rows.flatMap(({ document }) => {
    const id = document?.name?.split("/").pop();
    if (!id || !document?.fields) return [];
    const data = fromFirestoreFields(document.fields);
    return [{ id, data: { ...data, id } as unknown as PublicSequenceIndex }];
  });
}

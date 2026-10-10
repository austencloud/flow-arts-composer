import {
  readFirestoreString,
  type FirestoreRest,
} from "#lib/server/firestore/firestore-rest.js";
import { physicalCardPropCandidate } from "#lib/shared/qr/services/physical-card-props.js";
import type { ScanPropCandidate } from "#lib/shared/qr/services/scan-prop-resolver.js";

const PHYSICAL_CARD_PROPS_MASK = [
  "shortCode",
  "leftPropType",
  "rightPropType",
] as const;

/**
 * The props stored on `physicalCards/{id}` at issue time. Null when the card
 * does not exist, belongs to another code, or was issued without props.
 * Reads only the three fields it needs; nothing else on the record leaves the
 * server.
 */
export async function readPhysicalCardProps(
  firestore: Pick<FirestoreRest, "getDocument">,
  shortCode: string,
  physicalCardId: string
): Promise<ScanPropCandidate | null> {
  const document = await firestore.getDocument(
    `physicalCards/${physicalCardId}`,
    PHYSICAL_CARD_PROPS_MASK
  );
  if (!document) return null;
  if (readFirestoreString(document, "shortCode") !== shortCode) return null;
  return physicalCardPropCandidate(
    readFirestoreString(document, "leftPropType"),
    readFirestoreString(document, "rightPropType")
  );
}

/**
 * readPhysicalCardProps for a page render: bounded and never throwing, so a
 * slow or failed read degrades to the shortcode's props instead of a stuck
 * or broken scan.
 */
export async function readPhysicalCardPropsWithin(
  getFirestore: () => Pick<FirestoreRest, "getDocument">,
  shortCode: string,
  physicalCardId: string,
  timeoutMs: number
): Promise<ScanPropCandidate | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readPhysicalCardProps(getFirestore(), shortCode, physicalCardId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(
            `[physical-card-props] lookup for ${physicalCardId} timed out after ${timeoutMs} ms`
          );
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error(
      `[physical-card-props] lookup for ${physicalCardId} failed:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

import { hashPrivateValue } from "#lib/server/firestore/firestore-rest.js";

export interface ScanEventIdentityInput {
  shortCode: string;
  physicalCardId: string | null;
  deviceHash: string;
  day: string;
  city: string | null;
  country: string | null;
}

/**
 * One device, card, day, and coarse place produces one event document.
 *
 * Retries and repeated scans at the same stop converge on the same ID. Moving
 * the card to another city on the same day still creates a new location fact.
 */
export async function createScanEventId(
  input: ScanEventIdentityInput
): Promise<string> {
  const digest = await hashPrivateValue(
    [
      input.shortCode,
      input.physicalCardId ?? "legacy",
      input.deviceHash,
      input.day,
      input.city ?? "",
      input.country ?? "",
    ].join("|")
  );
  return digest.slice(0, 32);
}

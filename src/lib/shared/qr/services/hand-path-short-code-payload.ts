import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isHandPathSequence } from "$lib/shared/foundation/domain/models/sequence-kind";
import { encodeSequenceForQR } from "$lib/shared/navigation/services/sequence-encoder";
import {
  choreographyDigest,
  verifyEncodedChoreography,
} from "./choreography-fidelity";
import type { ShortCodeData } from "./types";

/** A stored loss reason is a diagnostic, not payload. */
const MAX_LOSS_REASON_LENGTH = 200;

export const HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION = 4;

/**
 * Shared by interactive sharing and the Admin deck release, with no Firebase
 * dependency. Always carries the embedded sequence copy; carries `encoded`
 * only when it decodes to exactly the same hand paths.
 */
export async function buildHandPathShortCodePayload(
  sequence: SequenceData
): Promise<ShortCodeData> {
  if (!isHandPathSequence(sequence) || sequence.steps.length === 0) {
    throw new Error("A hand-path QR requires a nonempty hand-path sequence.");
  }
  const title = sequence.displayName || sequence.name || "Hand path";
  // The embedded copy below is the authoritative payload. The compact blob is
  // stored only when an offline decode of it plays the same hand paths field
  // by field (pro and anti with no rotation share one wire token), because the
  // offline snapshot serves the blob alone.
  const encoded = await encodeSequenceForQR(sequence);
  const fidelity = await verifyEncodedChoreography(encoded, sequence);
  const blob: Partial<ShortCodeData> = fidelity.exact
    ? { encoded, encodedFidelity: "exact" }
    : {
        encodedFidelity: "lossy",
        encodedLossReason: fidelity.reason.slice(0, MAX_LOSS_REASON_LENGTH),
      };
  return {
    // Empty legacy word aliases prevent older readers treating the title as TKA.
    sequence: "",
    sequenceName: "",
    payloadWord: "",
    payloadKind: "hand-path",
    payloadTitle: title,
    payloadSchemaVersion: HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION,
    payloadStepCount: sequence.steps.length,
    sequenceId: sequence.id,
    sourceSequenceId: sequence.id,
    ...(sequence.ownerId && { ownerId: sequence.ownerId }),
    createdAt: new Date().toISOString(),
    createdBy: "system",
    scanCount: 0,
    payloadDigest: await choreographyDigest(sequence),
    ...blob,
    sequenceData: JSON.parse(
      JSON.stringify({
        id: sequence.id,
        name: title,
        sequenceKind: "hand-path",
        steps: sequence.steps,
        startPlacement: sequence.startPlacement,
        gridMode: sequence.gridMode,
        isCircular: sequence.isCircular,
        notes: sequence.notes,
        word: "",
        displayName: title,
        metadata: { isHandPathVisualization: true },
      })
    ),
  };
}

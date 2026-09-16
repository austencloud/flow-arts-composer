import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isHandPathSequence } from "$lib/shared/foundation/domain/models/sequence-kind";
import {
  encodeSequenceForQR,
  decodeSequenceFromQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import type { ShortCodeData } from "./types";

export const HAND_PATH_SHORTCODE_PAYLOAD_SCHEMA_VERSION = 4;

/** Shared by interactive sharing and the Admin deck release, with no Firebase dependency. */
export async function buildHandPathShortCodePayload(
  sequence: SequenceData
): Promise<ShortCodeData> {
  if (!isHandPathSequence(sequence) || sequence.steps.length === 0) {
    throw new Error("A hand-path QR requires a nonempty hand-path sequence.");
  }
  const title = sequence.displayName || sequence.name || "Hand path";
  const encoded = await encodeSequenceForQR(sequence);
  const decoded = await decodeSequenceFromQR(encoded);
  if (
    !isHandPathSequence(decoded) ||
    decoded.steps.length !== sequence.steps.length
  ) {
    throw new Error("Hand-path QR failed its encode/decode check.");
  }
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
    encoded,
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

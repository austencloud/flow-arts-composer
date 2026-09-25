/**
 * Self-contained short-code payload hydration.
 *
 * This module deliberately has no Firebase, browser, analytics, or snapshot
 * dependencies. Both the browser resolver and `/q/[code]` server load use it,
 * so a public record is decoded exactly once and with identical parity checks.
 */

import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  motionHandForAuthoredHand,
  getSequenceMotionProfile,
} from "$lib/shared/foundation/services/sequence-motion-profile";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "$lib/shared/foundation/services/sequence-decomposer";
import { soloPropToSequence } from "$lib/shared/foundation/services/solo-prop-sequence-adapter";
import { hashSoloProp } from "$lib/shared/foundation/services/content-hasher";
import { decodeSequenceFromQR } from "$lib/shared/navigation/services/sequence-encoder";
import { graftPrefloatFromEmbedded } from "./prefloat-graft";
import type { ShortCodeData } from "./types";

/** Strict payload-derived word schema. */
export const SHORTCODE_PAYLOAD_SCHEMA_VERSION = 2;
/** First-class solo choreography schema. */
export const SOLO_SHORTCODE_PAYLOAD_SCHEMA_VERSION = 3;

/**
 * The word to stamp onto a decoded word payload.
 *
 * Oldest records stored either the human word or the encoded blob in
 * `sequence`; separators distinguish the latter so it never leaks into UI.
 */
export function shortCodeImportedWord(data: ShortCodeData): string {
  const candidate =
    data.payloadWord || data.sequenceName || data.sequence || "";
  if (!candidate || candidate.includes("|") || candidate.includes(":")) {
    return "";
  }
  return candidate;
}

export function shortCodeSoloTitle(data: ShortCodeData): string {
  return (
    data.payloadTitle ||
    data.sequenceName ||
    data.sequence ||
    `${data.authoredHand === "right" ? "Right" : "Left"}-hand choreography`
  );
}

function ownerFieldsFromRecord(
  data: ShortCodeData
): Pick<SequenceData, "ownerId" | "ownerDisplayName"> {
  return {
    ...(data.ownerId && { ownerId: data.ownerId }),
    ...(data.ownerDisplayName && { ownerDisplayName: data.ownerDisplayName }),
  };
}

/**
 * Decode the normalized word blob and conservatively restore mint-time
 * prefloat testimony from its embedded companion.
 */
export async function decodeWordShortCodePayload(
  code: string,
  data: ShortCodeData
): Promise<SequenceData | null> {
  // A blob that failed the mint-time round trip is never played. New lossy
  // records store no blob at all; this guards any record that carries both.
  if (!data.encoded || data.encodedFidelity === "lossy") return null;

  try {
    const decoded = graftPrefloatFromEmbedded(
      await decodeSequenceFromQR(data.encoded),
      data.sequenceData
    );
    const word = shortCodeImportedWord(data);
    return {
      ...decoded,
      id: code,
      ...ownerFieldsFromRecord(data),
      ...(word && { word, name: word }),
    } as SequenceData;
  } catch {
    return null;
  }
}

/**
 * Last-resort legacy embed path. The shared sequence hydrator must run after
 * this function before the result is rendered.
 */
export function hydrateEmbeddedWordShortCodePayload(
  code: string,
  data: ShortCodeData
): SequenceData | null {
  if (!data.sequenceData) return null;

  const embedded = createSequenceData({
    ...data.sequenceData,
    id: code,
    ...ownerFieldsFromRecord(data),
  });
  if (
    embedded.steps.length === 0 ||
    (data.payloadStepCount !== undefined &&
      embedded.steps.length !== data.payloadStepCount)
  ) {
    return null;
  }

  const word = shortCodeImportedWord(data) || embedded.word;
  return {
    ...embedded,
    ...(word && { word, name: word }),
  };
}

export async function verifyEncodedSoloPayload(
  encoded: string,
  expectedContentHash: string,
  expectedStepCount: number,
  authoredHand: "left" | "right",
  sourceSoloPropId: string,
  code: string
): Promise<SequenceData | null> {
  const decoded = await decodeSequenceFromQR(encoded);
  const profile = getSequenceMotionProfile(decoded);
  const expectedHand = motionHandForAuthoredHand(authoredHand);
  if (
    profile.kind !== "solo" ||
    profile.hand !== expectedHand ||
    decoded.steps.length !== expectedStepCount
  ) {
    return null;
  }

  const extracted =
    expectedHand === "left"
      ? extractLeftSoloProp(decoded)
      : extractRightSoloProp(decoded);
  if (extracted.contentHash !== expectedContentHash) return null;

  const normalized = soloPropToSequence(
    {
      ...extracted,
      id: sourceSoloPropId,
      contentHash: expectedContentHash,
      authoredHand,
    },
    authoredHand
  );
  return {
    ...normalized,
    id: code,
    word: "",
    metadata: {
      ...normalized.metadata,
      artifactKind: "solo-prop",
      authoredHand,
      soloPropContentHash: expectedContentHash,
    },
  };
}

/**
 * Hydrate and verify a schema-3 solo payload from either its encoded form or
 * canonical embedded solo prop.
 */
export async function hydrateSoloShortCodePayload(
  code: string,
  data: ShortCodeData
): Promise<SequenceData | null> {
  if (
    data.payloadSchemaVersion !== SOLO_SHORTCODE_PAYLOAD_SCHEMA_VERSION ||
    !data.payloadTitle ||
    !data.payloadContentHash ||
    !data.payloadStepCount ||
    data.payloadWord !== undefined ||
    data.sequenceData !== undefined ||
    (data.authoredHand !== "left" && data.authoredHand !== "right")
  ) {
    return null;
  }

  if (data.encoded) {
    try {
      const decoded = await verifyEncodedSoloPayload(
        data.encoded,
        data.payloadContentHash,
        data.payloadStepCount,
        data.authoredHand,
        data.sourceSoloPropId ?? `shortcode-${code}`,
        code
      );
      if (decoded) {
        const title = shortCodeSoloTitle(data);
        return {
          ...decoded,
          name: title,
          displayName: title,
          metadata: {
            ...decoded.metadata,
            ...(data.sourceSoloPropId && {
              sourceSoloPropId: data.sourceSoloPropId,
            }),
          },
        };
      }
    } catch {
      // Fall through to the canonical embedded solo prop.
    }
  }

  const soloData = data.soloData;
  if (
    !soloData ||
    !Array.isArray(soloData.steps) ||
    soloData.steps.length !== data.payloadStepCount ||
    (data.sourceSoloPropId !== undefined &&
      soloData.id !== data.sourceSoloPropId) ||
    soloData.authoredHand !== data.authoredHand ||
    hashSoloProp(soloData) !== data.payloadContentHash
  ) {
    return null;
  }

  const title = shortCodeSoloTitle(data);
  const sequence = soloPropToSequence(
    {
      ...soloData,
      // Same identity as the blob path: an artifact that was never saved has
      // no library id a recipient could reference.
      id: data.sourceSoloPropId ?? `shortcode-${code}`,
      contentHash: data.payloadContentHash,
      name: title,
      authoredHand: data.authoredHand,
    },
    data.authoredHand,
    data.sourceSoloPropId
      ? { sourceSoloPropId: data.sourceSoloPropId }
      : undefined
  );
  return { ...sequence, id: code };
}

/**
 * Resolve only data already present in a public short-code record. No lookup
 * ladder, storage SDK, or user document is consulted.
 */
export async function hydrateSelfContainedShortCodePayload(
  code: string,
  data: ShortCodeData
): Promise<SequenceData | null> {
  if (data.payloadKind === "hand-path") {
    const sequence =
      hydrateEmbeddedWordShortCodePayload(code, data) ??
      (await decodeWordShortCodePayload(code, data));
    if (
      !sequence ||
      sequence.sequenceKind !== "hand-path" ||
      sequence.steps.length !== data.payloadStepCount
    )
      return null;
    const title = data.payloadTitle || sequence.displayName || sequence.name;
    return withRecordIdentity(
      { ...sequence, word: "", name: title, displayName: title },
      data
    );
  }
  if (data.payloadKind === "solo") {
    return hydrateSoloShortCodePayload(code, data);
  }

  // The embedded copy is the sequence exactly as it existed when the link was
  // created. Prefer it whenever it is complete; the compact blob deliberately
  // omits fields that can be derived later, and displaying that lean form can
  // make a valid saved sequence look unnamed or non-circular.
  const sequence =
    hydrateEmbeddedWordShortCodePayload(code, data) ??
    (await decodeWordShortCodePayload(code, data));
  return sequence && withRecordIdentity(sequence, data);
}

/**
 * A record minted from a saved sequence names that document in `sequenceId`.
 * The viewer keys performances, and anything else attached to the sequence, by
 * its id, so a played copy must carry the document's id rather than the code;
 * otherwise every short-code visit reads and writes attachments under the code.
 * Records without a source document keep the code as their only identity.
 */
function withRecordIdentity(
  sequence: SequenceData,
  data: ShortCodeData
): SequenceData {
  return data.sequenceId ? { ...sequence, id: data.sequenceId } : sequence;
}

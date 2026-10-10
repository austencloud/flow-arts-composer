/**
 * Server-side preparation for the QR scan viewer.
 *
 * A public short-code record already contains everything needed to hydrate the
 * sequence. Doing that work on the server lets the browser start the complete
 * viewer without repeating shortcode resolution or sequence hydration.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { loopDetector } from "#lib/shared/create/services/loop-detector.js";
import {
  decodeSequenceFromQR,
  isInlineEncoded,
} from "#lib/shared/navigation/services/sequence-encoder.js";
import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
import { hydrateSelfContainedShortCodePayload } from "#lib/shared/qr/services/short-code-payload-hydrator.js";
import type { ShortCodeData } from "#lib/shared/qr/services/types.js";
import {
  resolveScanPropConfig,
  type ScanPropCandidate,
  type ScanPropConfig,
} from "#lib/shared/qr/services/scan-prop-resolver.js";

export interface PreparedScanViewerPayload {
  sequence: SequenceData;
  propConfig: ScanPropConfig;
}

async function resolveSelfContainedSequence(
  code: string,
  record: ShortCodeData | null
): Promise<SequenceData | null> {
  if (record) {
    return hydrateSelfContainedShortCodePayload(code, record);
  }
  if (!isInlineEncoded(code)) return null;

  try {
    return await decodeSequenceFromQR(code);
  } catch {
    return null;
  }
}

/**
 * Decode and hydrate a self-contained scan payload before it reaches the
 * browser. Legacy records return null and keep the browser lookup fallback.
 */
export async function prepareScanViewerPayload(
  code: string,
  record: ShortCodeData | null,
  ...scanCandidates: readonly (ScanPropCandidate | null | undefined)[]
): Promise<PreparedScanViewerPayload | null> {
  const decoded = await resolveSelfContainedSequence(code, record);
  if (!decoded) return null;

  const sequence = await hydrateSequence(decoded, { loopDetector });
  if (!sequence.steps?.length) return null;

  return {
    sequence,
    propConfig: resolveScanPropConfig(sequence, ...scanCandidates, record),
  };
}

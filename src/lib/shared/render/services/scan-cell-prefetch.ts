/**
 * Start a scanned card's picture downloads during "Loading sequence…".
 *
 * A cold scan used to request the card's cells only after the viewer had
 * mounted, the card had laid out and its local picture cache had answered,
 * about two seconds after the scan page knew the sequence. The scan page
 * already holds the sequence and its props, so it derives the same canonical
 * hashes the card will ask for and starts those downloads at once. The card's
 * own `download` calls then pick up the bytes (pictograph-cloud-cache.ts).
 *
 * Nothing new is fetched: these are the card's own objects, one request each,
 * started earlier. A hash that differs from the card's is a wasted request,
 * never a wrong picture, because the card still asks by its own hash.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { deriveCloudCellHash } from "#lib/shared/render/services/cloud-cell-key.js";
import { prefetch } from "#lib/shared/render/services/pictograph-cloud-cache.js";
import { getCanonicalSequenceCells } from "#lib/shared/render/services/warm-sequence-cells.js";
import { markScan } from "#lib/shared/analytics/scan-perf.js";

export interface ScanCellProps {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
}

export async function prefetchScanCardCells(
  sequence: SequenceData,
  props: ScanCellProps
): Promise<void> {
  markScan("cell-prefetch-start");
  // Scan cards render dark by default, which is what a first visit shows.
  const cells = getCanonicalSequenceCells(sequence, { isDark: true, ...props });
  await Promise.all(
    cells.map(async ({ data, options }) =>
      prefetch(await deriveCloudCellHash(data, true, options))
    )
  );
}

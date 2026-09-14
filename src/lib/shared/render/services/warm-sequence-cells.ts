/**
 * Ensure every pictograph used by a scannable card exists in the canonical
 * cloud cell store. QR generation uses strict verification; library saves and
 * admin backfills can inspect the same structured result without duplicating
 * the render/hash contract.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { renderCell } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import {
  CANONICAL_CELL_SIZE,
  CANONICAL_CARD_VISIBILITY,
  deriveCloudCellHash,
} from "$lib/shared/render/services/cloud-cell-key";
import * as pictographCloudCache from "$lib/shared/render/services/pictograph-cloud-cache";
import { startPositionDeriver } from "$lib/shared/pictograph/shared/services/start-position-deriver";
import { detectMixedDurations } from "$lib/shared/choreo-card/services/step-durations";
import { getSequenceMotionVisibility } from "$lib/shared/foundation/services/sequence-motion-profile";

export interface WarmOptions {
  /** Scan cards render dark by default. */
  isDark?: boolean;
  leftPropType?: PropType;
  rightPropType?: PropType;
  catDogMode?: boolean;
  /** Participating-hand visibility. Defaults to the sequence's motion profile. */
  showLeftMotion?: boolean;
  showRightMotion?: boolean;
  /** Throw unless every canonical object already exists or uploads successfully. */
  requireComplete?: boolean;
  /** Stop starting more cell work when the requesting render is obsolete. */
  signal?: AbortSignal;
  /** Reports completed cloud checks/renders to an outer inactivity deadline. */
  onActivity?: () => void;
}

export interface WarmCellFailure {
  cell: "start" | number;
  reason: string;
}

export interface WarmSequenceCellsResult {
  total: number;
  ready: number;
  hashes: readonly string[];
  failures: readonly WarmCellFailure[];
}

export class IncompleteCellWarmError extends Error {
  constructor(readonly result: WarmSequenceCellsResult) {
    super(
      `Canonical scan assets incomplete: ${result.ready}/${result.total} ready`
    );
    this.name = "IncompleteCellWarmError";
  }
}

// A full legacy backfill walks thousands of shortcode records that collapse to
// a much smaller set of canonical pictographs. Once a strict warm has rendered
// and uploaded a hash, keep that proof for the rest of the browser
// session. Concurrent sequences that share a cell also join the same promise,
// so the worker pool never rasterizes an identical canonical object twice.
const verifiedCloudHashes = new Set<string>();
const pendingVerifiedWarms = new Map<string, Promise<void>>();

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException("Aborted", "AbortError");
}

async function renderCanonicalCell(
  data: PictographData,
  cell: "start" | number,
  isDark: boolean,
  renderOptions: PreviewCellRenderOptions,
  hash: string,
  verifyUpload: boolean,
  signal?: AbortSignal
): Promise<void> {
  // Most cards collapse onto pictographs that a previous card already
  // uploaded. Successful uploads and reads both register positive existence in
  // the cloud-cache owner. That proof lets QR preparation skip an entire image
  // download before rendering and another after upload.
  if (verifyUpload && pictographCloudCache.isCellKnownAvailable(hash)) return;

  // Unknown hashes are expected writer misses. Render and upload them without
  // issuing a public GET that would produce a browser-visible 404. Scanner
  // reads still probe directly after publication has guaranteed availability.
  if (verifyUpload) {
    const stored = await pictographCloudCache.download(hash, {
      probeUnknown: false,
      signal,
    });
    throwIfAborted(signal);
    if (stored) return;
  }

  let url: string | null = null;
  try {
    url = await renderCell(
      data,
      cell === "start" ? undefined : cell,
      isDark,
      renderOptions
    );

    if (verifyUpload && !pictographCloudCache.isCellKnownAvailable(hash)) {
      throw new Error("canonical object upload did not complete");
    }
  } finally {
    if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
  }
}

async function ensureVerifiedCanonicalCell(
  data: PictographData,
  cell: "start" | number,
  isDark: boolean,
  renderOptions: PreviewCellRenderOptions,
  hash: string,
  signal?: AbortSignal
): Promise<void> {
  if (verifiedCloudHashes.has(hash)) return;

  let pending = pendingVerifiedWarms.get(hash);
  if (!pending) {
    pending = renderCanonicalCell(
      data,
      cell,
      isDark,
      renderOptions,
      hash,
      true
    ).then(() => {
      verifiedCloudHashes.add(hash);
    });
    pendingVerifiedWarms.set(hash, pending);

    const clearPending = (): void => {
      if (pendingVerifiedWarms.get(hash) === pending) {
        pendingVerifiedWarms.delete(hash);
      }
    };
    // Register both outcomes so cleanup never creates a detached rejected
    // promise. Every caller still awaits `pending` and receives the failure.
    void pending.then(clearPending, clearPending);
  }

  await pending;
  // Shared same-hash work belongs to every current caller, so one thumbnail's
  // cancellation must not abort the core promise for the others. Stop this
  // consumer after the shared result settles instead.
  throwIfAborted(signal);
}

export function getCanonicalSequenceCells(
  sequence: SequenceData,
  opts: WarmOptions = {}
) {
  const leftProp = opts.leftPropType;
  const motionVisibility = getSequenceMotionVisibility(sequence);
  const renderOptions: PreviewCellRenderOptions = {
    ...CANONICAL_CARD_VISIBILITY,
    size: CANONICAL_CELL_SIZE,
    showStepNumbers: false,
    leftPropType: leftProp,
    rightPropType: opts.catDogMode
      ? (opts.rightPropType ?? leftProp)
      : leftProp,
    catDogModeEnabled: opts.catDogMode ?? false,
    showLeftMotion: opts.showLeftMotion ?? motionVisibility.showLeftMotion,
    showRightMotion: opts.showRightMotion ?? motionVisibility.showRightMotion,
    probeCloud: true,
    uploadCanonical: true,
  };

  const entries: {
    cell: "start" | number;
    data: PictographData;
    options: PreviewCellRenderOptions;
  }[] = [];
  const start = startPositionDeriver.getOrDeriveStartPosition(sequence);
  if (start)
    entries.push({ cell: "start", data: start, options: renderOptions });
  // Mixed-duration cards render held beats as WIDE cells with
  // widthMultiplier = duration, and the multiplier is part of the cache key
  // (`|wm2|`). The warm must derive the same per-cell options as ChoreoCard
  // or wide cells are uploaded under keys no scanner ever asks for — the
  // B2ZM class of permanently-unavailable cells.
  const mixed = detectMixedDurations(sequence.steps);
  sequence.steps.forEach((step, index) => {
    const duration = (step as { duration?: number }).duration ?? 1;
    const options =
      mixed && duration !== 1
        ? { ...renderOptions, widthMultiplier: duration }
        : renderOptions;
    entries.push({ cell: index + 1, data: step, options });
  });

  return entries;
}

export async function warmSequenceCells(
  sequence: SequenceData,
  opts: WarmOptions = {}
): Promise<WarmSequenceCellsResult> {
  throwIfAborted(opts.signal);
  const entries = getCanonicalSequenceCells(sequence, opts);
  const hashes: string[] = [];
  const failures: WarmCellFailure[] = [];
  // Canonical warming sits inside thumbnail rendering and can run for several
  // visible cards at once. Process one cell per warm so those cards share the
  // renderer fairly instead of each dumping an entire light+dark sequence into
  // the worker pool at the same time.
  for (const { cell, data, options } of entries) {
    throwIfAborted(opts.signal);
    try {
      const hash = await deriveCloudCellHash(
        data,
        opts.isDark ?? true,
        options
      );
      if (opts.requireComplete) {
        await ensureVerifiedCanonicalCell(
          data,
          cell,
          opts.isDark ?? true,
          options,
          hash,
          opts.signal
        );
      } else {
        await renderCanonicalCell(
          data,
          cell,
          opts.isDark ?? true,
          options,
          hash,
          false,
          opts.signal
        );
      }
      hashes.push(hash);
    } catch (error) {
      if (opts.signal?.aborted) throwIfAborted(opts.signal);
      failures.push({
        cell,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      opts.onActivity?.();
    }
  }
  const result: WarmSequenceCellsResult = {
    total: entries.length,
    ready: hashes.length,
    hashes,
    failures,
  };

  if (opts.requireComplete && failures.length > 0) {
    throw new IncompleteCellWarmError(result);
  }
  return result;
}

/** Test-only reset of the strict warm proof registry. */
export function _resetWarmStateForTest(): void {
  verifiedCloudHashes.clear();
  pendingVerifiedWarms.clear();
}

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
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import { detectMixedDurations } from "$lib/shared/choreo-card/services/step-durations";
import { getSequenceMotionVisibility } from "$lib/shared/foundation/services/sequence-motion-profile";
import type { CardExportTrace } from "$lib/shared/render/services/card-export-trace";

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
  /** QR creation is waiting for every scan asset. It may probe public objects
   * first and prepare up to four missing cells at once; background callers stay
   * serial so visible cards share the renderer fairly. */
  foreground?: boolean;
  /** Optional export-local timing summary. No cell identity is recorded. */
  trace?: CardExportTrace;
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
type CanonicalCellSource = "known" | "remote" | "rendered";

const pendingVerifiedWarms = new Map<string, Promise<CanonicalCellSource>>();

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
  probeUnknown: boolean,
  signal?: AbortSignal
): Promise<CanonicalCellSource> {
  // Most cards collapse onto pictographs that a previous card already
  // uploaded. Successful uploads and reads both register positive existence in
  // the cloud-cache owner. That proof lets QR preparation skip an entire image
  // download before rendering and another after upload.
  if (verifyUpload && pictographCloudCache.isCellKnownAvailable(hash))
    return "known";

  // Foreground QR preparation first checks the public object. Most hashes were
  // baked by a different publisher, so this avoids needless rasterization and
  // upload on a browser that has not seen them before. Background warming keeps
  // its quiet writer path because a 404 is expected there.
  if (verifyUpload) {
    const stored = await pictographCloudCache.download(hash, {
      probeUnknown,
      signal,
    });
    throwIfAborted(signal);
    if (stored) return "remote";
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
    return "rendered";
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
  probeUnknown: boolean,
  signal?: AbortSignal
): Promise<CanonicalCellSource> {
  if (verifiedCloudHashes.has(hash)) return "known";

  let pending = pendingVerifiedWarms.get(hash);
  if (!pending) {
    pending = renderCanonicalCell(
      data,
      cell,
      isDark,
      renderOptions,
      hash,
      true,
      probeUnknown
    ).then((source) => {
      verifiedCloudHashes.add(hash);
      return source;
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

  const source = await pending;
  // Shared same-hash work belongs to every current caller, so one thumbnail's
  // cancellation must not abort the core promise for the others. Stop this
  // consumer after the shared result settles instead.
  throwIfAborted(signal);
  return source;
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
  const start = startPlacementDeriver.getOrDeriveStartPlacement(sequence);
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
  const hashes = new Array<string | undefined>(entries.length);
  const failures = new Array<WarmCellFailure | undefined>(entries.length);
  const sourceCounts: Record<CanonicalCellSource, number> = {
    known: 0,
    remote: 0,
    rendered: 0,
  };
  // Background card work remains serial. A foreground QR waits on this exact
  // readiness proof, so it may keep four missing cells in flight without
  // starting a theme's second pass or an unbounded batch.
  const concurrency = opts.foreground ? 4 : 1;
  let next = 0;
  const prepareNext = async (): Promise<void> => {
    while (next < entries.length) {
      throwIfAborted(opts.signal);
      const index = next++;
      const { cell, data, options } = entries[index]!;
      try {
        const hash = await deriveCloudCellHash(
          data,
          opts.isDark ?? true,
          options
        );
        if (opts.requireComplete) {
          const source = await ensureVerifiedCanonicalCell(
            data,
            cell,
            opts.isDark ?? true,
            options,
            hash,
            opts.foreground === true,
            opts.signal
          );
          sourceCounts[source]++;
        } else {
          await renderCanonicalCell(
            data,
            cell,
            opts.isDark ?? true,
            options,
            hash,
            false,
            false,
            opts.signal
          );
        }
        hashes[index] = hash;
      } catch (error) {
        if (opts.signal?.aborted) throwIfAborted(opts.signal);
        failures[index] = {
          cell,
          reason: error instanceof Error ? error.message : String(error),
        };
      } finally {
        opts.onActivity?.();
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, prepareNext)
  );
  const result: WarmSequenceCellsResult = {
    total: entries.length,
    ready: hashes.filter((hash): hash is string => hash !== undefined).length,
    hashes: hashes.filter((hash): hash is string => hash !== undefined),
    failures: failures.filter(
      (failure): failure is WarmCellFailure => failure !== undefined
    ),
  };
  const theme = (opts.isDark ?? true) ? "dark" : "light";
  for (const [source, count] of Object.entries(sourceCounts)) {
    opts.trace?.note(`qr.cells.${theme}.${source}`, count);
  }

  if (opts.requireComplete && result.failures.length > 0) {
    throw new IncompleteCellWarmError(result);
  }
  return result;
}

/** Test-only reset of the strict warm proof registry. */
export function _resetWarmStateForTest(): void {
  verifiedCloudHashes.clear();
  pendingVerifiedWarms.clear();
}

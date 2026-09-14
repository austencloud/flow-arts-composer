/**
 * Admin warm pass for the canonical scan-card cell store.
 *
 * Drives warmSequenceCells over every durable shortcode, including private,
 * unlisted, embedded, and legacy physical cards. Each record is resolved and
 * hydrated through the same path as /q, then warmed with its exact per-hand
 * props in both supported card themes.
 *
 * Idempotent: renderCell probes the cloud store per cell and only renders +
 * uploads misses (including the IDB-hit upload backfill), so re-runs are
 * cheap. Cancellation takes effect between sequences.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import {
  warmSequenceCells,
  type WarmOptions,
  type WarmSequenceCellsResult,
} from "$lib/shared/render/services/warm-sequence-cells";
import type { ShortCodeResolution } from "$lib/shared/qr/services/short-code-manager";
import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
import { resolveScanPropConfig } from "$lib/shared/qr/services/scan-prop-resolver";

export interface CellWarmProgress {
  /** Sequences fully processed. */
  done: number;
  total: number;
  /** Sequences whose warm threw (skipped, run continues). */
  failed: number;
  /** Exact shortcode ids that can be retried without repeating the full run. */
  failedCodes: readonly string[];
  /** Display word of the sequence just processed. */
  current?: string;
  finished: boolean;
  cancelled: boolean;
}

export interface CellWarmHandle {
  cancel(): void;
  readonly promise: Promise<CellWarmProgress>;
}

export interface CellWarmDeps {
  listCodes?: () => Promise<readonly string[]>;
  resolveCode?: (code: string) => Promise<ShortCodeResolution>;
  warmCells?: (
    sequence: SequenceData,
    options: WarmOptions
  ) => Promise<WarmSequenceCellsResult>;
  /** Concurrent sequences. Cells within a sequence already render in
   *  parallel (bounded by the worker pool), so this mainly controls how much
   *  probe/upload network latency overlaps with rendering. */
  concurrency?: number;
  /** Optional QR artwork publication, after both scan themes are ready. */
  bakeQr?: (
    sequence: SequenceData,
    code: string,
    props: WarmOptions
  ) => Promise<void>;
}

const FIRESTORE_PROJECT_ID = "the-kinetic-alphabet";
// The renderer already owns a 16-worker ceiling. Keep that pool fed while
// shortcode reads and cloud probes wait on the network; four sequence lanes
// left three quarters of the available workers idle during the legacy pass.
const DEFAULT_CONCURRENCY = 16;

interface FirestoreRunQueryRow {
  document?: { name?: unknown };
}

/**
 * List every durable shortcode without downloading the full documents. A
 * normal client-SDK collection read transfers embedded sequences and metadata
 * for ~20k records just to keep each id. Firestore's REST projection returns
 * only `__name__`, including fresh records that are not in the daily R2
 * snapshot yet.
 */
export async function listAllShortCodes(): Promise<readonly string[]> {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}` +
      "/databases/(default)/documents:runQuery",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "shortcodes" }],
          select: { fields: [{ fieldPath: "__name__" }] },
          orderBy: [
            {
              field: { fieldPath: "__name__" },
              direction: "ASCENDING",
            },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Shortcode list query failed: ${response.status} ${response.statusText}`
    );
  }

  const rows = (await response.json()) as FirestoreRunQueryRow[];
  const marker = "/documents/shortcodes/";
  return rows.flatMap((row) => {
    const name = row.document?.name;
    if (typeof name !== "string") return [];
    const markerIndex = name.indexOf(marker);
    if (markerIndex === -1) return [];
    const code = name.slice(markerIndex + marker.length);
    return code && !code.includes("/") ? [code] : [];
  });
}

async function resolveShortCode(code: string): Promise<ShortCodeResolution> {
  const { getShortCodeManager } =
    await import("$lib/shared/qr/get-short-code-manager");
  return getShortCodeManager().resolveShortCodeWithRecord(code);
}

export function startScanCellWarm(
  onProgress: (p: CellWarmProgress) => void,
  deps?: CellWarmDeps
): CellWarmHandle {
  let cancelled = false;

  const progress: CellWarmProgress = {
    done: 0,
    total: 0,
    failed: 0,
    failedCodes: [],
    finished: false,
    cancelled: false,
  };

  const promise = (async (): Promise<CellWarmProgress> => {
    const codes = [...(await (deps?.listCodes ?? listAllShortCodes)())];
    const resolveCode = deps?.resolveCode ?? resolveShortCode;
    const warmCells = deps?.warmCells ?? warmSequenceCells;
    progress.total = codes.length;
    onProgress({ ...progress });

    const concurrency = Math.max(1, deps?.concurrency ?? DEFAULT_CONCURRENCY);
    let next = 0;

    const runWorker = async (): Promise<void> => {
      while (!cancelled) {
        const idx = next++;
        if (idx >= codes.length) return;
        const code = codes[idx];
        if (!code) continue;

        try {
          const resolution = await resolveCode(code);
          if (!resolution.sequence) {
            throw new Error(`Shortcode ${code} did not resolve`);
          }
          const sequence = await hydrateSequence(resolution.sequence, {
            loopDetector: null,
          });
          const propConfig = resolveScanPropConfig(sequence, resolution.record);
          await Promise.all(
            [true, false].map((isDark) =>
              warmCells(sequence, {
                isDark,
                ...propConfig,
                requireComplete: true,
              })
            )
          );
          await deps?.bakeQr?.(sequence, code, propConfig);
          progress.current = simplifyRepeatedWord(
            sequence.word || sequence.name || code
          );
        } catch {
          progress.failed++;
          progress.failedCodes = [...progress.failedCodes, code];
          progress.current = code;
        }

        progress.done++;
        onProgress({ ...progress });
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, Math.max(codes.length, 1)) },
      () => runWorker()
    );
    await Promise.all(workers);

    progress.finished = true;
    progress.cancelled = cancelled;
    onProgress({ ...progress });
    return { ...progress };
  })();

  return {
    cancel() {
      cancelled = true;
    },
    promise,
  };
}

/** Bake the standard 200px viewer QR in both themes for every saved code.
 * Reuses the cell job's hydration, cancellation and failed-code retry handling. */
export function startScanQrBake(
  onProgress: (p: CellWarmProgress) => void,
  deps?: CellWarmDeps
): CellWarmHandle {
  return startScanCellWarm(onProgress, {
    ...deps,
    // QR SVG generation uses the main thread. Keep its queue small while
    // overlapping cloud reads and uploads.
    concurrency: deps?.concurrency ?? 4,
    bakeQr: deps?.bakeQr ?? bakeCanonicalQr,
  });
}

async function bakeCanonicalQr(
  sequence: SequenceData,
  code: string,
  props: WarmOptions
): Promise<void> {
  const { getShortCodeManager } =
    await import("$lib/shared/qr/get-short-code-manager");
  const { getUrlQRCodeGenerator } =
    await import("$lib/shared/qr/get-qr-code-generator");
  const { getQrImageCache } =
    await import("$lib/shared/qr/services/qr-image-cache");
  const { PreparedQrCache } =
    await import("$lib/shared/qr/services/prepared-qr-cache");
  const cache = new PreparedQrCache(getQrImageCache());
  const url = getShortCodeManager().urlForExistingCode(code, props);
  for (const darkMode of [true, false]) {
    const options = {
      size: 200,
      margin: 1,
      style: "modern" as const,
      darkMode,
      leftPropType: props.leftPropType,
      rightPropType: props.rightPropType,
    };
    const key = await cache.keyFor(sequence, props, options);
    if (await cache.getShared(key, 10000)) continue;
    const result = await getUrlQRCodeGenerator().generateForUrl(url, options);
    await cache.set(key, { ...result, shortCode: code });
    if (!(await cache.getShared(key, 10000))) {
      throw new Error(
        `QR artwork for ${code} (${darkMode ? "dark" : "light"}) was not published`
      );
    }
  }
}

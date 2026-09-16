/**
 * Gallery Thumbnail Warmer
 *
 * One-time, admin-triggered, CLIENT-SIDE warm pass. Drives the real
 * ThumbnailRenderOrchestrator over every public sequence so cold gallery
 * thumbnails (deck-enumerated tnd/turn variants, QR variants) get rendered with
 * the actual renderer (zero parity risk) and uploaded to the shared cloud cache.
 * Kills the cold-cache 404 wave that otherwise self-heals only slowly, and only
 * for signed-in users, because Storage rules block guest uploads.
 *
 * This service does NOT render — getThumbnail() checks all four cache tiers and
 * renders + uploads ONLY on a full miss, so warming naturally skips anything
 * already cached. Runs are throttled and cancellable.
 *
 * After a run, regenerate the manifest + static bundle (credentialed node
 * scripts, outside the browser): `npm run thumbnails:manifest` then
 * `npm run thumbnails:sync`.
 *
 * See docs/superpowers/specs/active/2026-07-02-gallery-thumbnail-warm-pass-design.md
 */

import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ThumbnailRenderOrchestrator } from "./thumbnail-render-orchestrator";
import type { PublicSequencesLoader } from "./public-sequences-loader";
import {
  buildGalleryRenderInput,
  DEFAULT_GALLERY_COMPOSITION,
} from "./gallery-render-input";

// The real orchestrator/loader getters are imported dynamically inside the run
// (only when deps aren't injected) so that importing this module — e.g. from a
// unit test that injects fakes — never eagerly pulls the Firebase/render chain.

export interface WarmScope {
  /** Prop types to warm, one single-prop render each (blue = red = prop). */
  props: PropType[];
  /** Colour modes. */
  modes: Array<"dark" | "light">;
  /** QR variants: false = no-QR (guest-readable), true = QR-baked (signed-in). */
  qr: boolean[];
}

export interface WarmProgress {
  done: number;
  total: number;
  /** Full cache miss → rendered locally + uploaded to cloud. */
  rendered: number;
  /** Already cached in some tier (nothing to do). */
  skipped: number;
  /** Render returned no image (orphaned/corrupt sequence). */
  failed: number;
  /** Exact combinations that failed, suitable for a targeted retry. */
  failedCombinations: readonly string[];
  /** Exact combo label, e.g. "IIII [public-id] (staff, dark, qr)". */
  current?: string;
  /** True once the run has finished (or was cancelled). */
  finished: boolean;
  /** True if the run stopped early via cancel(). */
  cancelled: boolean;
  /** True while the pass is draining the uploads it started, after the last render. */
  uploading: boolean;
}

export interface WarmHandle {
  cancel(): void;
  readonly promise: Promise<WarmProgress>;
}

export interface WarmDeps {
  orchestrator: ThumbnailRenderOrchestrator;
  loader: Pick<PublicSequencesLoader, "loadSequenceMetadata">;
  /** In-flight renders. Kept modest — rendering is CPU-heavy. */
  concurrency?: number;
  /**
   * Extra pool sequences the gallery shows beyond the public loader — the same
   * provider BrowseModule hands the engine as `extraCommunitySequences` (today:
   * the canonical T&D pool). Injected because this module lives in shared/ and
   * must not import feature code. Without it a warm pass skips those cards and
   * they stay on the slow local-render tier.
   */
  extraSequences?: () => Promise<readonly SequenceData[]>;
}

interface Combo {
  sequence: SequenceData;
  prop: PropType;
  mode: "dark" | "light";
  qr: boolean;
}

const DEFAULT_CONCURRENCY = 4;

function comboLabel(c: Combo): string {
  // A LOOP repeats its word by construction, so the raw value reads as
  // "DPhi-APsiDPhi-APsi". The operator watches this line for minutes; show the
  // word the way every other surface shows it.
  const word = c.sequence.word ? simplifyRepeatedWord(c.sequence.word) : "";
  const name = word || c.sequence.name || "?";
  const id = c.sequence.id || "missing-id";
  return `${name} [${id}] (${c.prop}, ${c.mode}${c.qr ? ", qr" : ""})`;
}

function recordFailure(progress: WarmProgress, combo: Combo): void {
  progress.failed++;
  progress.failedCombinations = [
    ...progress.failedCombinations,
    comboLabel(combo),
  ];
}

/**
 * Expand a scope + sequence list into the flat combo list to render.
 * Exported for testing.
 */
export function expandCombos(sequences: SequenceData[], scope: WarmScope): Combo[] {
  const combos: Combo[] = [];
  for (const sequence of sequences) {
    for (const prop of scope.props) {
      for (const mode of scope.modes) {
        for (const qr of scope.qr) {
          combos.push({ sequence, prop, mode, qr });
        }
      }
    }
  }
  return combos;
}

/**
 * Start a gallery warm pass. Returns immediately with a handle; the run proceeds
 * in the background and reports through onProgress after every combo.
 */
export function startGalleryWarm(
  scope: WarmScope,
  onProgress: (p: WarmProgress) => void,
  deps?: Partial<WarmDeps>
): WarmHandle {
  const concurrency = Math.max(1, deps?.concurrency ?? DEFAULT_CONCURRENCY);

  let cancelled = false;

  const progress: WarmProgress = {
    done: 0,
    total: 0,
    rendered: 0,
    skipped: 0,
    failed: 0,
    failedCombinations: [],
    finished: false,
    cancelled: false,
    uploading: false,
  };

  const promise = (async (): Promise<WarmProgress> => {
    const orchestrator =
      deps?.orchestrator ??
      (await import("$lib/shared/browse/get-thumbnail-render-orchestrator")).getThumbnailRenderOrchestrator();
    const loader =
      deps?.loader ??
      (await import("$lib/shared/browse/get-browse-loader")).getBrowseLoader();

    const loaded = await loader.loadSequenceMetadata();
    const extras = deps?.extraSequences ? await deps.extraSequences() : [];
    // Dedupe by id, extras last — a pool sequence that somehow also exists in
    // the public index warms once under its public identity.
    const byId = new Map<string, SequenceData>();
    for (const s of loaded) byId.set(s.id, s);
    for (const s of extras) if (!byId.has(s.id)) byId.set(s.id, s);
    const sequences = [...byId.values()];
    if (cancelled) {
      progress.finished = true;
      progress.cancelled = true;
      onProgress({ ...progress });
      return { ...progress };
    }

    const combos = expandCombos(sequences, scope);
    progress.total = combos.length;
    onProgress({ ...progress });

    let next = 0;
    const runWorker = async (): Promise<void> => {
      while (true) {
        if (cancelled) return;
        const idx = next++;
        if (idx >= combos.length) return;
        const combo = await combos[idx];
        if (!combo) continue;

        try {
          // Build the SHARED-defaults input (row layout, mandala on) plus the
          // per-combo QR flag via an explicit visibility override, so renders
          // land in the usesDefaults cloud cache keyed exactly like a live
          // default-settings signed-in card. getThumbnail() cache-checks all
          // tiers and only renders+uploads a full miss.
          const input = buildGalleryRenderInput({
            sequence: combo.sequence,
            leftPropType: combo.prop,
            rightPropType: combo.prop,
            catDogModeEnabled: false,
            lightMode: combo.mode === "light",
            variant: "gallery",
            startPlacementLayout: "row",
            allowQR: combo.qr,
            visibility: { showQRCode: combo.qr, showMandala: true },
            compositionManager: DEFAULT_GALLERY_COMPOSITION,
            isAuthenticated: true,
          });

          const result = await orchestrator.getThumbnail({
            sequence: combo.sequence,
            input,
          });

          if (
            result.url == null ||
            result.cacheWriteSkippedReason === "qr_inconsistent"
          ) {
            recordFailure(progress, combo);
          } else if (result.fromCache) {
            progress.skipped++;
          } else {
            progress.rendered++;
          }
        } catch {
          recordFailure(progress, combo);
        }

        progress.done++;
        progress.current = comboLabel(combo);
        onProgress({ ...progress });
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, combos.length) },
      () => runWorker()
    );
    await Promise.all(workers);

    // Rendering is done; the writes may not be. getThumbnail() hands each blob
    // to a fire-and-forget upload so live cards paint immediately, which means
    // the last combos can still be in the air here. An unattended pass exists
    // to fill the shared cache, so it does not get to claim success until its
    // own uploads have settled — otherwise closing the tab on "Done" silently
    // discards the tail.
    progress.uploading = true;
    onProgress({ ...progress });
    try {
      await orchestrator.settleUploads();
    } catch {
      // settleUploads never rejects, but a stubbed orchestrator in a test may
      // not implement it. A missing settle point must not fail the run.
    }
    progress.uploading = false;

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

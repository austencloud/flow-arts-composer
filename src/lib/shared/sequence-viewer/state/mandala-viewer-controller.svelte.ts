import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  MandalaPathShape,
  MandalaPalette,
  MandalaColorMode,
  MandalaPresetId,
  MandalaRenderOptions,
} from "#lib/shared/mandala/domain/mandala-types.js";
import {
  PRESET_COLORS,
  mixColors,
  withAlpha,
  sampleGradient,
} from "#lib/shared/mandala/domain/mandala-palette.js";
import type { MandalaFrameSpec } from "#lib/shared/mandala/services/mandala-frame-renderer.js";
import { sequenceMandalaHandOffsets } from "#lib/shared/mandala/services/mandala-grid-join.js";
import {
  toAnimationPathPolicy,
  toMandalaPathShape,
} from "#lib/shared/mandala/services/mandala-path-policy.js";
import type { MandalaExportDiag } from "#lib/shared/mandala/workers/mandala-export.worker.js";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  estimateExportTime,
  recordExportThroughput,
  hasDeviceMetrics,
} from "#lib/shared/animation-panel/state/export-timing-tracker.js";
import { shareOrDownloadBlob } from "#lib/shared/foundation/services/file-downloader.js";
import {
  exportMandalaVideo,
  mandalaBitrateFor,
  type MandalaVideoExportHandle,
} from "#lib/shared/mandala/services/mandala-video-exporter.js";
import {
  resolveMandalaExportDelivery,
  type MandalaExportDelivery,
} from "../services/mandala-export-delivery";
import { resolveViewerCustomColorPair } from "../domain/viewer-custom-colors";
import {
  ensureViewerCustomColorPreference,
  loadViewerCustomColorPreference,
  saveViewerCustomColorPreference,
} from "../services/viewer-custom-color-preferences";
import {
  createViewerCustomColorState,
  type ViewerCustomColorState,
} from "./viewer-custom-colors-state.svelte";

export type MandalaExportPhase =
  | "idle"
  | "capturing"
  | "encoding"
  | "complete"
  | "error";
export type MandalaExportResolution = 720 | 1080 | 2160;
export type MandalaExportFps = 30 | 60;

export interface MandalaControllerSources {
  getSequence: () => SequenceData;
  getLeftPropType: () => string | undefined;
  getRightPropType: () => string | undefined;
  pathPolicy: AnimationVisibilityStateManager;
  customColorState?: ViewerCustomColorState;
}

const BASE_PERIOD = 5;
const COLOR_CYCLE_BREATHS = 3;
const DEFAULT_BG_COLOR = "#000000";
const DEFAULT_FILL_ALPHA = 0.15;

const EXPORT_STORAGE_KEY = "tka_mandala_export";
// The mandala's *look* (spin/speed/colors/weight/depth), persisted apart
// from the export config so the viewer reopens in the look the user last set.
const VIEW_STORAGE_KEY = "tka_mandala_view_state";

export interface MandalaViewState {
  rotation: number;
  speed: number;
  depth: number;
  colorMode: MandalaColorMode;
  preset: MandalaPresetId;
  customLeft: string;
  customRight: string;
  lineWeight: number;
}

export interface MandalaControllerOptions {
  /** Values that must win over the saved viewer look for this controller. */
  viewOverrides?: Partial<MandalaViewState>;
  /** Keep this controller's changes out of the shared viewer preference. */
  persistViewState?: boolean;
  /** Let an embedded Mandala edit the shared pair without saving its other look. */
  persistCustomColors?: boolean;
}
function clampReps(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}

function loadExportConfig(): {
  reps: number;
  resolution: MandalaExportResolution;
  fps: MandalaExportFps;
} {
  const def = {
    reps: 3,
    resolution: 1080 as MandalaExportResolution,
    fps: 60 as MandalaExportFps,
  };
  if (typeof localStorage === "undefined") return def;
  try {
    const raw = localStorage.getItem(EXPORT_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<typeof def>;
      return {
        reps: clampReps(p.reps ?? def.reps),
        resolution: (p.resolution ?? def.resolution) as MandalaExportResolution,
        fps: (p.fps ?? def.fps) as MandalaExportFps,
      };
    }
  } catch {
    // fall through to defaults
  }
  return def;
}

function loadViewState(): Partial<MandalaViewState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<MandalaViewState>) : {};
  } catch {
    return {};
  }
}

// Flow-color helpers live in the shared mandala-palette module so the viewer
// and the MandalaLoader render from one source of truth.

/**
 * Shared animation + palette + export state for the mandala viewer.
 * Owns the mandala-only tunables and delegates path shape to the animation
 * policy, so desktop, mobile, workspace, and canvas controls stay in sync.
 */
export class MandalaViewerController {
  paused = $state(false);
  show = $state<MandalaRenderOptions["show"]>("both");
  #pathShape = $state<MandalaPathShape>("arc");
  rotation = $state(90);
  speed = $state(1);
  depth = $state(100);
  colorMode = $state<MandalaColorMode>("flow");
  preset = $state<MandalaPresetId>("aurora");
  readonly customColorState: ViewerCustomColorState;

  get customLeft(): string {
    return this.customColorState.colors.left;
  }

  set customLeft(value: string) {
    this.customColorState.setColor("left", value);
  }

  get customRight(): string {
    return this.customColorState.colors.right;
  }

  set customRight(value: string) {
    this.customColorState.setColor("right", value);
  }
  lineWeight = $state(2.5);
  exporting = $state(false);

  // Export config (persisted to localStorage).
  exportReps = $state(3);
  exportResolution = $state<MandalaExportResolution>(1080);
  exportFps = $state<MandalaExportFps>(60);

  // Export lifecycle (drives the fullscreen takeover).
  exportPhase = $state<MandalaExportPhase>("idle");
  exportProgress = $state(0);
  exportError = $state<string | null>(null);
  /** Result of the file handoff, not merely the worker encode. */
  exportDelivery = $state<MandalaExportDelivery | null>(null);
  /** Last export diagnostic (render/encode/mux split, HW status) — logged live. */
  lastExportDiag = $state<MandalaExportDiag | null>(null);
  /**
   * The finished MP4, held rather than delivered. Only set when the caller
   * asked for `{ deliver: false }` — the share sheet renders the mandala to
   * post it, so writing the same file to Downloads on the way would be a file
   * nobody asked for.
   */
  exportBlobUrl = $state<string | null>(null);

  /** The active preset's stage background (custom preset falls back to black). */
  bgColor = $derived(
    this.preset === "custom" ? DEFAULT_BG_COLOR : PRESET_COLORS[this.preset].bg
  );

  #sources: MandalaControllerSources;
  #pathPolicy: AnimationVisibilityStateManager;
  #colorPhase = $state(0);
  #colorRafId = 0;
  #exportHandle: MandalaVideoExportHandle | null = null;

  period = $derived(BASE_PERIOD / this.speed);
  rangeMax = $derived(this.depth * 2.5);

  // Device-calibrated estimate (seconds) for the current config + cycle length.
  estimateSeconds = $derived(
    estimateExportTime(
      this.exportResolution,
      this.exportFps,
      this.period,
      this.exportReps
    ) ?? 0
  );
  // True once we have real throughput samples for this resolution (vs fallback).
  hasMetrics = $derived(hasDeviceMetrics(this.exportResolution));
  // Total frames that will be encoded for the current config.
  exportFrameCount = $derived(
    Math.max(1, Math.ceil(this.period * this.exportFps)) * this.exportReps
  );

  constructor(
    sources: MandalaControllerSources,
    options: MandalaControllerOptions = {}
  ) {
    this.#sources = sources;
    this.#pathPolicy = sources.pathPolicy;
    this.#pathShape = toMandalaPathShape(this.#pathPolicy.getPathPolicy());

    const persistViewState = options.persistViewState ?? true;
    const persistCustomColors = options.persistCustomColors ?? persistViewState;
    const savedView = loadViewState();
    if (sources.customColorState) {
      this.customColorState = sources.customColorState;
    } else {
      const preferenceColors = persistCustomColors
        ? ensureViewerCustomColorPreference()
        : loadViewerCustomColorPreference(undefined, false);
      this.customColorState = createViewerCustomColorState(
        preferenceColors,
        persistCustomColors ? saveViewerCustomColorPreference : undefined
      );
    }
    if (
      typeof options.viewOverrides?.customLeft === "string" ||
      typeof options.viewOverrides?.customRight === "string"
    ) {
      this.customColorState.hydrate(
        resolveViewerCustomColorPair(
          {
            left: options.viewOverrides.customLeft,
            right: options.viewOverrides.customRight,
          },
          this.customColorState.colors
        )
      );
    }

    const cfg = loadExportConfig();
    this.exportReps = cfg.reps;
    this.exportResolution = cfg.resolution;
    this.exportFps = cfg.fps;

    // Restore the persisted look (each field guarded so a partial/old payload
    // falls back to the field default).
    const view = { ...savedView, ...options.viewOverrides };
    if (typeof view.rotation === "number") this.rotation = view.rotation;
    if (typeof view.speed === "number") this.speed = view.speed;
    if (typeof view.depth === "number") this.depth = view.depth;
    if (view.colorMode !== undefined) this.colorMode = view.colorMode;
    if (view.preset !== undefined) this.preset = view.preset;
    if (typeof view.lineWeight === "number") this.lineWeight = view.lineWeight;

    // Persist the look on change (separate key from export config).
    $effect(() => {
      if (!persistViewState) return;
      const snapshot: MandalaViewState = {
        rotation: this.rotation,
        speed: this.speed,
        depth: this.depth,
        colorMode: this.colorMode,
        preset: this.preset,
        customLeft: this.customLeft,
        customRight: this.customRight,
        lineWeight: this.lineWeight,
      };
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore storage failures
      }
    });

    // Every mandala surface follows the same motion-path choice as the live
    // animation. The observer covers changes made on the canvas or workspace;
    // the pathShape setter below sends mandala-control changes back the other
    // way. The controller's old localStorage shape is deliberately ignored.
    $effect(() => {
      const sync = () => {
        this.#pathShape = toMandalaPathShape(this.#pathPolicy.getPathPolicy());
      };
      sync();
      this.#pathPolicy.registerObserver(sync);
      return () => this.#pathPolicy.unregisterObserver(sync);
    });

    // Persist export config on change.
    $effect(() => {
      const snapshot = {
        reps: this.exportReps,
        resolution: this.exportResolution,
        fps: this.exportFps,
      };
      if (typeof localStorage === "undefined") return;
      try {
        localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore storage failures
      }
    });

    // Color-morph animation loop (flow mode only, paused respected).
    $effect(() => {
      if (this.paused || this.colorMode !== "flow") {
        if (this.#colorRafId) {
          cancelAnimationFrame(this.#colorRafId);
          this.#colorRafId = 0;
        }
        return;
      }
      const cyclePeriod = this.period * COLOR_CYCLE_BREATHS;
      let startTime: number | null = null;
      const tick = (time: number) => {
        if (startTime === null) startTime = time;
        const elapsed = (time - startTime) / 1000;
        this.#colorPhase = (elapsed % cyclePeriod) / cyclePeriod;
        this.#colorRafId = requestAnimationFrame(tick);
      };
      this.#colorRafId = requestAnimationFrame(tick);
      return () => {
        if (this.#colorRafId) {
          cancelAnimationFrame(this.#colorRafId);
          this.#colorRafId = 0;
        }
      };
    });
  }

  /**
   * The sequence and props the mandala is drawn from. The controls render live
   * option previews — a real mandala per path shape, per line weight — and a
   * preview drawn from a different sequence than the one on screen would be a
   * decoration, not a choice.
   */
  get sequence(): SequenceData {
    return this.#sources.getSequence();
  }
  get leftPropType(): string | undefined {
    return this.#sources.getLeftPropType();
  }
  get rightPropType(): string | undefined {
    return this.#sources.getRightPropType();
  }

  get pathShape(): MandalaPathShape {
    return this.#pathShape;
  }

  set pathShape(shape: MandalaPathShape) {
    this.#pathShape = shape;
    this.#pathPolicy.setPathPolicy(
      toAnimationPathPolicy(shape, this.#pathPolicy.getPathPolicy())
    );
  }

  #getPresetPair(): [string, string] {
    if (this.preset === "custom") return [this.customLeft, this.customRight];
    return PRESET_COLORS[this.preset].pair;
  }

  #getPresetMorph(): string[] {
    if (this.preset === "custom") {
      const mix = mixColors(this.customLeft, this.customRight);
      return [this.customLeft, mix, this.customRight, mix, this.customLeft];
    }
    return PRESET_COLORS[this.preset].morph;
  }

  /** The active preset's fill alpha for blue/red strokes (custom → default). */
  #getFillAlpha(): number {
    if (this.preset === "custom") return DEFAULT_FILL_ALPHA;
    return PRESET_COLORS[this.preset].fillAlpha ?? DEFAULT_FILL_ALPHA;
  }

  palette = $derived.by((): MandalaPalette => {
    const fillAlpha = this.#getFillAlpha();
    if (this.colorMode === "solid") {
      const [c1, c2] = this.#getPresetPair();
      const mix = mixColors(c1, c2);
      return {
        leftStroke: c1,
        leftFill: withAlpha(c1, fillAlpha),
        rightStroke: c2,
        rightFill: withAlpha(c2, fillAlpha),
        purpleStroke: mix,
        purpleFill: withAlpha(mix, fillAlpha + 0.05),
      };
    }
    const morphColors = this.#getPresetMorph();
    const c1 = sampleGradient(morphColors, this.#colorPhase);
    const c2 = sampleGradient(morphColors, (this.#colorPhase + 0.4) % 1);
    const mix = mixColors(c1, c2);
    return {
      leftStroke: c1,
      leftFill: withAlpha(c1, fillAlpha),
      rightStroke: c2,
      rightFill: withAlpha(c2, fillAlpha),
      purpleStroke: mix,
      purpleFill: withAlpha(mix, fillAlpha + 0.05),
    };
  });

  /** The active preset's two representative colors (for compact swatches). */
  accentPair = $derived.by((): [string, string] => this.#getPresetPair());

  /**
   * CSS gradient that previews what a preset actually renders as — the flow
   * morph for named presets, a blue→red sweep for custom. Side-by-side dots
   * misrepresent the output; this shows the real palette.
   */
  previewGradient(id: MandalaPresetId): string {
    if (id === "custom") {
      const mix = mixColors(this.customLeft, this.customRight);
      return `linear-gradient(120deg, ${this.customLeft}, ${mix}, ${this.customRight})`;
    }
    return `linear-gradient(120deg, ${PRESET_COLORS[id].morph.join(", ")})`;
  }

  gradientColors = $derived.by(() => {
    if (this.colorMode !== "flow") return undefined;
    const morphColors = this.#getPresetMorph();
    const c1 = sampleGradient(morphColors, this.#colorPhase);
    const c2 = sampleGradient(morphColors, (this.#colorPhase + 0.4) % 1);
    const c3 = sampleGradient(morphColors, (this.#colorPhase + 0.7) % 1);
    const mix = mixColors(c1, c2);
    return {
      left: [c1, c3] as [string, string],
      right: [c2, c1] as [string, string],
      purple: [mix, c3] as [string, string],
    };
  });

  /** Legacy entry point (real viewer's side rail / download button). */
  async handleDownload(): Promise<void> {
    this.startExport();
  }

  /**
   * Export the mandala to an MP4. The worker runs the ENTIRE pipeline off the
   * main thread — per-frame geometry, gradient/glow canvas render, rotation, and
   * the H.264 encode — so the on-screen mandala keeps undulating without jank.
   * The main thread only posts the spec once and reflects progress.
   */
  /**
   * @param options.deliver Save or share the finished file (default). `false`
   * hands it back on {@link exportBlobUrl} instead, for a caller that owns the
   * delivery itself — the post-share sheet, which uploads the same blob.
   * @returns `false` when the request was refused outright (a render already
   * running, no steps to render). A caller showing its own "rendering…" state
   * has to honour that, or it spins on a render that never began.
   */
  startExport(options?: { deliver?: boolean }): boolean {
    const deliver = options?.deliver !== false;
    const sequence = this.#sources.getSequence();
    if (
      this.exporting ||
      (this.exportPhase !== "idle" &&
        this.exportPhase !== "complete" &&
        this.exportPhase !== "error")
    )
      return false;
    if (!sequence?.steps) return false;

    this.exportError = null;
    this.exportDelivery = null;
    this.#releaseExportBlob();
    this.exportProgress = 0;
    this.exportPhase = "capturing";
    this.exporting = true;

    const resolution = this.exportResolution;
    const fps = this.exportFps;
    const reps = this.exportReps;
    const bitrate = mandalaBitrateFor(resolution);
    const startMs = performance.now();
    const totalFrames = Math.max(1, Math.ceil(this.period * fps)) * reps;

    const isFlow = this.colorMode === "flow";
    // steps may be Svelte reactive proxies / domain class instances. JSON
    // round-trip yields the plain, structured-cloneable data the worker needs.
    const plainSteps = JSON.parse(JSON.stringify(sequence.steps));
    const spec: MandalaFrameSpec = {
      steps: plainSteps,
      leftPropType: this.#sources.getLeftPropType(),
      rightPropType: this.#sources.getRightPropType(),
      show: this.show,
      pathShape: this.pathShape,
      lineWeight: this.lineWeight,
      bgColor: this.bgColor,
      resolution,
      period: this.period,
      reps,
      fps,
      rangeMax: this.rangeMax,
      rotation: this.rotation,
      morphColors: isFlow ? this.#getPresetMorph() : null,
      solidPair: isFlow ? null : this.#getPresetPair(),
      // A joined sequence exports joined: each hand around its own grid.
      handOffsets: sequenceMandalaHandOffsets(sequence),
    };

    // The shared exporter owns the worker lifecycle (cache-busted construction,
    // message protocol, beforeunload guard, teardown). The controller keeps its
    // own state, diagnostics logging, throughput recording, and delivery.
    const handle = exportMandalaVideo(spec, bitrate, {
      onPhase: (phase) => {
        if (phase === "encoding") this.exportPhase = "encoding";
      },
      onProgress: (fraction) => {
        this.exportProgress = fraction;
      },
      onDiag: (d) => {
        // Surface where export wall-time goes so a slow export is diagnosable
        // live (render vs encode-wait vs mux, and whether HW encode engaged).
        const tag = `[mandala-export ${d.phase}]`;
        if (d.phase === "config") {
          console.log(
            `${tag} codec=${d.codec} hwSupported=${d.hwSupported} encoder=${d.encoder} res=${d.resolution} fps=${d.fps} frames=${d.totalFrames}`
          );
        } else {
          const mp = +((d.resolution * d.resolution) / 1_000_000).toFixed(1);
          console.log(
            `${tag} ${d.encodedFrames}/${d.totalFrames} · encode=${d.encodeFps}fps · render=${d.renderMs}ms wait=${d.encodeWaitMs}ms vframe=${d.vfMs}ms mux=${d.muxMs}ms · ${mp}MP/frame codec=${d.codec}` +
              (d.phase === "done" && d.encodeFps > 0 && d.encodeFps < 24
                ? `  ⚠ encode-bound — H.264 can't keep up at ${d.resolution}² (${mp}MP). Lower resolution encodes ~(px ratio)× faster.`
                : "")
          );
        }
        this.lastExportDiag = d;
      },
    });
    this.#exportHandle = handle;

    handle.done
      .then(async (blob) => {
        if (this.#exportHandle !== handle) return; // superseded/cancelled
        recordExportThroughput(
          resolution,
          totalFrames,
          performance.now() - startMs
        );
        const filename = `mandala-${this.pathShape}-${this.preset}-${reps}x.mp4`;

        if (!deliver) {
          this.exportBlobUrl = URL.createObjectURL(blob);
          this.exportDelivery = { outcome: "completed", method: "handoff" };
          this.exporting = false;
          this.#exportHandle = null;
          this.exportPhase = "complete";
          window.setTimeout(() => {
            if (this.exportPhase === "complete") this.exportPhase = "idle";
          }, 1400);
          return;
        }

        // Mobile: native share sheet (canShare files). Desktop: anchor download.
        // shareOrDownloadBlob gates on the DEVICE (detectPlatform), not on
        // navigator.share existence — desktop Chrome/Edge implement the Web
        // Share API, so feature detection alone pops the Windows share sheet.
        let result;
        try {
          result = await shareOrDownloadBlob(blob, filename, {
            title: "TKA Mandala",
          });
        } catch {
          if (this.#exportHandle !== handle) return;
          this.exportDelivery = { outcome: "failed", method: null };
          this.exportError = "Couldn't save the mandala video.";
          this.exportPhase = "error";
          this.exporting = false;
          this.#exportHandle = null;
          return;
        }
        if (this.#exportHandle !== handle) return;

        const delivery = resolveMandalaExportDelivery(result);
        this.exportDelivery = delivery;
        this.exporting = false;
        this.#exportHandle = null;

        if (delivery.outcome === "canceled") {
          this.exportProgress = 0;
          this.exportPhase = "idle";
          return;
        }
        if (delivery.outcome === "failed") {
          this.exportError = "Couldn't save the mandala video.";
          this.exportPhase = "error";
          return;
        }

        this.exportPhase = "complete";
        window.setTimeout(() => {
          if (this.exportPhase === "complete") this.exportPhase = "idle";
        }, 1400);
      })
      .catch((err: unknown) => {
        if (this.#exportHandle !== handle) return; // cancelled by us; state already reset
        const message = err instanceof Error ? err.message : String(err);
        console.error("Mandala export failed:", message);
        this.exportError = message;
        this.exportPhase = "error";
        this.exporting = false;
        this.#exportHandle = null;
      });

    return true;
  }

  /**
   * Drop a held render. The share sheet calls this on open so each share bakes
   * the mandala as it is now — reusing the last file would silently post the
   * shape, palette or spin the user changed after rendering it.
   */
  clearExportBlob(): void {
    this.#releaseExportBlob();
  }

  cancelExport(): void {
    const handle = this.#exportHandle;
    this.#exportHandle = null;
    handle?.cancel();
    this.#resetExport();
  }

  #resetExport(): void {
    this.exporting = false;
    this.exportProgress = 0;
    this.exportPhase = "idle";
    this.exportError = null;
    this.exportDelivery = null;
    this.#releaseExportBlob();
  }

  /** A held blob is a live object URL; dropping the reference alone leaks it. */
  #releaseExportBlob(): void {
    if (!this.exportBlobUrl) return;
    URL.revokeObjectURL(this.exportBlobUrl);
    this.exportBlobUrl = null;
  }
}

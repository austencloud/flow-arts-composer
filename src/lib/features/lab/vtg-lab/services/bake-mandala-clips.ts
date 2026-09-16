import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import { createAnimationPlaybackController } from "$lib/features/compose/services/animation-playback-controller-factory";
import { getVideoExportOrchestrator } from "$lib/shared/animation-engine/get-video-export-orchestrator";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { prepareMandalaClubSequence, type MandalaPathShape } from "./prepare-mandala-club-sequence";
import { buildMandalaOverlayDraw } from "./render-mandala-overlay-layer";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { EffortId } from "$lib/shared/effort/domain/effort-types";

export interface BakeJob {
  /** Output filename, e.g. "iso-0_5-arc.mp4". */
  filename: string;
  /** RAW (two-hand) sequence; single-club prep happens inside the harness. */
  sequence: SequenceData;
  pathShape: MandalaPathShape;
}

export interface BakeOptions {
  /** Effort easing baked into the motion (default "linear"). */
  effort?: EffortId;
  resolution?: 720 | 1080;
  fps?: number;
  mandalaOpacity?: number;
  mandalaScale?: number;
  onProgress?: (done: number, total: number, label: string) => void;
}

// The export orchestrator reads the GLOBAL visibility manager for trails +
// path-line + glyph visibility AND for the effort preset
// (sequence-animation-orchestrator: vm.getEffortPreset() → applyEffort), so set
// the frozen Rosetta look + the requested effort there before baking.
function configureGlobalVisibility(effort: EffortId): void {
  const vm = getAnimationVisibilityManager();
  const effects = createEffectsConfigState();
  effects.setActiveEffect("trails");
  vm.effectsConfigState = effects;
  vm.setActiveEffect("trails");
  vm.setDarkMode(true);
  vm.setVisibility("wordHeader", false);
  vm.setVisibility("progressBar", false);
  vm.setVisibility("tkaGlyph", false);
  vm.setVisibility("stepNumbers", false);
  vm.setVisibility("leftPathLines", true); // dotted hand-path line, blue only
  vm.setVisibility("rightPathLines", false);
  vm.setEffortPreset(effort);
}

/**
 * Bake each job to an MP4 (for one `effort`) and POST it to the dev write
 * endpoint, which stores it under static/mandala-rosetta/<effort>/. One
 * offscreen engine per export (created + disposed inside executeExport); the
 * panel state + controller are reused across jobs.
 */
export async function bakeMandalaClips(
  jobs: BakeJob[],
  options: BakeOptions = {},
): Promise<void> {
  const {
    effort = "linear",
    resolution = 720,
    fps = 30,
    mandalaOpacity = 0.55,
    mandalaScale = 1,
    onProgress,
  } = options;

  // The VideoExportOrchestrator factory registers as a side-effect of the app's
  // deferred-registrations module, which normally runs via requestIdleCallback.
  // On a bare /test/ route an auto-bake can start before that fires, so import it
  // explicitly here (idempotent, module-cached) to guarantee the factory + the
  // tip-point override provider are registered before the first export.
  await import("$lib/shared/composition-root/deferred-registrations");

  configureGlobalVisibility(effort);

  const panelState = createAnimationPanelState();
  const controller = createAnimationPlaybackController();
  const orchestrator = getVideoExportOrchestrator();

  // Layout source canvas (square; in non-composite mode only its width feeds the
  // export's layout math — the offscreen engine renders the real frames).
  const layoutCanvas = document.createElement("canvas");
  layoutCanvas.width = 600;
  layoutCanvas.height = 600;

  try {
    let done = 0;
    for (const job of jobs) {
      const prepared = prepareMandalaClubSequence(job.sequence, { show: "left", pathShape: job.pathShape });
      panelState.setShouldLoop(true);
      if (!controller.initialize(prepared, panelState)) {
        throw new Error(`Playback init failed for ${job.filename}`);
      }

      const frameOverlayDraw = buildMandalaOverlayDraw(prepared, {
        show: "left",
        pathShape: job.pathShape,
        opacity: mandalaOpacity,
        scale: mandalaScale,
      });

      const blob = await orchestrator.executeExport(
        layoutCanvas,
        controller,
        panelState,
        () => {},
        {
          format: "mp4",
          codec: "h264",
          // Batch bake captures each blob and writes it out itself; the
          // orchestrator must not dump a stray download per clip.
          autoDownload: false,
          resolution,
          fps,
          loopCount: 1,
          effectOverrides: { trails: true },
          includeAnimationStartPlacement: false,
          includeEndHold: false,
          seamlessTrailLoop: true,
          fragmented: true,
          leftPropType: "club",
          rightPropType: null,
          previewDarkMode: true,
          frameOverlayDraw,
        },
      );

      const res = await fetch(
        `/api/bake-clip?effort=${encodeURIComponent(effort)}&name=${encodeURIComponent(job.filename)}`,
        { method: "POST", body: blob },
      );
      if (!res.ok) {
        throw new Error(`write failed for ${effort}/${job.filename}: ${res.status}`);
      }

      done++;
      onProgress?.(done, jobs.length, job.filename);
    }
  } finally {
    controller.dispose();
    panelState.dispose();
  }
}

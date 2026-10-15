/**
 * Render one sequence's loop clip in the browser.
 *
 * The clip is one pass of the motion, baked by the same offscreen export
 * engine a shared video uses, so it carries the creator's recorded look
 * (trail, effects) and prop pair exactly as a live tile would show them. No
 * start-placement beat, no end hold, no word header or progress bar: just
 * the square canvas, ready to loop.
 *
 * The export engine reads the GLOBAL visibility manager, effects config and
 * trail settings, so this installs the sequence's look there before baking,
 * the way the Mandala Rosetta bake does. That makes it a batch tool for a
 * dedicated page (the /test/loop-clips harness), not something to call from
 * inside a visitor's session without saving and restoring those globals.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { VideoExportProgress } from "#lib/shared/compose/domain/video-export-types.js";
import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import { createAnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller-factory.js";
import { getVideoExportOrchestrator } from "#lib/shared/animation-engine/get-video-export-orchestrator.js";
import {
  AnimationVisibilityStateManager,
  getAnimationVisibilityManager,
} from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { resolveViewingPresentation } from "#lib/shared/sequence-preview/services/viewing-presentation.js";
import { resolveRecordedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  LOOP_CLIP_FPS,
  LOOP_CLIP_RESOLUTION,
  type LoopClipEntry,
} from "./loop-clip-spec";

export interface RenderLoopClipOptions {
  onProgress?: (progress: VideoExportProgress) => void;
}

export interface RenderedLoopClip {
  blob: Blob;
  /** Everything the index needs except the key and the byte count. */
  entry: Omit<LoopClipEntry, "key" | "bytes">;
}

/** Layout placeholder; the offscreen engine renders the real frames. */
const LAYOUT_CANVAS_SIZE = 600;

/**
 * The prop pair a clip is baked with: the creator's recording when there
 * is one, otherwise the app's default pair. A clip cannot follow each
 * visitor's Settings the way a live tile does; that is the trade the whole
 * approach makes, and the recorded pair is the one the creator meant.
 */
export function loopClipPropPair(sequence: SequenceData): {
  leftPropType: PropType;
  rightPropType: PropType;
} {
  const recorded = resolveRecordedPropConfig(sequence);
  return {
    leftPropType: recorded?.leftPropType ?? PropType.STAFF,
    rightPropType: recorded?.rightPropType ?? PropType.STAFF,
  };
}

/**
 * The overlays a live wall tile draws. SequenceShowcasePreview hands its
 * player a fresh ephemeral visibility manager (defaults, never the
 * visitor's toggles) and hides step numbers; the clip bakes exactly that,
 * so whatever the baking browser has stored never leaks into a clip.
 */
function liveTileOverlays() {
  const defaults = new AnimationVisibilityStateManager({ ephemeral: true });
  return {
    tkaGlyph: defaults.getVisibility("tkaGlyph"),
    elementalGlyph: defaults.getVisibility("elementalGlyph"),
    leftPathLines: defaults.getVisibility("leftPathLines"),
    rightPathLines: defaults.getVisibility("rightPathLines"),
    stepNumbers: false,
    wordHeader: false,
    progressBar: false,
  };
}

function installLook(sequence: SequenceData) {
  const look = resolveViewingPresentation(sequence);
  const vm = getAnimationVisibilityManager();
  const effects = createEffectsConfigState(undefined, { persist: false });
  effects.replace(look.effects);
  vm.effectsConfigState = effects;
  vm.setDarkMode(true);
  vm.setEffortPreset("linear");
  animationSettings.updateSettings({ trail: look.trail });
  return look;
}

export async function renderLoopClip(
  sequence: SequenceData,
  options: RenderLoopClipOptions = {}
): Promise<RenderedLoopClip> {
  // The orchestrator factory registers from the app's deferred-registrations
  // module, which normally runs on an idle callback. A harness can get here
  // first, so load it explicitly (idempotent, module-cached).
  await import("#lib/shared/composition-root/deferred-registrations.js");

  const look = installLook(sequence);
  const { leftPropType, rightPropType } = loopClipPropPair(sequence);

  const panelState = createAnimationPanelState();
  const controller = createAnimationPlaybackController();
  const orchestrator = getVideoExportOrchestrator();

  const layoutCanvas = document.createElement("canvas");
  layoutCanvas.width = LAYOUT_CANVAS_SIZE;
  layoutCanvas.height = LAYOUT_CANVAS_SIZE;

  try {
    panelState.setShouldLoop(true);
    if (!controller.initialize(sequence, panelState)) {
      throw new Error(`Playback init failed for ${sequence.id}`);
    }
    // 60 BPM: one second per beat, the tempo every ambient tile plays at.
    controller.setSpeed(1);

    const blob = await orchestrator.executeExport(
      layoutCanvas,
      controller,
      panelState,
      (progress) => options.onProgress?.(progress),
      {
        format: "mp4",
        codec: "h264",
        autoDownload: false,
        resolution: LOOP_CLIP_RESOLUTION,
        fps: LOOP_CLIP_FPS,
        loopCount: 1,
        includeAnimationStartPlacement: false,
        includeEndHold: false,
        // Pre-roll the trail so frame 0 already carries it and the wrap
        // from the last frame back to the first does not pop.
        seamlessTrailLoop: true,
        // Progressive MP4: a plain <video loop> plays it; MSE is not needed.
        fragmented: false,
        overlayOverrides: liveTileOverlays(),
        // The creator's recorded prop colors. The export names this field
        // for the tunnel, but the engine reads it as the exact base pair for
        // props and trails alike (frame-parameter-builder), which is the
        // same pair the live tile gets through primaryPropColors.
        tunnelPropColors: look.primaryPropColors ?? null,
        leftPropType,
        rightPropType,
        previewDarkMode: true,
      }
    );

    const steps = sequence.steps ?? [];
    const seconds = steps.reduce((sum, step) => sum + (step.duration ?? 1), 0);

    return {
      blob,
      entry: {
        seconds,
        fps: LOOP_CLIP_FPS,
        size: LOOP_CLIP_RESOLUTION,
        leftPropType,
        rightPropType,
        renderedAt: new Date().toISOString(),
      },
    };
  } finally {
    controller.dispose();
    panelState.dispose();
  }
}

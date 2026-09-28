import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import type {
  ExportCoordinatorState,
  ExportRequestOptions,
} from "../components/export-coordinator.svelte";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";
import type { MandalaViewerController } from "./mandala-viewer-controller.svelte";
import type { ViewerInteractiveServicesState } from "./viewer-interactive-services-state.svelte";
import type { createViewerState } from "./viewer-state.svelte";
import type { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";
import type { createModalAccessibilityHelper } from "../services/modal-accessibility-helper.svelte";

type ViewerState = ReturnType<typeof createViewerState>;
type AccessibilityHelper = ReturnType<typeof createModalAccessibilityHelper>;
type EditingPane = "animation" | "image" | "video-upload";

interface ViewerEditModeInputs {
  viewerState: ViewerState;
  playback: PlaybackControllerState;
  interactive: ViewerInteractiveServicesState;
  exportCoordinator: ExportCoordinatorState;
  modalAnimationState: AnimationPanelState;
  accessibilityHelper: AccessibilityHelper;
  getEditingPane: () => EditingPane | null;
  getEffectiveSequence: () => SequenceData | null;
  getIsHandPath: () => boolean;
  getResolvedCardAutoLayout: () => ResolvedAutoLayout | null;
}

export function createViewerEditModeState(inputs: ViewerEditModeInputs) {
  let playbackRestoreOnExit = false;

  function enterEditMode(pane: EditingPane): void {
    inputs.interactive.hapticService?.trigger("selection");

    if (pane === "animation") {
      const leftContent = inputs.viewerState.splitConfig.leftPane;
      const contentType =
        leftContent === "animation-3d" ? "animation-3d" : "animation";
      inputs.viewerState.enterExport("animation-export", contentType);
      if (
        !inputs.playback.isPlayingLocal &&
        inputs.interactive.playbackController
      ) {
        inputs.interactive.playbackController.togglePlayback();
      }
      playbackRestoreOnExit = false;
    } else if (pane === "image") {
      playbackRestoreOnExit = inputs.playback.isPlayingLocal;
      if (
        inputs.playback.isPlayingLocal &&
        inputs.interactive.playbackController
      ) {
        inputs.interactive.playbackController.togglePlayback();
      }
      inputs.viewerState.enterExport("image-export");
    } else {
      playbackRestoreOnExit = inputs.playback.isPlayingLocal;
      if (
        inputs.playback.isPlayingLocal &&
        inputs.interactive.playbackController
      ) {
        inputs.interactive.playbackController.togglePlayback();
      }
      // Video browsing stays available behind this temporary upload panel. A
      // person who closes it returns to the sequence's video gallery.
      inputs.viewerState.openVideoUpload();
    }

    if (pane === "video-upload") {
      inputs.accessibilityHelper.announce(
        t("viewer_ui_announce_video_upload"),
        "assertive"
      );
      return;
    }

    inputs.accessibilityHelper.announce(
      pane === "animation"
        ? t("viewer_ui_announce_animation_export")
        : t("viewer_ui_announce_card_export"),
      "assertive"
    );
  }

  function exitEditMode(): void {
    inputs.interactive.hapticService?.trigger("selection");
    const wasVideoUpload = inputs.viewerState.videoUploadOpen;
    if (wasVideoUpload) {
      inputs.viewerState.closeVideoUpload();
    } else {
      inputs.viewerState.exitExport();
    }
    inputs.exportCoordinator.dismissPreview();

    if (
      playbackRestoreOnExit &&
      !inputs.playback.isPlayingLocal &&
      inputs.interactive.playbackController
    ) {
      inputs.interactive.playbackController.togglePlayback();
    }
    playbackRestoreOnExit = false;
    inputs.accessibilityHelper.announce(
      wasVideoUpload
        ? t("viewer_ui_announce_upload_closed")
        : t("viewer_ui_announce_export_closed")
    );
  }

  /** Resolves `false` when the coordinator refused the request — see its doc. */
  async function handleExport(
    options?: ExportRequestOptions
  ): Promise<boolean> {
    return await inputs.exportCoordinator.handleExport(
      inputs.getEditingPane(),
      inputs.getEffectiveSequence(),
      inputs.interactive.playbackController,
      inputs.modalAnimationState,
      inputs.interactive.hapticService,
      inputs.playback.isPlayingLocal,
      inputs.playback.bpmLocal,
      inputs.getIsHandPath(),
      inputs.getResolvedCardAutoLayout(),
      options
    );
  }

  /** Resolves `false` when the request was refused — see {@link handleExport}. */
  async function handleArtExport(args: {
    artType: "mandala" | "tunnel";
    controller: TunnelViewController;
    mandalaController: MandalaViewerController;
  }): Promise<boolean> {
    if (args.artType === "mandala") {
      return args.mandalaController.startExport();
    }

    return await inputs.exportCoordinator.exportTunnel(
      inputs.interactive.playbackController,
      inputs.modalAnimationState,
      inputs.interactive.hapticService,
      (beat: number) => args.controller.additionalLayersAt(beat),
      args.controller.spectrum,
      args.controller.exactPropColors
    );
  }

  return {
    enterEditMode,
    exitEditMode,
    handleExport,
    handleArtExport,
  };
}

export type ViewerEditModeState = ReturnType<typeof createViewerEditModeState>;

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { saveSequenceHandoff } from "$lib/shared/coordinators/sequence-handoff.svelte";
import type { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";
import type { ViewerInteractiveServicesState } from "../state/viewer-interactive-services-state.svelte";

interface ViewerDestinationInputs {
  playback: PlaybackControllerState;
  interactive: ViewerInteractiveServicesState;
  getSequence: () => SequenceData | null;
  getIsAuthenticated: () => boolean;
  canManageSequenceVideos: () => boolean;
  saveSequence: () => Promise<void>;
  onClose: (reason?: "navigate") => void;
  enterVideoUpload: () => void;
}

interface ViewerDestinationDependencies {
  saveSequenceHandoff: typeof saveSequenceHandoff;
  navigate: (href: string) => void | Promise<void>;
  showToast: typeof showToast;
  showAuth: (mode: "signup", trigger: "edit-community") => void;
  savePendingEditSequence: (sequence: SequenceData) => void;
  openCreateConstruct: () => void | Promise<void>;
  getReturnPath: () => string;
}

export function createViewerDestinationActions(
  inputs: ViewerDestinationInputs,
  dependencies: ViewerDestinationDependencies
) {
  async function handleOpenInCompose(
    preset: "stagger" | "mirror" | "combo-export" = "stagger"
  ): Promise<void> {
    const sequence = inputs.getSequence();
    if (!sequence) return;
    inputs.interactive.hapticService?.trigger("selection");

    dependencies.saveSequenceHandoff({
      sequence,
      playbackState: {
        currentStep: inputs.playback.currentStepLocal,
        bpm: inputs.playback.bpmLocal,
        isPlaying: inputs.playback.isPlayingLocal,
      },
      preferredPreset: preset,
      returnPath: dependencies.getReturnPath(),
    });

    inputs.onClose("navigate");
    dependencies.showToast({
      message:
        preset === "combo-export"
          ? "Opening in Compose for combined export..."
          : "Opening in Compose...",
      type: "info",
      duration: 2000,
    });
    await dependencies.navigate("/compose?handoff=true");
  }

  function handleEdit(): void {
    const sequence = inputs.getSequence();
    if (!sequence) return;
    if (!inputs.getIsAuthenticated()) {
      dependencies.showAuth("signup", "edit-community");
      return;
    }

    inputs.interactive.hapticService?.trigger("selection");
    dependencies.savePendingEditSequence(sequence);
    inputs.onClose("navigate");
    dependencies.showToast({
      message: "Opening for editing...",
      type: "info",
      duration: 2000,
    });
    void dependencies.openCreateConstruct();
  }

  async function handleVideoUpload(): Promise<void> {
    if (!inputs.getIsAuthenticated()) {
      dependencies.showToast("Sign in to upload videos", "info");
      return;
    }
    if (!inputs.getSequence()) {
      dependencies.showToast("No sequence to upload video for", "info");
      return;
    }

    if (!inputs.canManageSequenceVideos()) {
      // A video needs a library record to attach to. The recording action is
      // already an explicit request to keep this sequence, so save it before
      // opening the uploader instead of asking someone to repeat that step.
      await inputs.saveSequence();
      if (!inputs.canManageSequenceVideos()) return;
    }

    inputs.enterVideoUpload();
  }

  return {
    handleOpenInCompose,
    handleEdit,
    handleVideoUpload,
  };
}

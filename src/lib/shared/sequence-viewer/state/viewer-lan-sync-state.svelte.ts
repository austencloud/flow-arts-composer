import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { createModalAccessibilityHelper } from "../services/modal-accessibility-helper.svelte";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";

interface RemotePlaybackState {
  timestamp: number;
  isPlaying: boolean;
  currentStep: number;
  speed: number;
}

interface ViewerLanSyncInputs {
  playback: PlaybackControllerState;
  accessibilityHelper: ReturnType<typeof createModalAccessibilityHelper>;
  getSequence: () => SequenceData | null;
  getPlaybackController: () => AnimationPlaybackController | null;
  getHapticService: () => HapticFeedback | null;
}

interface ViewerLanSyncDependencies {
  getPlaybackState: () => RemotePlaybackState;
  getIsConnected: () => boolean;
  getIsActive: () => boolean;
  setLocalSequence: (sequence: Record<string, unknown> | null) => void;
  toggleSync: (
    sequenceId: string,
    sequenceWord: string,
    playbackState: {
      sequenceId: string;
      currentStep: number;
      isPlaying: boolean;
      speed: number;
      shouldLoop: boolean;
    }
  ) => Promise<boolean>;
  disconnect: () => void;
}

export function createViewerLanSyncState(
  inputs: ViewerLanSyncInputs,
  dependencies: ViewerLanSyncDependencies
) {
  let isSyncToggling = $state(false);
  let lastAppliedSyncTimestamp = 0;

  function applyRemotePlayback(): void {
    const remote = dependencies.getPlaybackState();
    const controller = inputs.getPlaybackController();
    if (!dependencies.getIsConnected() || !controller) return;
    if (remote.timestamp <= lastAppliedSyncTimestamp) return;

    lastAppliedSyncTimestamp = remote.timestamp;
    if (remote.isPlaying !== inputs.playback.isPlayingLocal) {
      controller.togglePlayback();
    }
    if (Math.abs(remote.currentStep - inputs.playback.currentStepLocal) > 0.5) {
      controller.jumpToStep(remote.currentStep);
    }
    if (Math.abs(remote.speed - inputs.playback.bpmLocal / 60) > 0.01) {
      controller.setSpeed(remote.speed);
    }
  }

  async function handleSyncToggle(): Promise<void> {
    const sequence = inputs.getSequence();
    if (isSyncToggling || !sequence) return;

    isSyncToggling = true;
    inputs.getHapticService()?.trigger("selection");
    try {
      const sequenceWord = sequence.word || sequence.name || "Sequence";
      dependencies.setLocalSequence(
        sequence as unknown as Record<string, unknown>
      );
      const isNowSyncing = await dependencies.toggleSync(
        sequence.id,
        sequenceWord,
        {
          sequenceId: sequence.id,
          currentStep: inputs.playback.currentStepLocal,
          isPlaying: inputs.playback.isPlayingLocal,
          speed: inputs.playback.bpmLocal / 60,
          shouldLoop: true,
        }
      );
      if (!isNowSyncing) dependencies.setLocalSequence(null);

      inputs
        .getHapticService()
        ?.trigger(isNowSyncing ? "success" : "selection");
      inputs.accessibilityHelper.announce(
        isNowSyncing ? "Sync enabled. Searching for peers." : "Sync disabled"
      );
    } catch (error) {
      console.error("[Sync] Toggle failed:", error);
      inputs.getHapticService()?.trigger("error");
      inputs.accessibilityHelper.announce("Sync failed. Please try again.");
    } finally {
      isSyncToggling = false;
    }
  }

  function disconnect(): void {
    if (dependencies.getIsConnected()) dependencies.disconnect();
  }

  return {
    get isSyncToggling() {
      return isSyncToggling;
    },
    get isActive() {
      return dependencies.getIsActive();
    },
    get isConnected() {
      return dependencies.getIsConnected();
    },
    applyRemotePlayback,
    handleSyncToggle,
    disconnect,
  };
}

export type ViewerLanSyncState = ReturnType<typeof createViewerLanSyncState>;

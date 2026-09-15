import {
  clampDisplayedBeatNumber,
  displayedBeatNumber,
} from "$lib/shared/animation-engine/services/step-calculator";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import { getStepIndexFromVideo } from "$lib/shared/video-collaboration/utils/step-map-utils";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
import type { PlaybackControllerState } from "../components/playback-controller.svelte";
import type { PlaybackSource } from "../domain/viewer-orchestrator-context";
import { resolveCurrentStepData } from "../services/viewer-orchestrator-model";

interface ViewerPlaybackPresentationInputs {
  modalAnimationState: AnimationPanelState;
  playback: PlaybackControllerState;
}

export function createViewerPlaybackPresentationState(
  inputs: ViewerPlaybackPresentationInputs
) {
  let playbackSource = $state<PlaybackSource>("animation");
  let videoPlaybackBeatIndex = $state<number | null>(null);
  let activeStepMap = $state<StepMap | null>(null);
  let activeHandLabeling = $state<HandLabeling | null>(null);

  const showPreviousBeat = $derived.by(() => {
    const currentStep = inputs.playback.currentStepLocal;
    const parkedOnBoundary =
      currentStep >= 1 &&
      Math.abs(currentStep - Math.round(currentStep)) < 0.01;
    if (!parkedOnBoundary) return false;
    if (inputs.playback.arrivedViaStepping && !inputs.playback.isPlayingLocal) {
      return true;
    }
    return (
      inputs.playback.isPlayingLocal &&
      inputs.modalAnimationState.playbackMode === "step"
    );
  });

  const highlightedStepIndex = $derived.by(() => {
    if (playbackSource === "video" && videoPlaybackBeatIndex !== null) {
      return videoPlaybackBeatIndex;
    }
    if (
      !inputs.playback.isPlayingLocal &&
      inputs.playback.currentStepLocal < 0.5
    ) {
      return null;
    }
    const displayedBeat = displayedBeatNumber(
      inputs.playback.currentStepLocal,
      showPreviousBeat
    );
    const totalMotionBeats =
      inputs.modalAnimationState.sequenceData?.steps?.length ?? 0;
    return clampDisplayedBeatNumber(displayedBeat, totalMotionBeats) - 1;
  });

  const currentStepData = $derived(
    resolveCurrentStepData(
      inputs.modalAnimationState.sequenceData,
      inputs.playback.currentStepLocal,
      showPreviousBeat
    )
  );
  const currentLetter = $derived(currentStepData?.letter ?? null);

  function handleVideoTimeUpdate(currentTime: number): void {
    if (playbackSource !== "video" || !activeStepMap) return;
    const stepNumber = getStepIndexFromVideo(currentTime, activeStepMap);
    if (stepNumber !== videoPlaybackBeatIndex) {
      videoPlaybackBeatIndex = stepNumber;
    }
  }

  function setPlaybackSource(source: PlaybackSource): void {
    playbackSource = source;
    if (source === "animation") videoPlaybackBeatIndex = null;
  }

  function setActiveStepMap(beatMap: StepMap | null): void {
    activeStepMap = beatMap;
    if (!beatMap) {
      playbackSource = "animation";
      videoPlaybackBeatIndex = null;
    }
  }

  function setActiveHandLabeling(labeling: HandLabeling | null): void {
    activeHandLabeling = labeling;
  }

  return {
    get playbackSource() {
      return playbackSource;
    },
    get videoPlaybackBeatIndex() {
      return videoPlaybackBeatIndex;
    },
    get activeStepMap() {
      return activeStepMap;
    },
    get activeHandLabeling() {
      return activeHandLabeling;
    },
    get currentStepData() {
      return currentStepData;
    },
    get currentLetter() {
      return currentLetter;
    },
    get highlightedStepIndex() {
      return highlightedStepIndex;
    },
    handleVideoTimeUpdate,
    setPlaybackSource,
    setActiveStepMap,
    setActiveHandLabeling,
  };
}

export type ViewerPlaybackPresentationState = ReturnType<
  typeof createViewerPlaybackPresentationState
>;

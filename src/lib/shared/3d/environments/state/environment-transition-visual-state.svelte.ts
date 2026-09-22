import type { EnvironmentTransitionPhase } from "../domain/environment-transition";

export function createEnvironmentTransitionVisualState() {
  let opacity = $state(0);
  let phase = $state<EnvironmentTransitionPhase>("idle");
  let rendererReady = $state(false);
  let captureFrame: (() => void) | null = null;

  function registerFrameCapture(capture: () => void): () => void {
    captureFrame = capture;
    return () => {
      if (captureFrame === capture) captureFrame = null;
    };
  }

  function setFrame(
    nextOpacity: number,
    nextPhase: EnvironmentTransitionPhase
  ): void {
    opacity = Math.max(0, Math.min(1, nextOpacity));
    phase = nextPhase;
  }

  function setRendererReady(ready: boolean): void {
    rendererReady = ready;
  }

  function reset(): void {
    opacity = 0;
    phase = "idle";
    rendererReady = false;
  }

  return {
    get opacity() {
      return opacity;
    },
    get phase() {
      return phase;
    },
    get active() {
      return phase !== "idle";
    },
    get rendererReady() {
      return rendererReady;
    },
    setFrame,
    setRendererReady,
    registerFrameCapture,
    retainFrame: () => captureFrame?.(),
    reset,
  };
}

export type EnvironmentTransitionVisualState = ReturnType<
  typeof createEnvironmentTransitionVisualState
>;

/**
 * Mounts TunnelArtView with a playing flag and playhead a test can change,
 * on a controller that reports a build error. The error keeps the canvas
 * (AnimatorCanvas) from mounting, so the self-clock is the only thing in the
 * component that asks for animation frames.
 */
import { flushSync, mount, unmount } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
import type { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";

/** Four steps and a four-step loop: one beat per second at the default 60 BPM. */
const SEQUENCE = {
  id: "clock-test",
  steps: [{}, {}, {}, {}],
} as unknown as SequenceData;

const CONTROLLER = {
  buildError: "stubbed",
  loopSteps: 4,
} as unknown as TunnelViewController;

export function mountTunnelClock(target: HTMLElement, playing: boolean) {
  const state = $state({ playing, step: 1 });
  const component = mount(TunnelArtView, {
    target,
    props: {
      sequence: SEQUENCE,
      controller: CONTROLLER,
      get playing() {
        return state.playing;
      },
      get currentStep() {
        return state.step;
      },
      set currentStep(next: number) {
        state.step = next;
      },
    },
  });
  flushSync();
  return {
    get step(): number {
      return state.step;
    },
    setPlaying(next: boolean): void {
      state.playing = next;
      flushSync();
    },
    destroy(): void {
      unmount(component);
    },
  };
}

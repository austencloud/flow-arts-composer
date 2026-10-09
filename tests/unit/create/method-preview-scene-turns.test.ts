/**
 * A Create method preview scene runs one cancellable timeline per turn. A
 * run cut off mid-scene fades through to the finished picture; a run that
 * finished, or reduced motion, settles at once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneRun } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import type { SceneTurnHooks } from "$lib/features/create/shared/components/method-previews/method-preview-scene-turns.svelte";
import { sceneTurnsHarness } from "./method-preview-scene-turns-harness.svelte";

interface FakeAnimation {
  keyframes: Keyframe[];
  onfinish: (() => void) | null;
  cancel: ReturnType<typeof vi.fn>;
}

/**
 * A root whose animate() records each fade instead of running it. It is in
 * the document until a test sets `isConnected` to false.
 */
function fadingRoot() {
  const animations: FakeAnimation[] = [];
  const element = {
    isConnected: true,
    animate: (keyframes: Keyframe[]) => {
      const animation: FakeAnimation = {
        keyframes,
        onfinish: null,
        cancel: vi.fn(),
      };
      animations.push(animation);
      return animation;
    },
  } as unknown as HTMLElement;
  return { element, animations };
}

/** A scene that records its runs. Unless it finishes, it plays until cut. */
function recorder(finishes = false) {
  const runs: SceneRun[] = [];
  const play = async (run: SceneRun): Promise<void> => {
    runs.push(run);
    if (!finishes) await run.wait(60_000);
  };
  return { runs, play };
}

/** Let a finished run's promise chain settle. */
const flushRun = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let live: ReturnType<typeof sceneTurnsHarness> | null = null;

function setup(
  play: (run: SceneRun) => Promise<void>,
  overrides: Partial<SceneTurnHooks> = {}
) {
  const settle = vi.fn();
  live = sceneTurnsHarness(play, {
    root: () => null,
    settle,
    reducedMotion: () => false,
    ...overrides,
  });
  return { harness: live, settle };
}

afterEach(() => {
  live?.dispose();
  live = null;
});

describe("scene turns", () => {
  it("starts a run when the card starts playing", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    expect(runs).toHaveLength(0);
    harness.set({ playing: true, turn: 1 });
    expect(runs).toHaveLength(1);
  });

  it("ends the last run and starts a fresh one for a new turn", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ playing: true, turn: 1 });
    harness.set({ turn: 2 });
    expect(runs).toHaveLength(2);
    expect(runs[0]!.aborted).toBe(true);
    expect(runs[1]!.aborted).toBe(false);
  });

  it("starts nothing when the turn moves on while another card plays", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ turn: 4 });
    expect(runs).toHaveLength(0);
  });

  it("settles at once when a finished run ends", async () => {
    const { runs, play } = recorder(true);
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    await flushRun();
    harness.set({ playing: false });
    expect(runs[0]!.aborted).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
  });

  it("fades a cut run out, settles, then fades the finished picture in", () => {
    const { runs, play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    expect(runs[0]!.aborted).toBe(true);
    expect(animations).toHaveLength(1);
    expect(animations[0]!.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(settle).not.toHaveBeenCalled();
    animations[0]!.onfinish?.();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(2);
    expect(animations[1]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(animations[0]!.cancel).toHaveBeenCalled();
  });

  it("settles a fade still running before the next run starts", () => {
    const { runs, play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    harness.set({ playing: true, turn: 2 });
    expect(animations[0]!.cancel).toHaveBeenCalled();
    expect(settle).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(2);
    animations[0]!.onfinish?.();
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("settles a cut run at once under reduced motion", () => {
    const { play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, {
      root: () => element,
      reducedMotion: () => true,
    });
    harness.set({ playing: true, turn: 1 });
    harness.set({ playing: false });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(animations).toHaveLength(0);
  });

  it("ends the run when the scene goes away", () => {
    const { runs, play } = recorder();
    const { harness } = setup(play);
    harness.set({ playing: true, turn: 1 });
    harness.dispose();
    live = null;
    expect(runs[0]!.aborted).toBe(true);
  });

  it("settles at once when the scene goes away mid-turn", () => {
    const { runs, play } = recorder();
    const { element, animations } = fadingRoot();
    const { harness, settle } = setup(play, { root: () => element });
    harness.set({ playing: true, turn: 1 });
    // Unmounting takes the root out of the document before the run ends;
    // bind:this clears it a microtask later.
    (element as { isConnected: boolean }).isConnected = false;
    harness.dispose();
    live = null;
    expect(runs[0]!.aborted).toBe(true);
    expect(animations).toHaveLength(0);
    expect(settle).toHaveBeenCalledTimes(1);
  });
});

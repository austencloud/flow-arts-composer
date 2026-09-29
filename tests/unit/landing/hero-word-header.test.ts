/**
 * The homepage hero's whole-word header names the sequence the engine is
 * playing. At a loop boundary the playback controller loads the prepared
 * continuation before it asks the host to publish it, and the hero act's
 * accept can decline (hero-act.svelte.ts), so the header must follow the
 * engine rather than the host's `sequence` prop.
 */
import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "$lib/shared/landing/data/demo-sequence.json";
import { PLAYBACK_MAX_BPM } from "$lib/shared/animation-engine/domain/constants/timing";
import type { PreparedSequenceHandoff } from "$lib/shared/animation-engine/domain/chaining-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Load the player chunk that SequenceHeroDemo's LazyMount imports before the
// test starts, so the test's time budget covers playback, not a cold import.
await import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte");
const { default: SequenceHeroDemo } =
  await import("$lib/shared/landing/components/SequenceHeroDemo.svelte");

const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
const originalCreateElement = document.createElement;
const originalAnimate = Element.prototype.animate;

afterEach(() => {
  document.createElement = originalCreateElement;
  Element.prototype.animate = originalAnimate;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** jsdom has no Web Animations API, which Svelte transitions run on. This
 *  stand-in finishes on the next task, which is all a transition waits for. */
function finishOnNextTask(): Animation {
  const animation = {
    currentTime: 0,
    effect: null,
    playState: "finished",
    onfinish: null as (() => void) | null,
    cancel() {},
  };
  setTimeout(() => animation.onfinish?.());
  return animation as unknown as Animation;
}

/** A short cut of the hero's fallback LOOP, so one pass ends within seconds. */
function heroSequence(
  id: string,
  word: string,
  stepCount: number
): SequenceData {
  const fallback = demo as unknown as SequenceData;
  return { ...fallback, id, word, steps: fallback.steps.slice(0, stepCount) };
}

/** The header's letters as rendered, whether as text or as glyph images. */
function headerWord(host: HTMLElement): string {
  return Array.from(
    host.querySelectorAll(".word-header .word-text .letter"),
    (letter) =>
      letter.querySelector("img")?.alt ?? letter.textContent?.trim() ?? ""
  ).join("");
}

describe("homepage hero word header", () => {
  it("names the sequence the engine is playing, even before the host adopts it", async () => {
    document.createElement = realCreateElement.bind(document);
    Element.prototype.animate = finishOnNextTask;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    // jsdom has neither OffscreenCanvas nor SVG layout, so the canvas and
    // glyph renderers report failed starts. Playback and the header run
    // without them; any other error still prints.
    const printError = console.error;
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const message = args.map(String).join(" ");
      const jsdomGap =
        message.includes("OffscreenCanvas is not defined") ||
        message.includes("getBBox is not a function");
      if (!jsdomGap) printError(...args);
    });

    const outgoing = heroSequence("hero-header-outgoing", "MYΩN", 4);
    const incoming = heroSequence("hero-header-incoming", "MY", 2);
    // Declines to publish, as the hero act does when its identity guard
    // fails: the host prop stays on `outgoing` while the engine plays
    // `incoming`.
    const accept = vi.fn();
    let offered = false;
    const onSequenceBoundary = (): PreparedSequenceHandoff | null => {
      if (offered) return null;
      offered = true;
      return { sequence: incoming, accept };
    };

    const host = document.createElement("div");
    document.body.append(host);
    const component = mount(SequenceHeroDemo, {
      target: host,
      props: {
        sequence: outgoing,
        note: "a sequence in TKA notation",
        onSequenceBoundary,
        externalBpm: PLAYBACK_MAX_BPM,
        showWordHeader: true,
        loadPriority: "immediate",
      },
    });

    try {
      // The first wait covers the player's lazy startup, slow under jsdom.
      await vi.waitFor(() => expect(headerWord(host)).toBe("MYΩN"), {
        timeout: 20_000,
      });
      await vi.waitFor(() => expect(accept).toHaveBeenCalledOnce(), {
        timeout: 15_000,
      });
      await vi.waitFor(() => expect(headerWord(host)).toBe("MY"), {
        timeout: 5_000,
      });
    } finally {
      unmount(component);
      host.remove();
    }
  }, 45_000);
});

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import CrossfadeRevertHarness from "./CrossfadeRevertHarness.svelte";
import {
  contentOf,
  CrossfadeDom,
  layerAt,
  layers,
} from "./crossfade-dom-fakes";

/**
 * Crossfade (animateHeight) must keep following the layer the user can see
 * when `key` reverts to a layer that is still fading out.
 *
 * Svelte's `{#key}` block RESUMES an outro-ing branch when the key returns to
 * its value instead of remounting it, so the same `.layer` node comes back and
 * `use:trackLayer` never runs a second time. The box stayed tracked to the
 * layer that was now leaving, and once that layer was destroyed its action
 * teardown dropped the tracking entirely: the box froze at the departed
 * layer's height and clipped the visible one (seen on /guide/motion-paths:
 * Shape matrix -> Sequence -> Shape matrix within the fade left the controls
 * box at 52px with 244px of matrix controls inside it).
 *
 * The bug is silent: nothing throws, the layer is simply cut off.
 */

let dom: CrossfadeDom;
const cleanups: Array<() => void> = [];

beforeEach(() => {
  dom = new CrossfadeDom();
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  dom.restore();
});

describe("Crossfade animateHeight: key reverts to a layer mid-outro", () => {
  it("re-tracks the resumed layer so the box eases back to its height", () => {
    const harness = mount(CrossfadeRevertHarness, { target: document.body });
    cleanups.push(() => void unmount(harness));
    flushSync();
    dom.settleFrames();

    const box = document.querySelector<HTMLElement>(".crossfade");
    if (!box) throw new Error("crossfade box did not mount");
    expect(box.style.height).toBe("244px");

    // Swap to the short layer: the tall one starts its outro.
    harness.setKey("short");
    flushSync();
    expect(box.style.height).toBe("52px");
    expect(layers(box).map(contentOf)).toEqual(["tall", "short"]);
    const shortLayer = layerAt(box, 1);

    // Revert before the tall layer has finished leaving. Svelte resumes that
    // same layer; the box must start easing back to its height right away.
    harness.setKey("tall");
    flushSync();
    expect(layers(box).map(contentOf)).toEqual(["tall", "short"]);
    expect(box.style.height).toBe("244px");

    // The short layer finishes its outro and is destroyed.
    dom.settleTransitions(shortLayer);
    flushSync();
    expect(layers(box).map(contentOf)).toEqual(["tall"]);
    expect(box.style.height).toBe("244px");

    // Tracking must survive the departure: a later reflow of the resumed
    // layer still reaches the box.
    const tallLayer = layerAt(box, 0);
    tallLayer
      .querySelector("[data-content]")
      ?.setAttribute("data-height", "300");
    dom.notifyResize(tallLayer);
    dom.settleFrames();
    expect(box.style.height).toBe("300px");
  });

  it("keeps the ordinary swap unchanged: the box follows the new layer and drops the old one", () => {
    const harness = mount(CrossfadeRevertHarness, { target: document.body });
    cleanups.push(() => void unmount(harness));
    flushSync();
    dom.settleFrames();

    const box = document.querySelector<HTMLElement>(".crossfade");
    if (!box) throw new Error("crossfade box did not mount");
    expect(box.style.height).toBe("244px");

    harness.setKey("short");
    flushSync();
    const tallLayer = layerAt(box, 0);
    const shortLayer = layerAt(box, 1);
    expect(box.style.height).toBe("52px");

    dom.settleTransitions(tallLayer);
    flushSync();
    expect(layers(box)).toEqual([shortLayer]);
    expect(box.style.height).toBe("52px");

    shortLayer
      .querySelector("[data-content]")
      ?.setAttribute("data-height", "80");
    dom.notifyResize(shortLayer);
    dom.settleFrames();
    expect(box.style.height).toBe("80px");
  });
});

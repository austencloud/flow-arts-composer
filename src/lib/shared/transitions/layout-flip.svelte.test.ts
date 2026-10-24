import { describe, expect, it, afterEach, vi } from "vitest";
import { createLayoutMotion } from "./layout-flip";

/**
 * These run in a real browser (vitest-browser-svelte) because the whole point of
 * the module is measured geometry and Web Animations — neither survives jsdom.
 */

let root: HTMLElement | null = null;

function mountRow(keys: string[], cellWidth = 100): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText =
    "display: flex; width: 600px; align-items: stretch;";
  for (const key of keys) {
    const cell = document.createElement("div");
    cell.dataset.cellKey = key;
    cell.style.cssText = `width: ${cellWidth}px; height: 80px; flex: 0 0 auto;`;
    container.append(cell);
  }
  document.body.append(container);
  root = container;
  return container;
}

function flipFor(
  container: HTMLElement,
  duration = 280,
  suspendDescendantTransitions = false
) {
  return createLayoutMotion({
    getRoot: () => container,
    groups: [{ selector: "[data-cell-key]", datasetKey: "cellKey" }],
    getDuration: () => duration,
    suspendDescendantTransitions,
  });
}

/** `Animation.effect` is typed as the abstract base; keyframes live on the
 * concrete effect the Web Animations API actually hands back. */
function keyframesOf(animation: Animation | undefined): Keyframe[] {
  expect(animation).toBeDefined();
  const effect = animation?.effect;
  expect(effect).toBeInstanceOf(KeyframeEffect);
  return (effect as KeyframeEffect).getKeyframes();
}

function startTransform(animation: Animation | undefined): string {
  return String(keyframesOf(animation)[0]?.transform ?? "");
}

function cell(container: HTMLElement, key: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-cell-key="${key}"]`
  );
  if (!found) throw new Error(`no cell ${key}`);
  return found;
}

afterEach(() => {
  root?.remove();
  root = null;
});

describe("createLayoutMotion", () => {
  it("animates the survivors when a member leaves the layout", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container);

    expect(flip.capture()).toBe(true);
    cell(container, "b").remove();
    const animations = flip.play();

    // "a" did not move; "b" is gone; only "c" slid left into b's place.
    expect(animations).toHaveLength(1);
    expect(cell(container, "c").getAnimations()).toHaveLength(1);
    expect(cell(container, "a").getAnimations()).toHaveLength(0);
  });

  it("starts the survivor at its old position and lands it on none", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container);

    flip.capture();
    cell(container, "b").remove();
    const [animation] = flip.play();

    const keyframes = keyframesOf(animation);
    // 100px cell removed to its left, so it starts one cell-width to the right.
    expect(keyframes[0]?.transform).toContain("translate(100px, 0px)");
    expect(keyframes.at(-1)?.transform).toBe("none");
  });

  it("runs on the requested clock", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container, 280);

    flip.capture();
    cell(container, "b").remove();
    const [animation] = flip.play();

    expect(animation?.effect?.getComputedTiming().duration).toBe(280);
  });

  it("scales x and y independently when a cell changes aspect ratio", () => {
    const container = mountRow(["a"]);
    const flip = flipFor(container);

    flip.capture();
    const target = cell(container, "a");
    target.style.width = "200px"; // 100 -> 200
    target.style.height = "40px"; // 80 -> 40
    const [animation] = flip.play();

    expect(startTransform(animation)).toContain("scale(0.5, 2)");
  });

  it("does nothing when nothing moved", () => {
    const container = mountRow(["a", "b"]);
    const flip = flipFor(container);

    flip.capture();
    expect(flip.play()).toHaveLength(0);
  });

  it("declines to capture at zero duration, so reduced motion snaps", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container, 0);

    expect(flip.capture()).toBe(false);
    cell(container, "b").remove();
    expect(flip.play()).toHaveLength(0);
    expect(cell(container, "c").getAnimations()).toHaveLength(0);
  });

  it("discard drops a snapshot without playing it", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container);

    flip.capture();
    expect(flip.hasCapture).toBe(true);
    flip.discard();
    expect(flip.hasCapture).toBe(false);

    cell(container, "b").remove();
    expect(flip.play()).toHaveLength(0);
  });

  it("suspends descendant transitions for the lifetime of a layout move", async () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container, 280, true);

    flip.capture();
    expect(
      container.hasAttribute("data-layout-motion-suspend-descendants")
    ).toBe(true);
    cell(container, "b").remove();
    const animations = flip.play();
    expect(
      container.hasAttribute("data-layout-motion-suspend-descendants")
    ).toBe(true);

    animations.forEach((animation) => animation.finish());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      container.hasAttribute("data-layout-motion-suspend-descendants")
    ).toBe(false);
  });

  it("releases descendant transitions when a capture is discarded", () => {
    const container = mountRow(["a", "b"]);
    const flip = flipFor(container, 280, true);

    flip.capture();
    flip.discard();

    expect(
      container.hasAttribute("data-layout-motion-suspend-descendants")
    ).toBe(false);
  });

  it("chains an interrupted transition from where it had actually reached", () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container);

    flip.capture();
    cell(container, "b").remove();
    const [first] = flip.play();
    expect(first).toBeDefined();
    // Park the first glide partway through its 100px journey.
    first!.currentTime = 140;
    first!.pause();

    flip.capture();
    const [second] = flip.play();

    expect(first!.playState).toBe("idle");
    // Capture read the mid-flight rect before cancelling, so the second glide
    // resumes from the distance still left to travel. Had capture cancelled
    // first, the cell would already sit at its destination and there would be
    // no second animation at all.
    const remaining = Number(
      /translate\((-?[\d.]+)px/.exec(startTransform(second))?.[1]
    );
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(100);
  });

  it("keeps descendants suspended across an interrupted layout move", async () => {
    const container = mountRow(["a", "b", "c"]);
    const flip = flipFor(container, 280, true);

    flip.capture();
    cell(container, "b").remove();
    const [first] = flip.play();
    first!.currentTime = 140;
    first!.pause();

    flip.capture();
    expect(
      container.hasAttribute("data-layout-motion-suspend-descendants")
    ).toBe(true);
    const second = flip.play();
    second.forEach((animation) => animation.finish());

    // The browser sends finish events with its next frame update, which a
    // zero-length timer only beats when the machine is idle.
    await vi.waitFor(() => {
      expect(
        container.hasAttribute("data-layout-motion-suspend-descendants")
      ).toBe(false);
    });
  });

  it("moves the keyed element, never an inner wrapper", () => {
    // The cell's background lives on the outer box. Transforming a descendant
    // would park that box at the destination and slide its contents over it.
    const container = mountRow(["a", "b", "c"]);
    for (const outer of container.querySelectorAll<HTMLElement>(
      "[data-cell-key]"
    )) {
      const shell = document.createElement("div");
      shell.className = "shell";
      shell.style.cssText = "width: 100%; height: 100%;";
      outer.append(shell);
    }

    const flip = flipFor(container);
    flip.capture();
    cell(container, "b").remove();
    flip.play();

    const survivor = cell(container, "c");
    expect(survivor.getAnimations()).toHaveLength(1);
    expect(
      survivor.querySelector<HTMLElement>(".shell")!.getAnimations()
    ).toHaveLength(0);
  });
});

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrossfadeRevertHarness from "./CrossfadeRevertHarness.svelte";

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

// vitest-setup.ts replaces document.createElement with plain non-Node stubs
// for canvas tests. Mounting a real component needs the jsdom original, which
// has to come from document's own prototype chain (the vitest globals live in
// a different realm than jsdom's window).
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

// Same realm rule for prototypes: resolve HTMLElement.prototype from a real
// element rather than from the global constructor.
function jsdomHtmlElementPrototype(): HTMLElement {
  const div = realCreateElement.call(document, "div");
  return Object.getPrototypeOf(Object.getPrototypeOf(div)) as HTMLElement;
}

/**
 * Stand-in for a Web Animation. Nothing advances on its own: a test finishes
 * an animation explicitly, which is how it holds a layer mid-outro.
 */
class FakeAnimation {
  onfinish: (() => void) | null = null;
  effect: unknown = null;
  currentTime = 0;
  playState: AnimationPlayState = "running";

  constructor(
    readonly element: Element,
    readonly keyframes: unknown,
    readonly options: KeyframeAnimationOptions | number | undefined
  ) {}

  cancel(): void {
    this.playState = "idle";
  }

  finish(): void {
    if (this.playState !== "running") return;
    this.playState = "finished";
    this.onfinish?.();
  }
}

let animations: FakeAnimation[] = [];

/**
 * Runs a layer's Svelte transition to completion. Svelte first plays a
 * zero-length "delay" animation whose onfinish starts the real one, so keep
 * finishing this element's pending animations until none are left.
 */
function settleTransitions(element: Element): void {
  for (let guard = 0; guard < 10; guard += 1) {
    const pending = animations.filter(
      (animation) =>
        animation.element === element && animation.playState === "running"
    );
    if (pending.length === 0) return;
    for (const animation of pending) animation.finish();
  }
  throw new Error("transition never settled");
}

/** Resize notifications waiting for the next frame, like a browser queues them. */
let pendingResizes: Array<{ observer: FakeResizeObserver; target: Element }> =
  [];

class FakeResizeObserver {
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
    // Browsers always deliver one initial notification for a new target.
    pendingResizes.push({ observer: this, target });
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    this.disconnected = true;
  }
}

/** Queues a size change on `target` for every observer watching it. */
function notifyResize(target: Element): void {
  for (const observer of observers) {
    if (!observer.targets.has(target)) continue;
    pendingResizes.push({ observer, target });
  }
}

let observers: FakeResizeObserver[] = [];
let frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameHandle = 1;

/**
 * One rendering opportunity: animation-frame callbacks first, then resize
 * notifications (a callback that schedules a frame from inside a resize
 * notification runs on the NEXT frame, as it does in a browser).
 */
function renderFrame(): void {
  const frames = Array.from(frameCallbacks.values());
  frameCallbacks.clear();
  for (const callback of frames) callback(0);

  const resizes = pendingResizes;
  pendingResizes = [];
  for (const { observer, target } of resizes) {
    if (observer.disconnected || !observer.targets.has(target)) continue;
    observer.callback([], observer as unknown as ResizeObserver);
  }
}

function settleFrames(): void {
  for (let frame = 0; frame < 4; frame += 1) renderFrame();
}

const cleanups: Array<() => void> = [];

beforeEach(() => {
  animations = [];
  frameCallbacks = new Map();
  pendingResizes = [];
  observers = [];

  const originalCreateElement = document.createElement;
  (document as { createElement: typeof document.createElement }).createElement =
    realCreateElement.bind(document);
  cleanups.push(() => {
    (document as { createElement: typeof document.createElement }).createElement =
      originalCreateElement;
  });

  const proto = jsdomHtmlElementPrototype();

  const originalAnimate = Object.getOwnPropertyDescriptor(proto, "animate");
  Object.defineProperty(proto, "animate", {
    configurable: true,
    writable: true,
    value(
      this: HTMLElement,
      keyframes: unknown,
      options?: KeyframeAnimationOptions | number
    ) {
      const animation = new FakeAnimation(this, keyframes, options);
      animations.push(animation);
      return animation as unknown as Animation;
    },
  });
  cleanups.push(() => {
    if (originalAnimate) Object.defineProperty(proto, "animate", originalAnimate);
    else delete (proto as { animate?: unknown }).animate;
  });

  // jsdom has no layout. A content node declares its natural height, a layer
  // is as tall as its content, and the box reports the inline height the
  // component wrote (or its tallest layer before the first measurement).
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    proto,
    "offsetHeight"
  );
  Object.defineProperty(proto, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      const declared = this.getAttribute("data-height");
      if (declared !== null) return Number(declared);
      if (this.style.height) return Number.parseFloat(this.style.height);
      let tallest = 0;
      for (const child of this.children) {
        tallest = Math.max(tallest, (child as HTMLElement).offsetHeight);
      }
      return tallest;
    },
  });
  cleanups.push(() => {
    if (originalOffsetHeight)
      Object.defineProperty(proto, "offsetHeight", originalOffsetHeight);
  });

  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const handle = nextFrameHandle++;
    frameCallbacks.set(handle, callback);
    return handle;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frameCallbacks.delete(handle);
  });
  cleanups.push(() => vi.unstubAllGlobals());
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.innerHTML = "";
});

function layers(box: HTMLElement): HTMLElement[] {
  return Array.from(box.children).filter((child) =>
    child.classList.contains("layer")
  ) as HTMLElement[];
}

function layerAt(box: HTMLElement, index: number): HTMLElement {
  const layer = layers(box)[index];
  if (!layer) throw new Error(`no layer at index ${index}`);
  return layer;
}

function contentOf(layer: HTMLElement): string | undefined {
  return layer.querySelector<HTMLElement>("[data-content]")?.dataset.content;
}

describe("Crossfade animateHeight: key reverts to a layer mid-outro", () => {
  it("re-tracks the resumed layer so the box eases back to its height", () => {
    const harness = mount(CrossfadeRevertHarness, { target: document.body });
    cleanups.push(() => void unmount(harness));
    flushSync();
    settleFrames();

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
    settleTransitions(shortLayer);
    flushSync();
    expect(layers(box).map(contentOf)).toEqual(["tall"]);
    expect(box.style.height).toBe("244px");

    // Tracking must survive the departure: a later reflow of the resumed
    // layer still reaches the box.
    const tallLayer = layerAt(box, 0);
    tallLayer
      .querySelector("[data-content]")
      ?.setAttribute("data-height", "300");
    notifyResize(tallLayer);
    settleFrames();
    expect(box.style.height).toBe("300px");
  });

  it("keeps the ordinary swap unchanged: the box follows the new layer and drops the old one", () => {
    const harness = mount(CrossfadeRevertHarness, { target: document.body });
    cleanups.push(() => void unmount(harness));
    flushSync();
    settleFrames();

    const box = document.querySelector<HTMLElement>(".crossfade");
    if (!box) throw new Error("crossfade box did not mount");
    expect(box.style.height).toBe("244px");

    harness.setKey("short");
    flushSync();
    const tallLayer = layerAt(box, 0);
    const shortLayer = layerAt(box, 1);
    expect(box.style.height).toBe("52px");

    settleTransitions(tallLayer);
    flushSync();
    expect(layers(box)).toEqual([shortLayer]);
    expect(box.style.height).toBe("52px");

    shortLayer
      .querySelector("[data-content]")
      ?.setAttribute("data-height", "80");
    notifyResize(shortLayer);
    settleFrames();
    expect(box.style.height).toBe("80px");
  });
});

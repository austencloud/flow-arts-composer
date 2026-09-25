import { vi } from "vitest";

/**
 * Just enough browser for Crossfade's animateHeight path in jsdom: Web
 * Animations that only advance when a test says so, ResizeObserver and
 * animation-frame delivery in browser order, and a tiny layout model.
 *
 * Layout model: a content node declares its natural height with
 * `data-height`, a layer is as tall as its content, and the box reports the
 * height it is animating through, else the inline height the component wrote,
 * else its tallest layer. Anything under an inline `display: none` (a closed
 * dialog) has no boxes: no client rects and an offsetHeight of 0.
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

type Keyframes = Array<Record<string, string>>;

function timingOf(options: KeyframeAnimationOptions | number | undefined): {
  delay: number;
  duration: number;
} {
  if (typeof options === "number") return { delay: 0, duration: options };
  return {
    delay: options?.delay ?? 0,
    duration: Number(options?.duration ?? 0),
  };
}

/**
 * Stand-in for a Web Animation. Nothing advances on its own: a test moves
 * `currentTime` or finishes an animation explicitly, which is how it holds a
 * layer mid-outro or a box mid-ease.
 */
export class FakeAnimation {
  onfinish: (() => void) | null = null;
  currentTime = 0;
  playState: AnimationPlayState = "running";
  // Svelte clears `effect` once its own transitions finish, so it stays a
  // plain writable field.
  effect: {
    getComputedTiming(): ComputedEffectTiming;
    getKeyframes(): Keyframes;
  } | null;

  constructor(
    readonly element: Element,
    readonly keyframes: unknown,
    readonly options: KeyframeAnimationOptions | number | undefined
  ) {
    const { delay, duration } = timingOf(options);
    this.effect = {
      getComputedTiming: () => ({
        delay,
        duration,
        activeDuration: duration,
        endTime: delay + duration,
        localTime: this.currentTime,
      }),
      getKeyframes: () => (Array.isArray(keyframes) ? keyframes : []),
    };
  }

  cancel(): void {
    this.playState = "idle";
  }

  finish(): void {
    if (this.playState !== "running") return;
    this.playState = "finished";
    this.onfinish?.();
  }
}

/** A running animation's height endpoints, or null if it does not animate height. */
export function heightKeyframes(
  animation: FakeAnimation
): { from: number; to: number } | null {
  const frames = animation.effect?.getKeyframes() ?? [];
  const first = frames[0]?.height;
  const last = frames.at(-1)?.height;
  if (first === undefined || last === undefined) return null;
  return { from: Number.parseFloat(first), to: Number.parseFloat(last) };
}

/** Linear stand-in for the height a running animation is holding right now. */
function animatedHeight(animation: FakeAnimation): number | null {
  const ends = heightKeyframes(animation);
  if (!ends) return null;
  const { delay, duration } = timingOf(animation.options);
  const active = animation.currentTime - delay;
  // `fill: "backwards"` holds the first keyframe through the delay.
  if (active <= 0 || duration <= 0) return active <= 0 ? ends.from : ends.to;
  const progress = Math.min(1, active / duration);
  return ends.from + (ends.to - ends.from) * progress;
}

function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if ((node as HTMLElement).style?.display === "none") return false;
    if (node.hasAttribute("hidden")) return false;
  }
  return true;
}

class FakeResizeObserver {
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(
    readonly callback: ResizeObserverCallback,
    private readonly dom: CrossfadeDom
  ) {}

  observe(target: Element): void {
    this.targets.add(target);
    // Browsers always deliver one initial notification for a new target.
    this.dom.pendingResizes.push({ observer: this, target });
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    this.disconnected = true;
  }
}

export class CrossfadeDom {
  readonly animations: FakeAnimation[] = [];
  /** Resize notifications waiting for the next frame, like a browser queues them. */
  pendingResizes: Array<{ observer: FakeResizeObserver; target: Element }> = [];
  private readonly observers: FakeResizeObserver[] = [];
  private frameCallbacks = new Map<number, FrameRequestCallback>();
  private nextFrameHandle = 1;
  private readonly cleanups: Array<() => void> = [];

  constructor() {
    const dom = this;

    const originalCreateElement = document.createElement;
    (
      document as { createElement: typeof document.createElement }
    ).createElement = realCreateElement.bind(document);
    this.cleanups.push(() => {
      (
        document as { createElement: typeof document.createElement }
      ).createElement = originalCreateElement;
    });

    const proto = jsdomHtmlElementPrototype();
    this.override(proto, "animate", {
      configurable: true,
      writable: true,
      value(
        this: HTMLElement,
        keyframes: unknown,
        options?: KeyframeAnimationOptions | number
      ) {
        const animation = new FakeAnimation(this, keyframes, options);
        dom.animations.push(animation);
        return animation as unknown as Animation;
      },
    });
    this.override(proto, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement): number {
        if (!isRendered(this)) return 0;
        const declared = this.getAttribute("data-height");
        if (declared !== null) return Number(declared);
        const animated = dom
          .runningOn(this)
          .map(animatedHeight)
          .filter((height): height is number => height !== null)
          .at(-1);
        if (animated !== undefined) return animated;
        if (this.style.height) return Number.parseFloat(this.style.height);
        let tallest = 0;
        for (const child of this.children) {
          tallest = Math.max(tallest, (child as HTMLElement).offsetHeight);
        }
        return tallest;
      },
    });
    this.override(proto, "getClientRects", {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        if (!isRendered(this)) return [];
        const height = this.offsetHeight;
        return [{ x: 0, y: 0, top: 0, left: 0, width: 1, height }];
      },
    });

    vi.stubGlobal(
      "ResizeObserver",
      class extends FakeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super(callback, dom);
          dom.observers.push(this);
        }
      }
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const handle = this.nextFrameHandle++;
      this.frameCallbacks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
      this.frameCallbacks.delete(handle);
    });
    this.cleanups.push(() => vi.unstubAllGlobals());
  }

  private override(
    proto: object,
    name: string,
    descriptor: PropertyDescriptor
  ): void {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    Object.defineProperty(proto, name, descriptor);
    this.cleanups.push(() => {
      if (original) Object.defineProperty(proto, name, original);
      else delete (proto as Record<string, unknown>)[name];
    });
  }

  runningOn(element: Element): FakeAnimation[] {
    return this.animations.filter(
      (animation) =>
        animation.element === element && animation.playState === "running"
    );
  }

  /** Running animations on `element` that drive its height. */
  heightAnimationsOn(element: Element): FakeAnimation[] {
    return this.runningOn(element).filter(
      (animation) => heightKeyframes(animation) !== null
    );
  }

  /**
   * Runs a layer's Svelte transition to completion. Svelte first plays a
   * zero-length "delay" animation whose onfinish starts the real one, so keep
   * finishing this element's pending animations until none are left.
   */
  settleTransitions(element: Element): void {
    for (let guard = 0; guard < 10; guard += 1) {
      const pending = this.runningOn(element);
      if (pending.length === 0) return;
      for (const animation of pending) animation.finish();
    }
    throw new Error("transition never settled");
  }

  /** Queues a size change on `target` for every observer watching it. */
  notifyResize(target: Element): void {
    for (const observer of this.observers) {
      if (!observer.targets.has(target)) continue;
      this.pendingResizes.push({ observer, target });
    }
  }

  /**
   * One rendering opportunity: animation-frame callbacks first, then resize
   * notifications (a callback that schedules a frame from inside a resize
   * notification runs on the NEXT frame, as it does in a browser).
   */
  renderFrame(): void {
    const frames = Array.from(this.frameCallbacks.values());
    this.frameCallbacks.clear();
    for (const callback of frames) callback(0);

    const resizes = this.pendingResizes;
    this.pendingResizes = [];
    for (const { observer, target } of resizes) {
      if (observer.disconnected || !observer.targets.has(target)) continue;
      observer.callback([], observer as unknown as ResizeObserver);
    }
  }

  settleFrames(): void {
    for (let frame = 0; frame < 4; frame += 1) this.renderFrame();
  }

  restore(): void {
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    document.body.innerHTML = "";
  }
}

export function layers(box: HTMLElement): HTMLElement[] {
  return Array.from(box.children).filter((child) =>
    child.classList.contains("layer")
  ) as HTMLElement[];
}

export function layerAt(box: HTMLElement, index: number): HTMLElement {
  const layer = layers(box)[index];
  if (!layer) throw new Error(`no layer at index ${index}`);
  return layer;
}

export function contentOf(layer: HTMLElement): string | undefined {
  return layer.querySelector<HTMLElement>("[data-content]")?.dataset.content;
}

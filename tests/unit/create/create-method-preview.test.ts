/**
 * The preview box in a Create front door method card: reserved and tinted
 * from first paint, hidden from assistive technology, and swapped to its
 * method's scene once the board is idle and the scene has drawn.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
import FakeMethodScene, { fakeScene } from "./FakeMethodScene.svelte";
import { mountMethodPreview } from "./create-method-preview-harness.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/**
 * jsdom has no ResizeObserver. This one reports a 120×48 box as soon as it
 * observes, and resizeTo() reports a new size to every observer still live.
 */
class BoxObserver {
  static live = new Set<BoxObserver>();
  static resizeTo(width: number, height: number): void {
    for (const observer of BoxObserver.live) observer.deliver(width, height);
  }

  private target: Element | null = null;

  constructor(private readonly report: ResizeObserverCallback) {}

  observe(target: Element): void {
    this.target = target;
    BoxObserver.live.add(this);
    this.deliver(120, 48);
  }
  unobserve(): void {}
  disconnect(): void {
    BoxObserver.live.delete(this);
  }

  private deliver(width: number, height: number): void {
    if (!this.target) return;
    const entry = { target: this.target, contentRect: { width, height } };
    this.report(
      [entry as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
}

const fakeLoader = () => Promise.resolve({ default: FakeMethodScene });

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
let preview: ReturnType<typeof mountMethodPreview> | null = null;
let stubbedCreateElement: typeof document.createElement;

beforeEach(() => {
  BoxObserver.live.clear();
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", BoxObserver);
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  preview?.destroy();
  preview = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  fakeScene.reportsReady = true;
  fakeScene.readyTimes = 1;
  fakeScene.readyDelayMs = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(props: Record<string, unknown>): void {
  component = mount(CreateMethodPreview, {
    target: host,
    props: { methodId: "construct", color: "#3b82f6", ...props },
  });
  flushSync();
}

/** Let the idle wait pass (jsdom has no requestIdleCallback, so 180ms) and the scene mount. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  flushSync();
}

/** The crossfade's two layers: the tint's, then the scene's. */
function layers(): { tint: HTMLElement; scene: HTMLElement } {
  const sources = host.querySelectorAll<HTMLElement>(".dual-source > .source");
  expect(sources).toHaveLength(2);
  return { tint: sources[0]!, scene: sources[1]! };
}

describe("CreateMethodPreview", () => {
  it("reserves a tinted box that assistive technology skips", () => {
    render({ loader: fakeLoader });
    const box = host.querySelector<HTMLElement>(".method-preview");
    expect(box).not.toBeNull();
    expect(box!.hasAttribute("inert")).toBe(true);
    expect(box!.getAttribute("aria-hidden")).toBe("true");
    expect(box!.style.getPropertyValue("--method-color")).toBe("#3b82f6");
    expect(box!.querySelector(".tint")).not.toBeNull();
    expect(box!.querySelector(".fake-scene")).toBeNull();
    expect(
      box!.querySelector("button, a, input, select, textarea, [tabindex]")
    ).toBeNull();
  });

  it("loads the scene once the board is idle and reports ready once", async () => {
    const onready = vi.fn();
    render({ loader: fakeLoader, onready });
    await vi.advanceTimersByTimeAsync(100);
    flushSync();
    expect(host.querySelector(".fake-scene")).toBeNull();
    await settle();
    const scene = host.querySelector<HTMLElement>(".fake-scene");
    expect(scene?.dataset.shape).toBe("strip");
    expect(scene?.dataset.size).toBe("120x48");
    expect(scene?.dataset.accent).toBe("#3b82f6");
    expect(onready).toHaveBeenCalledTimes(1);
    expect(onready).toHaveBeenCalledWith("construct");
  });

  it("does not load while the board is closed, and loads when it reopens", async () => {
    const loader = vi.fn(fakeLoader);
    preview = mountMethodPreview(host, { open: true, loader });
    // A method is picked before the idle wait passes.
    await vi.advanceTimersByTimeAsync(100);
    preview.setOpen(false);
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    flushSync();
    expect(loader).not.toHaveBeenCalled();
    expect(host.querySelector(".fake-scene")).toBeNull();

    preview.setOpen(true);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".fake-scene")).not.toBeNull();
  });

  it("keeps a loaded scene when the board closes", async () => {
    preview = mountMethodPreview(host, { open: true, loader: fakeLoader });
    await settle();
    const scene = host.querySelector(".fake-scene");
    expect(scene).not.toBeNull();
    preview.setOpen(false);
    await settle();
    expect(host.querySelector(".fake-scene")).toBe(scene);
  });

  it("passes the turn through once the scene is ready", async () => {
    render({ loader: fakeLoader, playing: true, turn: 3 });
    await settle();
    const scene = host.querySelector<HTMLElement>(".fake-scene");
    expect(scene?.dataset.playing).toBe("true");
    expect(scene?.dataset.turn).toBe("3");
  });

  it("does not play a scene that has not drawn yet", async () => {
    fakeScene.reportsReady = false;
    render({ loader: fakeLoader, playing: true, turn: 3 });
    await settle();
    expect(
      host.querySelector<HTMLElement>(".fake-scene")?.dataset.playing
    ).toBe("false");
  });

  it("keeps the tint for a method without a scene", async () => {
    render({ methodId: "not-a-method" });
    await settle();
    expect(host.querySelector(".tint")).not.toBeNull();
    expect(host.querySelector(".fake-scene")).toBeNull();
  });

  it("shows the tint until the scene is ready, then the scene", async () => {
    fakeScene.readyDelayMs = 1000;
    render({ loader: fakeLoader });
    let { tint, scene } = layers();
    expect(tint.querySelector(".tint")).not.toBeNull();
    expect(tint.classList.contains("active")).toBe(true);
    expect(scene.classList.contains("active")).toBe(false);

    await settle();
    ({ tint, scene } = layers());
    expect(scene.querySelector(".fake-scene")).not.toBeNull();
    expect(tint.classList.contains("active")).toBe(true);
    expect(scene.classList.contains("active")).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    flushSync();
    ({ tint, scene } = layers());
    expect(tint.classList.contains("active")).toBe(false);
    expect(scene.classList.contains("active")).toBe(true);
  });

  it("reports ready once even if the scene reports twice", async () => {
    fakeScene.readyTimes = 2;
    const onready = vi.fn();
    render({ loader: fakeLoader, onready });
    await settle();
    expect(onready).toHaveBeenCalledTimes(1);
  });

  it("keeps the scene at its last real size when the box reports none", async () => {
    render({ loader: fakeLoader });
    await settle();
    const scene = host.querySelector<HTMLElement>(".fake-scene");
    expect(scene?.dataset.size).toBe("120x48");

    BoxObserver.resizeTo(90, 40);
    flushSync();
    expect(scene?.dataset.size).toBe("90x40");

    for (const [width, height] of [
      [0, 0],
      [0, 40],
      [90, 0],
    ] as const) {
      BoxObserver.resizeTo(width, height);
      flushSync();
      expect(host.querySelector(".fake-scene")).toBe(scene);
      expect(scene?.dataset.size).toBe("90x40");
    }
  });

  it("ignores a scene that reports ready after the box is gone", async () => {
    fakeScene.readyDelayMs = 1000;
    const onready = vi.fn();
    render({ loader: fakeLoader, onready });
    await settle();
    expect(host.querySelector(".fake-scene")).not.toBeNull();

    unmount(component!);
    component = null;
    await vi.advanceTimersByTimeAsync(1500);
    flushSync();
    expect(onready).not.toHaveBeenCalled();
  });
});

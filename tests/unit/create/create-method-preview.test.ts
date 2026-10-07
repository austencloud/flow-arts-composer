/**
 * The preview box in a Create front door method card: reserved and tinted
 * from first paint, hidden from assistive technology, and swapped to its
 * method's scene once the board is idle and the scene has drawn.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateMethodPreview from "$lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
import FakeMethodScene, { fakeScene } from "./FakeMethodScene.svelte";

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

/** jsdom has no ResizeObserver. This one reports a 120×48 box at once. */
class BoxObserver {
  constructor(private readonly report: ResizeObserverCallback) {}
  observe(target: Element): void {
    const entry = { target, contentRect: { width: 120, height: 48 } };
    this.report(
      [entry as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }
  unobserve(): void {}
  disconnect(): void {}
}

const fakeLoader = () => Promise.resolve({ default: FakeMethodScene });

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;
let stubbedCreateElement: typeof document.createElement;

beforeEach(() => {
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
  host.remove();
  document.createElement = stubbedCreateElement;
  fakeScene.reportsReady = true;
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
});

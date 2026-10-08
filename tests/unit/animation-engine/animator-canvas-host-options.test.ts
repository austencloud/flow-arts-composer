/**
 * AnimatorCanvas hosts decorative previews as well as full players. Two
 * options keep a preview cheap and quiet: trailOverlay={false} reaches the
 * canvas surface (so no GPU trail layer is built), and ghostAnnotations={false}
 * keeps the admin ghost presenter from reading the preview's play state.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
import { surfaceProps } from "./RecordingCanvasSurface.svelte";

vi.mock(
  "$lib/shared/animation-engine/components/CanvasSurface.svelte",
  async () => ({
    default: (await import("./RecordingCanvasSurface.svelte")).default,
  })
);

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
  surfaceProps.last = null;
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
  document.createElement = stubbedCreateElement;
  vi.unstubAllGlobals();
});

function render(options: Record<string, unknown> = {}): HTMLElement {
  component = mount(AnimatorCanvas, {
    target: host,
    props: { leftProp: null, rightProp: null, isPlaying: true, ...options },
  });
  flushSync();
  return host.querySelector<HTMLElement>(".animation-container")!;
}

describe("AnimatorCanvas host options", () => {
  it("asks its surface for the GPU trail layer by default", () => {
    render();
    expect(surfaceProps.last?.trailOverlay).toBe(true);
  });

  it("passes a trailOverlay opt-out to its surface", () => {
    render({ trailOverlay: false });
    expect(surfaceProps.last?.trailOverlay).toBe(false);
  });

  it("annotates the stage for the ghost presenter by default", () => {
    const stage = render();
    expect(stage.dataset.ghost).toBe("safe");
    expect(stage.dataset.ghostKind).toBe("stage");
    expect(stage.dataset.ghostState).toBe("playing");
    expect(stage.hasAttribute("data-ghost-linger")).toBe(true);
  });

  it("publishes no ghost annotations when the host opts out", () => {
    const stage = render({ ghostAnnotations: false, word: "ABC" });
    for (const name of [
      "data-ghost",
      "data-ghost-kind",
      "data-ghost-state",
      "data-ghost-linger",
      "data-ghost-word",
    ]) {
      expect(stage.hasAttribute(name), name).toBe(false);
    }
  });
});

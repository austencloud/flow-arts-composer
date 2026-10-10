import { createRawSnippet, tick } from "svelte";
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import DualSourceCrossfade from "./DualSourceCrossfade.svelte";

const first = createRawSnippet(() => ({
  render: () => '<canvas data-scene="first"></canvas>',
}));
const second = createRawSnippet(() => ({
  render: () => '<canvas data-scene="second"></canvas>',
}));

afterEach(() => vi.restoreAllMocks());

const frames = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
const boxOf = (scene: string) => {
  const rect = document
    .querySelector(`[data-scene="${scene}"]`)!
    .closest(".source")!
    .getBoundingClientRect();
  return [rect.width, rect.height];
};

describe("holding the outgoing source", () => {
  it("keeps the outgoing box through a stage resize until it is shown again", async () => {
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
      holdOutgoing: true,
    });
    const stage = screen.container as HTMLElement;
    stage.style.cssText = "width: 300px; height: 200px";
    await frames();

    await screen.rerender({ active: "second" });
    stage.style.height = "500px";
    await frames();
    expect(boxOf("first")).toEqual([300, 200]);
    expect(boxOf("second")).toEqual([300, 500]);

    await screen.rerender({ active: "first" });
    expect(boxOf("first")).toEqual([300, 500]);
    expect(boxOf("second")).toEqual([300, 500]);
  });

  it("lets a hidden source follow the stage by default", async () => {
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
    });
    const stage = screen.container as HTMLElement;
    stage.style.cssText = "width: 300px; height: 200px";
    await frames();

    await screen.rerender({ active: "second" });
    stage.style.height = "500px";
    await frames();
    expect(boxOf("first")).toEqual([300, 500]);
  });
});

describe("stateful scene handoff", () => {
  it("retains both canvases while transferring interaction to the incoming scene", async () => {
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
    });
    const incoming = document.querySelector('[data-scene="second"]')!;
    const outgoing = document.querySelector('[data-scene="first"]')!;
    expect(incoming.closest(".source")?.hasAttribute("inert")).toBe(true);
    await screen.rerender({ active: "second" });
    expect(document.querySelector('[data-scene="second"]')).toBe(incoming);
    expect(document.querySelector('[data-scene="first"]')).toBe(outgoing);
    expect(incoming.closest(".source")?.hasAttribute("inert")).toBe(false);
    expect(outgoing.closest(".source")?.hasAttribute("inert")).toBe(true);
  });

  it("settles the current scene when reduced motion is enabled mid-handoff", async () => {
    const query = new EventTarget() as MediaQueryList;
    Object.defineProperty(query, "matches", {
      value: false,
      configurable: true,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue(query);
    const onsettled = vi.fn();
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
      onsettled,
    });
    await screen.rerender({ active: "second" });
    Object.defineProperty(query, "matches", { value: true });
    query.dispatchEvent(new MediaQueryListEvent("change", { matches: true }));
    await tick();
    await expect.poll(() => onsettled.mock.calls.at(-1)?.[0]).toBe("second");
  });

  it("does not report an obsolete scene after a reduced-motion reversal", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    const onsettled = vi.fn();
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
      onsettled,
    });
    await tick();
    await screen.rerender({ active: "second" });
    await screen.rerender({ active: "first" });
    await expect.poll(() => onsettled.mock.calls.at(-1)?.[0]).toBe("first");
  });
});

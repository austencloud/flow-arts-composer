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

describe("deferring the inert swap to the settle", () => {
  const sourceOf = (scene: string) =>
    document.querySelector(`[data-scene="${scene}"]`)!.closest(".source")!;
  const pointerEventsOf = (scene: string) =>
    getComputedStyle(sourceOf(scene)).pointerEvents;

  // Create's Play: flipping `inert` restyles the whole step grid (about
  // 1,260 elements), which in the tap or the movement cost a long frame. Pointer input still has to
  // move to the shown side at once, so a tap cannot land on the leaving one.
  it("blocks pointer input at once and swaps inert only when the panels settle", async () => {
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
      settleInert: true,
    });
    const stage = screen.container as HTMLElement;
    await frames();
    expect(sourceOf("second").hasAttribute("inert")).toBe(true);

    stage.setAttribute("data-panel-motion", "compositor");
    await screen.rerender({ active: "second" });
    await frames();
    expect(pointerEventsOf("first"), "the leaving side takes no taps").toBe(
      "none"
    );
    expect(pointerEventsOf("second")).toBe("auto");
    // A tap aimed at the leaving canvas reaches nothing inside its source.
    const aim = document
      .querySelector('[data-scene="first"]')!
      .getBoundingClientRect();
    const hits = document.elementsFromPoint(
      aim.left + aim.width / 2,
      aim.top + aim.height / 2
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.filter((hit) => sourceOf("first").contains(hit)),
      "a tap on the leaving side lands on nothing in it"
    ).toEqual([]);
    expect(
      sourceOf("first").hasAttribute("inert"),
      "no inert restyle during the movement"
    ).toBe(false);
    expect(sourceOf("second").hasAttribute("inert")).toBe(true);

    // The fade ends while the panels are still moving: still no swap.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(sourceOf("first").hasAttribute("inert")).toBe(false);

    stage.removeAttribute("data-panel-motion");
    stage.dispatchEvent(new Event("panelsettle", { bubbles: true }));
    await tick();
    expect(sourceOf("first").hasAttribute("inert")).toBe(true);
    expect(sourceOf("first").getAttribute("aria-hidden")).toBe("true");
    expect(sourceOf("second").hasAttribute("inert")).toBe(false);
  });

  it("swaps inert after the fade when no panel is moving", async () => {
    const screen = render(DualSourceCrossfade, {
      first,
      second,
      active: "first",
      settleInert: true,
    });
    await frames();
    await screen.rerender({ active: "second" });
    expect(sourceOf("first").hasAttribute("inert")).toBe(false);
    await expect
      .poll(() => sourceOf("first").hasAttribute("inert"), { timeout: 1500 })
      .toBe(true);
    expect(sourceOf("second").hasAttribute("inert")).toBe(false);
  });
});

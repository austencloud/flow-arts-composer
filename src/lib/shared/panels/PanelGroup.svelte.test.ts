/**
 * PanelGroup backdrop hold.
 *
 * While the track slides, the animated backdrop holds its last frame so the
 * slide gets the frame budget. A hold that never released would leave the
 * backdrop frozen with nothing on screen to show why, so this guards the
 * release as much as the hold.
 */
import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerBackgroundFreezeTarget } from "#lib/shared/background/shared/state/background-hold.svelte.js";
import PanelGroupMotionTestHarness from "./PanelGroupMotionTestHarness.svelte";

function settle(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inMotion(): boolean {
  return (
    document.querySelector(".panel-group")?.hasAttribute("data-panel-motion") ??
    false
  );
}

describe("PanelGroup backdrop hold", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("holds the animated backdrop while the track slides, then lets it run", async () => {
    const screen = render(PanelGroupMotionTestHarness, { folded: false });
    await settle(300);
    const backdrop = { freeze: vi.fn(), unfreeze: vi.fn() };
    registerBackgroundFreezeTarget(backdrop);

    await screen.rerender({ folded: true });
    await settle(50);
    expect(inMotion(), "the fold is sliding").toBe(true);
    expect(backdrop.freeze, "slide holds it").toHaveBeenCalledTimes(1);
    expect(backdrop.unfreeze).not.toHaveBeenCalled();

    await settle(800);
    expect(inMotion(), "the fold has settled").toBe(false);
    expect(backdrop.unfreeze, "released after settling").toHaveBeenCalledTimes(
      1
    );

    await screen.rerender({ folded: false });
    await settle(50);
    expect(backdrop.freeze, "unfolding holds it again").toHaveBeenCalledTimes(
      2
    );
    await settle(800);
    expect(backdrop.unfreeze, "released again").toHaveBeenCalledTimes(2);
  });
});

function widthOf(testId: string): number {
  return (
    document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect()
      .width ?? 0
  );
}

describe("PanelGroup content during a fold", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Create's Play fold: the tools slide away and the workspace takes the
  // space. The workspace content has to grow with the edge; laid out at its
  // final size at once, it showed full size under tools that then slid off.
  it("grows the neighbour with the edge while the folding panel holds still", async () => {
    const screen = render(PanelGroupMotionTestHarness, { folded: false });
    await settle(300);
    expect(widthOf("main")).toBeCloseTo(300, 0);
    expect(widthOf("tool")).toBeCloseTo(300, 0);

    await screen.rerender({ folded: true });
    await settle(120);
    expect(inMotion(), "the fold is sliding").toBe(true);
    const mainMid = widthOf("main");
    expect(mainMid, "the neighbour has started to grow").toBeGreaterThan(301);
    expect(mainMid, "the neighbour is not at its end size yet").toBeLessThan(
      599
    );
    expect(
      widthOf("tool"),
      "the folding panel keeps its cards still"
    ).toBeCloseTo(300, 0);

    await settle(800);
    expect(widthOf("main")).toBeCloseTo(600, 0);

    await screen.rerender({ folded: false });
    await settle(120);
    const mainBack = widthOf("main");
    expect(mainBack, "the neighbour shrinks with the edge").toBeLessThan(599);
    expect(mainBack).toBeGreaterThan(301);
    expect(
      widthOf("tool"),
      "the unfolding panel lays out at its end size"
    ).toBeCloseTo(300, 0);
  });
});

describe("PanelGroup panes trading the track", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function widthOf(id: string): number {
    const wrapper = document.querySelector<HTMLElement>(
      `.panel-wrapper[data-panel-id="${id}"]`
    );
    return Math.round(wrapper?.getBoundingClientRect().width ?? -1);
  }

  // A second change arriving while the first is still settling must not be
  // overwritten by the first one's size: the view state would say one pane
  // while the other filled the screen, and nothing would ever correct it.
  it("lands on the latest pane when a change interrupts the last one", async () => {
    // A host running a page flight lands its panes at once, as this does, so
    // the first change has reached its size and is only waiting to settle.
    const instant = document.createElement("style");
    instant.textContent = ".panel-wrapper { transition: none !important; }";
    document.head.append(instant);
    try {
      const screen = render(PanelGroupMotionTestHarness, { shown: "main" });
      await settle(300);
      expect(widthOf("main")).toBe(600);

      await screen.rerender({ shown: "tool" });
      await settle(30);
      expect(widthOf("tool")).toBe(600);
      await screen.rerender({ shown: "main" });
      await settle(800);

      expect(widthOf("main")).toBe(600);
      expect(widthOf("tool")).toBe(0);
    } finally {
      instant.remove();
    }
  });
});

describe("PanelGroup compositor edge", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function wrapper(id: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(
      `.panel-wrapper[data-panel-id="${id}"]`
    );
    if (!el) throw new Error(`no wrapper ${id}`);
    return el;
  }

  function motionAttr(): string | null {
    return (
      document
        .querySelector(".panel-group")
        ?.getAttribute("data-panel-motion") ?? null
    );
  }

  function rider(): HTMLElement {
    return document.querySelector<HTMLElement>('[data-testid="rider"]')!;
  }

  // Create's Play fold on the compositor: the page takes its end layout on
  // the tap frame and everything after that is transform or opacity. A slide
  // that resized the layout per frame would show here as a main panel that
  // has not yet reached its end width.
  it("takes the end layout at once and moves the edge and its riders by transform", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);
    expect(widthOf("main")).toBeCloseTo(300, 0);

    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(40);
    expect(motionAttr(), "the compositor travel is running").toBe("compositor");
    expect(
      wrapper("main").getBoundingClientRect().width,
      "the neighbour has its end width on the first frame"
    ).toBeCloseTo(600, 0);
    expect(
      wrapper("tool").getAnimations().length,
      "the folding panel travels by animation"
    ).toBeGreaterThan(0);
    expect(
      rider().getAnimations().length,
      "the rider travels on the same clock"
    ).toBeGreaterThan(0);
    // Riders animate the translate property only, so nothing lays out.
    const keyframes = rider().getAnimations()[0]!.effect as KeyframeEffect;
    for (const frame of keyframes.getKeyframes()) {
      const animated = Object.keys(frame).filter(
        (k) => !["offset", "easing", "composite", "computedOffset"].includes(k)
      );
      expect(animated).toEqual(["translate"]);
    }
    // Mid-travel the rider is still near the old edge, not at the new one.
    expect(rider().getBoundingClientRect().right).toBeLessThan(590);
  });

  it("settles once, with no travel left behind", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);
    const settles = vi.fn();
    document
      .querySelector(".panel-group")!
      .addEventListener("panelsettle", settles);

    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(800);
    expect(settles).toHaveBeenCalledTimes(1);
    expect(motionAttr(), "the motion attribute is cleared").toBeNull();
    expect(wrapper("tool").getAnimations()).toHaveLength(0);
    expect(rider().getAnimations()).toHaveLength(0);
    expect(rider().getBoundingClientRect().right).toBeCloseTo(600, 0);
    expect(wrapper("tool").getBoundingClientRect().width).toBeCloseTo(0, 0);

    await screen.rerender({ folded: false, compositorEdge: true });
    await settle(800);
    expect(settles).toHaveBeenCalledTimes(2);
    expect(widthOf("main")).toBeCloseTo(300, 0);
    expect(widthOf("tool")).toBeCloseTo(300, 0);
  });

  // Reversing mid-travel must start from where the edge is on screen, not
  // jump to either rest position first.
  it("starts an interrupting change from the edge's position on screen", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);

    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(120);
    const onScreen = rider().getBoundingClientRect().right;
    expect(onScreen, "the edge is mid-travel").toBeGreaterThan(310);
    expect(onScreen).toBeLessThan(590);

    await screen.rerender({ folded: false, compositorEdge: true });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    const restart = rider().getBoundingClientRect().right;
    // Allow the frames that passed between the two reads.
    expect(Math.abs(restart - onScreen)).toBeLessThan(60);

    await settle(800);
    expect(motionAttr()).toBeNull();
    expect(rider().getBoundingClientRect().right).toBeCloseTo(300, 0);
  });

  // An interruption never replaces the travel on screen: it adds the layout
  // shift on the mover's second channel, so the position stays continuous
  // however stale the main thread's clock is when the change lands.
  it("leaves a running travel alone and adds the layout shift beside it", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);
    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(100);
    const [panelFirst] = wrapper("tool").getAnimations();
    const [riderFirst] = rider().getAnimations();
    expect(panelFirst?.playState).toBe("running");
    expect(riderFirst?.playState).toBe("running");

    await screen.rerender({ folded: false, compositorEdge: true });
    const panelRun = wrapper("tool").getAnimations();
    const riderRun = rider().getAnimations();
    expect(panelRun, "the first travel keeps running").toContain(panelFirst);
    expect(riderRun).toContain(riderFirst);
    expect(panelFirst?.playState).toBe("running");
    expect(panelRun).toHaveLength(2);
    expect(riderRun).toHaveLength(2);

    const firstOffset = (animation: Animation | undefined, property: string) =>
      parseFloat(
        String(
          (animation?.effect as KeyframeEffect).getKeyframes()[0]?.[property]
        ).replace("translate(", "")
      );
    // Folded, the tool wrapper sits at 600 with no width and the rider's
    // centre at 580; open, they rest at 300 and 280. The correction is that
    // layout shift exactly, on the channel the first travel left free.
    const panelSecond = panelRun.find((a) => a !== panelFirst);
    const riderSecond = riderRun.find((a) => a !== riderFirst);
    expect(firstOffset(panelSecond, "translate")).toBeCloseTo(300, 0);
    expect(firstOffset(riderSecond, "transform")).toBeCloseTo(300, 0);

    await settle(800);
    expect(motionAttr()).toBeNull();
    expect(wrapper("tool").getAnimations()).toHaveLength(0);
    expect(rider().getAnimations()).toHaveLength(0);
    expect(rider().getBoundingClientRect().right).toBeCloseTo(300, 0);
  });

  // The page's clock stands still through a long task, so a correction that
  // took the frame's time could first appear part done. It holds its first
  // keyframe through the frame that first shows it, and its clock starts on
  // a later frame, from the real time.
  it("starts a joining correction's clock on a later frame, not in the tap's task", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);
    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(100);
    const [riderFirst] = rider().getAnimations();

    await screen.rerender({ folded: false, compositorEdge: true });
    const riderSecond = rider()
      .getAnimations()
      .find((a) => a !== riderFirst);
    const changedAt = performance.now();
    expect(
      Number(riderSecond?.startTime),
      "the correction's start is parked ahead while its first frame is drawn"
    ).toBeGreaterThan(changedAt + 500);

    await new Promise((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
    );
    const started = Number(riderSecond?.startTime);
    expect(started, "its clock started from a frame after the change").toBeGreaterThanOrEqual(changedAt);
    expect(started).toBeLessThanOrEqual(performance.now());

    await settle(800);
    expect(motionAttr()).toBeNull();
    expect(rider().getBoundingClientRect().right).toBeCloseTo(300, 0);
  });

  it("replaces the travel when a third change finds both channels busy", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      folded: false,
      compositorEdge: true,
    });
    await settle(300);
    await screen.rerender({ folded: true, compositorEdge: true });
    await settle(60);
    await screen.rerender({ folded: false, compositorEdge: true });
    await settle(60);
    expect(rider().getAnimations()).toHaveLength(2);
    const onScreen = rider().getBoundingClientRect().right;
    await screen.rerender({ folded: true, compositorEdge: true });
    expect(rider().getAnimations()).toHaveLength(1);
    expect(
      Math.abs(rider().getBoundingClientRect().right - onScreen)
    ).toBeLessThan(40);
    await settle(800);
    expect(motionAttr()).toBeNull();
    expect(rider().getBoundingClientRect().right).toBeCloseTo(600, 0);
  });

  it("keeps the layout slide when the group has not opted in", async () => {
    const screen = render(PanelGroupMotionTestHarness, { folded: false });
    await settle(300);
    await screen.rerender({ folded: true });
    await settle(120);
    expect(motionAttr()).toBe("");
    const mid = wrapper("main").getBoundingClientRect().width;
    expect(mid, "the neighbour grows with the slide").toBeLessThan(599);
    expect(rider().getAnimations()).toHaveLength(0);
  });

  it("keeps the layout slide when the moving panel is not last", async () => {
    const screen = render(PanelGroupMotionTestHarness, {
      foldMain: false,
      compositorEdge: true,
    });
    await settle(300);
    await screen.rerender({ foldMain: true, compositorEdge: true });
    await settle(120);
    expect(motionAttr()).toBe("");
    const mid = wrapper("tool").getBoundingClientRect().width;
    expect(mid, "the neighbour grows with the slide").toBeGreaterThan(301);
    expect(mid).toBeLessThan(599);
    await settle(800);
    expect(wrapper("tool").getBoundingClientRect().width).toBeCloseTo(600, 0);
  });
});

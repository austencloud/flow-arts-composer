import { describe, expect, it, vi } from "vitest";
import { reparentToInspector } from "$lib/shared/sequence-viewer/components/reparent-to-inspector";

describe("reparentToInspector", () => {
  const element = (tag: string) =>
    document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      tag
    ) as HTMLElement;
  it("aims a returning bar at the stationary panel, not its still-small canvas parent", () => {
    const origin = element("div"),
      target = element("div"),
      anchor = element("div"),
      surface = element("section");
    origin.append(surface);
    document.body.append(origin, target, anchor);
    const rect = (width: number, height: number) => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    });
    surface.getBoundingClientRect = () =>
      rect(surface.parentNode === origin ? 368 : 692, 61);
    surface.getAnimations = () => [];
    anchor.getBoundingClientRect = () => rect(1260, 900);
    surface.animate = vi.fn(
      () =>
        ({
          finished: new Promise(() => {}),
          cancel: vi.fn(),
        }) as unknown as Animation
    );
    const action = reparentToInspector(surface, { target, resize: "layout" });
    action.update({
      target: null,
      animate: true,
      resize: "layout",
      returnAnchor: anchor,
    });
    expect(surface.style.width).toBe("1260px");
    expect(surface.style.top).toBe("839px");
    expect(surface.parentNode).toBe(document.body);
    action.destroy();
    expect(surface.parentNode).toBe(origin);
    expect(surface.getAttribute("style")).toBeNull();
    origin.remove();
    target.remove();
    anchor.remove();
  });
  it("keeps controls aloft until artwork docks, including across a reversal", () => {
    vi.useFakeTimers();
    const origin = element("div"),
      target = element("div"),
      surface = element("section");
    origin.append(surface);
    document.body.append(origin, target);
    surface.getAnimations = () => [];
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 61,
      width: 500,
      height: 61,
      toJSON: () => ({}),
    });
    let artworkMoving = true;
    const options = {
      animate: true,
      resize: "layout" as const,
      flightLayer: "controls" as const,
      canDock: () => !artworkMoving,
    };
    const action = reparentToInspector(surface, { ...options, target: null });
    action.update({ ...options, target });
    vi.advanceTimersByTime(400);
    expect(surface.parentNode).toBe(document.body);
    expect(surface.style.zIndex).toBe("calc(var(--z-debug, 1000) + 1)");
    action.update({ ...options, target: null });
    artworkMoving = false;
    vi.advanceTimersByTime(400);
    expect(surface.parentNode).toBe(origin);
    expect(surface.getAttribute("style")).toBeNull();
    action.destroy();
    origin.remove();
    target.remove();
    vi.useRealTimers();
  });
  it("keeps a stationary control row above the host fade and cancels an obsolete landing", () => {
    vi.useFakeTimers();
    const origin = element("div"),
      target = element("div"),
      surface = element("section");
    origin.append(surface);
    document.body.append(origin, target);
    surface.getAnimations = () => [];
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 61,
      width: 500,
      height: 61,
      toJSON: () => ({}),
    });
    const action = reparentToInspector(surface, {
      target: null,
      animate: true,
      resize: "layout",
    });
    action.update({ target, animate: true, resize: "layout" });
    expect(surface.parentNode).toBe(document.body);
    vi.advanceTimersByTime(100);
    action.update({ target: null, animate: true, resize: "layout" });
    vi.advanceTimersByTime(180);
    expect(surface.parentNode).toBe(document.body);
    vi.advanceTimersByTime(100);
    expect(surface.parentNode).toBe(origin);
    action.destroy();
    origin.remove();
    target.remove();
    vi.useRealTimers();
  });
  it("resizes a live control row without scaling its buttons or replacing the scrubber", async () => {
    const origin = element("div"),
      target = element("div"),
      surface = element("section"),
      scrubber = element("div");
    surface.append(scrubber);
    origin.append(surface);
    document.body.append(origin, target);
    surface.getAnimations = () => [];
    surface.getBoundingClientRect = () => {
      const width = surface.parentNode === origin ? 900 : 500;
      const left = surface.parentNode === origin ? 20 : 100;
      return {
        x: left,
        y: 0,
        left,
        top: 0,
        right: left + width,
        bottom: 61,
        width,
        height: 61,
        toJSON: () => ({}),
      };
    };
    let finish!: () => void;
    surface.animate = vi.fn(
      () =>
        ({
          finished: new Promise<void>((resolve) => {
            finish = resolve;
          }),
          cancel: vi.fn(),
        }) as unknown as Animation
    );
    const action = reparentToInspector(surface, {
      target: null,
      animate: true,
      resize: "layout",
    });
    action.capture();
    action.update({ target, animate: true, resize: "layout" });
    expect(surface.animate).toHaveBeenCalledWith(
      [
        { transform: "translate(-80px, 0px)", width: "900px", height: "61px" },
        { transform: "none" },
      ],
      expect.any(Object)
    );
    expect(surface.firstElementChild).toBe(scrubber);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(surface.parentNode).toBe(target);
    expect(surface.firstElementChild).toBe(scrubber);
    action.destroy();
    origin.remove();
    target.remove();
  });
  it("uses pre-layout visual bounds when sibling chrome leaves the host", () => {
    const origin = element("div"),
      target = element("div"),
      surface = element("section"),
      visual = element("div");
    visual.className = "visual";
    surface.append(visual);
    origin.append(surface);
    document.body.append(origin, target);
    let visualHeight = 740;
    const rect = (height: number) => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: height,
      width: 400,
      height,
      toJSON: () => ({}),
    });
    surface.getBoundingClientRect = () => rect(800);
    visual.getBoundingClientRect = () =>
      rect(surface.parentNode === origin ? visualHeight : 300);
    visual.getAnimations = () => [];
    visual.animate = vi.fn(
      () =>
        ({
          finished: new Promise(() => {}),
          cancel: vi.fn(),
        }) as unknown as Animation
    );
    const action = reparentToInspector(surface, {
      target: null,
      animate: true,
      visualSelector: ".visual",
    });
    action.capture();
    visualHeight = 800;
    action.update({ target, animate: true, visualSelector: ".visual" });
    expect(visual.animate).toHaveBeenCalledWith(
      [
        {
          transformOrigin: "top left",
          transform: `translate(0px, 0px) scale(1, ${740 / 300})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      expect.any(Object)
    );
    action.destroy();
    origin.remove();
    target.remove();
  });
  it("keeps the newest destination when an in-flight handoff reverses", async () => {
    const origin = element("div");
    const target = element("div");
    const surface = element("section");
    surface.style.color = "red";
    origin.append(surface);
    document.body.append(origin, target);
    const pending: { finish: () => void; animation: Animation }[] = [];
    surface.getAnimations = () => pending.map((entry) => entry.animation);
    surface.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: surface.parentNode === origin ? 0 : 400,
      top: 0,
      right: 600,
      bottom: 300,
      width: 200,
      height: 300,
      toJSON: () => ({}),
    });
    surface.animate = vi.fn(() => {
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const animation = {
        finished,
        cancel: vi.fn(finish),
      } as unknown as Animation;
      pending.push({ finish, animation });
      return animation;
    });
    const moving = vi.fn();
    const action = reparentToInspector(surface, {
      target,
      animate: true,
      onMoving: moving,
    });
    expect(surface.parentNode).toBe(document.body);
    action.update({ target: null, animate: true, onMoving: moving });
    pending[0].finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(surface.parentNode).not.toBe(target);
    pending.at(-1)!.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(surface.parentNode).toBe(origin);
    expect(surface.getAttribute("style")).toBe("color: red;");
    expect(moving).toHaveBeenLastCalledWith(false);
    action.destroy();
    origin.remove();
    target.remove();
  });

  it("moves instantly under reduced motion, without leaving an overlay", () => {
    document.documentElement.dataset.motionPreference = "reduce";
    const origin = element("div");
    const target = element("div");
    const surface = element("section");
    origin.append(surface);
    document.body.append(origin, target);
    surface.animate = vi.fn();
    const action = reparentToInspector(surface, { target, animate: true });
    expect(surface.parentNode).toBe(target);
    expect(surface.animate).not.toHaveBeenCalled();
    action.destroy();
    expect(surface.parentNode).toBe(origin);
    origin.remove();
    target.remove();
    delete document.documentElement.dataset.motionPreference;
  });

  it("does not resurrect a surface already removed by its owning block", () => {
    const origin = element("div"),
      target = element("div"),
      surface = element("section");
    origin.append(surface);
    const action = reparentToInspector(surface, target);
    surface.remove();
    action.destroy();
    expect(origin.children.length).toBe(0);
    expect(surface.parentNode).toBeNull();
  });

  it("moves one mounted node into the inspector and restores its exact slot", () => {
    const html = (tagName: string): HTMLElement =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        tagName
      ) as HTMLElement;
    const origin = html("div");
    const before = html("span");
    const settings = html("section");
    const after = html("span");
    const inspector = html("aside");
    origin.appendChild(before);
    origin.appendChild(settings);
    origin.appendChild(after);

    const action = reparentToInspector(settings, inspector);
    expect(inspector.firstElementChild).toBe(settings);

    action.update(null);
    expect(Array.from(origin.children)).toEqual([before, settings, after]);

    action.update(inspector);
    action.destroy();
    expect(Array.from(origin.children)).toEqual([before, settings, after]);
  });
});

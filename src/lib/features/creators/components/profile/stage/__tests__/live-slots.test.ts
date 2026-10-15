import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSlots } from "../live-slots.svelte";

// jsdom has no IntersectionObserver; this stub lets a test declare which
// tiles are on screen and fire the callback by hand.
class StubObserver {
  static instances: StubObserver[] = [];
  observed = new Set<Element>();
  constructor(public callback: IntersectionObserverCallback) {
    StubObserver.instances.push(this);
  }
  observe(node: Element): void {
    this.observed.add(node);
  }
  unobserve(node: Element): void {
    this.observed.delete(node);
  }
  disconnect(): void {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function intersect(nodes: Element[]): void {
  const observer = StubObserver.instances[0];
  if (!observer) throw new Error("no observer");
  observer.callback(
    nodes.map(
      (target) =>
        ({
          target,
          isIntersecting: true,
        }) as unknown as IntersectionObserverEntry
    ),
    observer as unknown as IntersectionObserver
  );
}

// Tiles rank by distance from the viewport centre, so each stub tile gets its
// own box; `top` here is the box's distance down the page. Pointer listeners
// are captured rather than dispatched: this jsdom setup does not deliver
// synthetic pointer events, and the coordinator only cares that its handler
// ran.
type StubTile = HTMLElement & { fire(type: string): void };

function makeTile(top: number): StubTile {
  const node = document.createElement("div") as unknown as StubTile;
  const listeners = new Map<string, () => void>();
  node.addEventListener = ((type: string, fn: () => void) => {
    listeners.set(type, fn);
  }) as typeof node.addEventListener;
  node.removeEventListener = ((type: string) => {
    listeners.delete(type);
  }) as typeof node.removeEventListener;
  node.fire = (type) => listeners.get(type)?.();
  node.getBoundingClientRect = () =>
    ({
      top,
      height: 100,
      bottom: top + 100,
      left: 0,
      right: 100,
      width: 100,
    }) as DOMRect;
  return node;
}

let frames: FrameRequestCallback[] = [];
function flushFrames(): void {
  while (frames.length > 0) {
    const batch = frames;
    frames = [];
    for (const fn of batch) fn(performance.now());
  }
}

describe("LiveSlots", () => {
  beforeEach(() => {
    StubObserver.instances = [];
    frames = [];
    vi.stubGlobal("IntersectionObserver", StubObserver);
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(window, "innerHeight", {
      value: 1000,
      configurable: true,
    });
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function mount(slots: LiveSlots, hover?: boolean) {
    const states: boolean[] = [];
    const nodes = [makeTile(450), makeTile(100), makeTile(800)];
    const actions = nodes.map((node, index) => {
      states[index] = false;
      return slots.tile(node, {
        medium: "sequence",
        hover,
        onChange: (live) => (states[index] = live),
      });
    });
    return { nodes, states, actions };
  }

  it("grants only the budgeted count, nearest the viewport centre first", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    const { nodes, states } = mount(slots);
    intersect(nodes);
    flushFrames();
    // Centre is 500; the tile at 450..550 is dead centre.
    expect(states).toEqual([true, false, false]);
    expect(slots.liveCount.sequence).toBe(1);
    slots.destroy();
  });

  it("hands a token back when the holder leaves and the next tile takes it", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    const { nodes, states, actions } = mount(slots);
    intersect(nodes);
    flushFrames();
    actions[0]?.destroy();
    flushFrames();
    expect(states[1]).toBe(true);
    expect(states[2]).toBe(false);
    slots.destroy();
  });

  it("hover promotes a tile past the budget by default", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    const { nodes, states } = mount(slots);
    intersect(nodes);
    flushFrames();
    nodes[2]?.fire("pointerenter");
    flushFrames();
    expect(states).toEqual([true, false, true]);
    nodes[2]?.fire("pointerleave");
    flushFrames();
    expect(states).toEqual([true, false, false]);
    slots.destroy();
  });

  it("hover: false leaves the budget as the only authority", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    const { nodes, states } = mount(slots, false);
    intersect(nodes);
    flushFrames();
    nodes[2]?.fire("pointerenter");
    flushFrames();
    expect(states).toEqual([true, false, false]);
    slots.destroy();
  });

  it("update moves a tile to another medium and re-ranks it there", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    slots.budgets.clip = 2;
    const { nodes, states, actions } = mount(slots, false);
    intersect(nodes);
    flushFrames();
    expect(states).toEqual([true, false, false]);

    // The two tiles that lost out on the engine budget learn they have a
    // clip: the clip budget has room for both.
    for (const index of [1, 2]) {
      actions[index]?.update({
        medium: "clip",
        hover: false,
        onChange: (live) => (states[index] = live),
      });
    }
    flushFrames();
    expect(states).toEqual([true, true, true]);
    expect(slots.liveCount).toMatchObject({ sequence: 1, clip: 2 });

    // The incumbent switches medium: its engine token is dropped at once and
    // it competes again under the clip budget, where it ranks first and the
    // farthest tile is parked.
    actions[0]?.update({
      medium: "clip",
      hover: false,
      onChange: (live) => (states[0] = live),
    });
    expect(states[0]).toBe(false);
    flushFrames();
    expect(states).toEqual([true, true, false]);
    expect(slots.liveCount).toMatchObject({ sequence: 0, clip: 2 });
    slots.destroy();
  });

  it("update with the same medium keeps the token and swaps the callback", () => {
    const slots = new LiveSlots();
    slots.budgets.sequence = 1;
    const { nodes, states, actions } = mount(slots, false);
    intersect(nodes);
    flushFrames();
    let seen: boolean | null = null;
    actions[0]?.update({
      medium: "sequence",
      hover: false,
      onChange: (live) => (seen = live),
    });
    flushFrames();
    expect(states[0]).toBe(true);
    expect(seen).toBeNull();
    actions[0]?.destroy();
    slots.destroy();
  });
});

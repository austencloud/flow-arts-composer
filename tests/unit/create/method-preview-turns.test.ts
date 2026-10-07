/**
 * The Create front door's method cards take turns: board order, two rounds,
 * then rest. A pointer or keyboard focus plays a card now, and the rounds
 * resume after it with the card it cut. Spec:
 * docs/superpowers/specs/2026-10-06-create-method-previews-design.md (Turns).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { observeTurnSignal } from "./method-preview-turns-effect-harness.svelte";
import {
  createMethodPreviewTurns,
  type MethodPreviewTurnOptions,
  type MethodPreviewTurns,
} from "$lib/features/create/shared/state/method-preview-turns.svelte";

const TIMING = {
  turnMs: 100,
  gapMs: 10,
  hoverDelayMs: 20,
  readyWaitMs: 50,
  startDelayMs: 5,
  rounds: 2,
};

/** A page that is already quiet: the first turn's countdown starts at once. */
const settled = (go: () => void) => {
  go();
  return () => {};
};

let live: MethodPreviewTurns | null = null;

function setup(
  overrides: Partial<MethodPreviewTurnOptions> = {},
  ready = new Set(["a", "b", "c"])
) {
  live = createMethodPreviewTurns({
    order: () => ["a", "b", "c"],
    isReady: (id) => ready.has(id),
    reducedMotion: () => false,
    defer: settled,
    timing: TIMING,
    ...overrides,
  });
  return { turns: live, ready };
}

/**
 * Run the clock one millisecond at a time up to `untilMs`, calling `at[ms]`
 * first. Records [ms, id] whenever a card starts playing.
 */
function tick(
  turns: MethodPreviewTurns,
  untilMs: number,
  at: Record<number, () => void> = {}
): [number, string][] {
  const plays: [number, string][] = [];
  let last: string | null = null;
  for (let ms = 0; ms <= untilMs; ms++) {
    at[ms]?.();
    const id = turns.playingId;
    if (id !== null && id !== last) plays.push([ms, id]);
    last = id;
    vi.advanceTimersByTime(1);
  }
  return plays;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  live?.dispose();
  live = null;
  vi.useRealTimers();
});

describe("method preview turns", () => {
  it("plays the cards in board order for two rounds, then rests", () => {
    const { turns } = setup();
    turns.start();
    expect(tick(turns, 1000)).toEqual([
      [5, "a"],
      [115, "b"],
      [225, "c"],
      [335, "a"],
      [445, "b"],
      [555, "c"],
    ]);
    expect(turns.playingId).toBeNull();
  });

  it("numbers each turn so a scene can tell a new turn from the last", () => {
    const { turns } = setup();
    turns.start();
    expect(turns.turn).toBe(0);
    tick(turns, 120);
    expect(turns.turn).toBe(2);
  });

  it("waits for a scene that has not loaded, then skips it", () => {
    const { turns } = setup({}, new Set(["a", "c"]));
    turns.start();
    expect(tick(turns, 1000)).toEqual([
      [5, "a"],
      [165, "c"],
      [275, "a"],
      [435, "c"],
    ]);
  });

  it("plays a waiting card as soon as its scene is ready", () => {
    const { turns, ready } = setup({}, new Set(["a", "c"]));
    turns.start();
    const plays = tick(turns, 300, {
      130: () => {
        ready.add("b");
        turns.notifyReady("b");
      },
    });
    expect(plays).toEqual([
      [5, "a"],
      [130, "b"],
      [240, "c"],
    ]);
  });

  it("plays a held card now and replays the card it cut once released", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 300, {
      30: () => turns.hold("c"),
      200: () => turns.release("c"),
    });
    expect(plays).toEqual([
      [5, "a"],
      [50, "c"],
      [210, "a"],
    ]);
  });

  it("leaves the playing card alone when it is held, and waits after it", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 300, {
      30: () => turns.hold("a"),
      200: () => turns.release("a"),
    });
    expect(plays).toEqual([
      [5, "a"],
      [210, "b"],
    ]);
    expect(turns.turn).toBe(2);
  });

  it("holds the first turn for a card held before it", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 400, {
      2: () => turns.hold("b"),
      300: () => turns.release("b"),
    });
    expect(plays).toEqual([
      [22, "b"],
      [310, "a"],
    ]);
  });

  it("plays a held card once its scene loads", () => {
    const { turns, ready } = setup({}, new Set(["a"]));
    turns.start();
    const plays = tick(turns, 200, {
      30: () => turns.hold("b"),
      80: () => {
        ready.add("b");
        turns.notifyReady("b");
      },
    });
    expect(plays).toEqual([
      [5, "a"],
      [80, "b"],
    ]);
  });

  it("still plays a held card after the rounds, without restarting them", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 1200, {
      700: () => turns.hold("b"),
      900: () => turns.release("b"),
    });
    expect(plays.slice(6)).toEqual([[720, "b"]]);
  });

  it("pauses while hidden or off screen and resumes with the same card", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 200, {
      50: () => turns.setActive(false),
      100: () => turns.setActive(true),
    });
    expect(plays).toEqual([
      [5, "a"],
      [110, "a"],
    ]);
  });

  it("replays a held card cut by the page hiding when the page returns", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 150, {
      30: () => turns.hold("c"),
      80: () => turns.setActive(false),
      100: () => turns.setActive(true),
    });
    expect(plays).toEqual([
      [5, "a"],
      [50, "c"],
      [110, "c"],
    ]);
  });

  it("replays a held card whose hover delay the page hiding cut", () => {
    const { turns } = setup();
    turns.start();
    const plays = tick(turns, 150, {
      30: () => turns.hold("c"),
      40: () => turns.setActive(false),
      60: () => turns.setActive(true),
    });
    expect(plays).toEqual([
      [5, "a"],
      [70, "c"],
    ]);
  });

  it("ignores a repeated active signal", () => {
    const { turns } = setup();
    turns.start();
    // The held card finished its turn and rests; a repeated signal must not
    // replay it, since the page never hid.
    const plays = tick(turns, 300, {
      30: () => turns.hold("a"),
      150: () => turns.setActive(true),
    });
    expect(plays).toEqual([[5, "a"]]);
  });

  it("starts two new rounds from the first card on return", () => {
    const { turns } = setup();
    turns.start();
    tick(turns, 200, { 150: () => turns.stop() });
    expect(turns.playingId).toBeNull();
    turns.start();
    expect(tick(turns, 1000).map(([, id]) => id)).toEqual([
      "a",
      "b",
      "c",
      "a",
      "b",
      "c",
    ]);
  });

  it("plays nothing under reduced motion", () => {
    const { turns } = setup({ reducedMotion: () => true });
    turns.start();
    expect(tick(turns, 500, { 30: () => turns.hold("b") })).toEqual([]);
  });

  it("waits for the page to settle before the first turn", () => {
    const settles: Array<() => void> = [];
    const { turns } = setup({
      defer: (go) => {
        settles.push(go);
        return () => {};
      },
    });
    turns.start();
    expect(tick(turns, 100)).toEqual([]);
    expect(settles).toHaveLength(1);
    settles[0]!();
    expect(tick(turns, 10)).toEqual([[5, "a"]]);
  });

  it("does not start the rounds early when a hold ends before the page settles", () => {
    const { turns } = setup({ defer: () => () => {} });
    turns.start();
    const plays = tick(turns, 100, {
      10: () => turns.hold("a"),
      15: () => turns.release("a"),
    });
    expect(plays).toEqual([]);
  });

  it("ignores a release without a hold", () => {
    const { turns } = setup();
    turns.start();
    // The release lands while card c's hover delay is pending; it must not
    // cancel that delay.
    const plays = tick(turns, 100, {
      30: () => turns.hold("c"),
      35: () => turns.release("x"),
    });
    expect(plays).toEqual([
      [5, "a"],
      [50, "c"],
    ]);
  });

  it("an extra turn that ends before the page settles does not start the rounds", () => {
    const settles: Array<() => void> = [];
    const { turns } = setup({
      defer: (go) => {
        settles.push(go);
        return () => {};
      },
    });
    turns.start();
    const plays = tick(turns, 400, {
      0: () => turns.hold("b"),
      50: () => turns.release("b"),
    });
    expect(plays).toEqual([[20, "b"]]);
    settles[0]!();
    expect(tick(turns, 10)).toEqual([[5, "a"]]);
  });

  it("ignores a stale settle callback after start runs again", () => {
    const settles: Array<() => void> = [];
    const { turns } = setup({
      defer: (go) => {
        settles.push(go);
        // A defer that ignores its cancel can still fire the old callback.
        return () => {};
      },
    });
    turns.start();
    turns.start();
    expect(settles).toHaveLength(2);
    settles[0]!();
    expect(tick(turns, 50)).toEqual([]);
    settles[1]!();
    expect(tick(turns, 10)).toEqual([[5, "a"]]);
  });

  it("signals from inside an effect without subscribing it to the turns", () => {
    const { turns, ready } = setup({ order: () => ["a"] }, new Set<string>());
    turns.start();
    // The first turn waits for card a's scene; the pointer arrives meanwhile.
    vi.advanceTimersByTime(TIMING.startDelayMs);
    turns.hold("a");
    vi.advanceTimersByTime(TIMING.hoverDelayMs);
    expect(turns.playingId).toBeNull();

    ready.add("a");
    const effect = observeTurnSignal(turns, (t) => t.notifyReady("a"));
    flushSync();
    expect(turns.playingId).toBe("a");

    // The turn that just started, and the one ending, must not re-run it.
    flushSync();
    vi.advanceTimersByTime(TIMING.turnMs);
    flushSync();
    expect(effect.runs).toBe(1);
    expect(turns.playingId).toBeNull();
    effect.dispose();
  });

  it("does nothing after dispose", () => {
    const { turns } = setup();
    turns.dispose();
    turns.start();
    expect(tick(turns, 100)).toEqual([]);
  });
});

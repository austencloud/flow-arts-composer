/**
 * Boot bar contract: the app.html fill replays the last boot's own timing.
 *
 * Silent regressions: a fill that sits still, runs backwards, claims a
 * milestone before it arrives, or never lets the screen go all look like
 * "the app is slow" rather than a bug. These replay recorded boots against
 * the real inline script with a controlled clock.
 *
 * The fill is scaled by Web Animations, which the compositor runs even while
 * the main thread is blocked. JSDOM has no animations, so the harness models
 * the compositor: every `animate()` call is recorded (when, stops, offsets,
 * easings, duration) and every inline `scaleX` write is a placement, and the
 * fill's position at any moment is read from that schedule. The script's own
 * reads of the computed transform get the same modelled position.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

const template = readFileSync("src/app.html", "utf8");
const loadingScript = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1] ?? "")
  .find((script) => script.includes("var __tkaFinished = false"))!;

const SCREEN =
  '<div id="app-loading" aria-valuenow="5"><div id="boot-capsule">' +
  '<div class="boot-capsule-fill" id="loading-bar-fill"></div>' +
  '<span id="loading-text"></span></div></div>';

type Timeline = Array<[number, string]>;

interface Profile {
  v: number;
  at: number;
  t: Record<string, number>;
}

interface Probe {
  profile: Profile;
  defaultProfile: boolean;
  milestones: Array<{ name: string; t: number; ignored?: true }>;
  samples: Array<{ t: number; pct: number; target: number }>;
}

/** One inline transform write: the fill placed, with no animation. */
interface Placement {
  at: number;
  /** Where the fill was on screen just before the write. */
  from: number;
  to: number;
}

/** One `animate()` call, as the compositor would run it. */
interface Move {
  at: number;
  /** Where the fill was on screen just before the call's task began. */
  from: number;
  stops: number[];
  offsets: number[];
  eases: string[];
  ms: number;
  fill: string;
  cancelled: number;
}

interface Timer {
  run: () => void;
  at: number;
  every: number | null;
  live: boolean;
}

/** The 2026-10-14 audit of a warm dev boot, by milestone (ms from navigation
 * start). Ready arrives first from the boot-snapshot path; the async init's
 * services, workspace, settings and second ready follow it. `scripts` was not
 * in the audit; 1000 sits between script start and the shell. */
const DEV_WARM: Timeline = [
  [1000, "scripts"],
  [1086, "shell"],
  [1108, "hydrated"],
  [3680, "cloud"],
  [3695, "session"],
  [4370, "ready"],
  [4679, "services"],
  [4771, "workspace"],
  [4773, "settings"],
  [4791, "ready"],
];
const SCRIPT_START = 200;

/** The second warm dev boot round 1 measured in the browser, with the
 * 2.3 s main-thread block of MainApplication's init (6796 to 9082 ms) in
 * which no timer could run. Its profile is its own timings. */
const DEV_WARM_2_START = 284;
const DEV_WARM_2: Timeline = [
  [2725, "scripts"],
  [3028, "shell"],
  [3072, "hydrated"],
  [6196, "cloud"],
  [6260, "session"],
  [8378, "ready"],
];
const DEV_WARM_2_BLOCK: [number, number] = [6796, 9082];
const TAIL_EASE = "ease-out";

function devWarm2Profile(): Profile {
  return {
    v: 1,
    at: 0,
    t: Object.fromEntries([
      ["start", DEV_WARM_2_START],
      ...DEV_WARM_2.map(([t, name]) => [name, t]),
    ]),
  };
}

/** CSS cubic-bezier(x1, y1, x2, y2) at progress x, solved by bisection. */
function bezier(x1: number, y1: number, x2: number, y2: number, x: number) {
  const at = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

function eased(easing: string, x: number): number {
  if (easing === "linear") return x;
  if (easing === "ease") return bezier(0.25, 0.1, 0.25, 1, x);
  if (easing === "ease-out") return bezier(0, 0, 0.58, 1, x);
  const curve = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  if (!curve) throw new Error(`unexpected easing ${easing}`);
  const [a, b, c, d] = curve[1]!.split(",").map(Number);
  return bezier(a!, b!, c!, d!, x);
}

function scaleOf(value: string): number {
  const scale = /^scaleX\((-?[\d.]+)\)$/.exec(value);
  if (!scale) throw new Error(`unexpected fill transform ${value}`);
  return 100 * parseFloat(scale[1]!);
}

let pages: JSDOM[] = [];
afterEach(() => {
  for (const page of pages) page.window.close();
  pages = [];
});

function boot(
  options: {
    profile?: Profile;
    storage?: "throws";
    reduceMotion?: boolean;
    hidden?: "landing";
    seed?: Record<string, string>;
    startAt?: number;
    /** No timer runs inside this window; due timers wait for its end. */
    blocked?: [number, number];
    /** The main thread's animation clock runs this far behind the
     * compositor, as in a long task: computed styles see the fill where it
     * was `lag` ms ago, and an animation it has not seen start has no start
     * time yet. */
    lag?: number;
    /** When the page renders its first frame. Unset (with no frameEvery),
     * animation frame callbacks run at once. */
    firstFrame?: number;
    /** Frames come on this period; a blocked main thread delays them. */
    frameEvery?: number;
    /** Before this time the fill's computed transform reads "none", as
     * when its style is not resolved yet. */
    unresolvedUntil?: number;
    /** What the computed transform reads until then. */
    unresolvedAs?: string;
  } = {}
) {
  // pretendToBeVisual: JSDOM documents are otherwise hidden, and the ticker
  // stops while the page is hidden.
  const page = new JSDOM(SCREEN, {
    url: "https://localhost/create",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  pages.push(page);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = page.window as any;
  let clock = options.startAt ?? SCRIPT_START;
  Object.defineProperty(win.performance, "now", {
    configurable: true,
    value: () => clock,
  });
  const marks: string[] = [];
  Object.defineProperty(win.performance, "mark", {
    configurable: true,
    value: (name: string) => marks.push(name),
  });
  const timers: Timer[] = [];
  win.setTimeout = (run: () => void, ms = 0) =>
    timers.push({ run, at: clock + ms, every: null, live: true });
  win.setInterval = (run: () => void, ms: number) =>
    timers.push({ run, at: clock + ms, every: ms, live: true });
  win.clearTimeout = win.clearInterval = (id?: number) => {
    if (id && timers[id - 1]) timers[id - 1]!.live = false;
  };
  win.requestAnimationFrame = (run: (t: number) => void) => {
    const every = options.frameEvery;
    if (options.firstFrame === undefined && every === undefined) {
      run(clock);
      return 0;
    }
    const next = every ? Math.floor(clock / every) * every + every : clock;
    timers.push({
      run: () => run(clock),
      at: Math.max(next, options.firstFrame ?? -Infinity),
      every: null,
      live: true,
    });
    return 0;
  };
  Object.defineProperty(win.navigator, "languages", { value: ["en"] });
  if (options.reduceMotion) {
    win.matchMedia = (query: string) => ({
      matches: query.includes("reduce"),
    });
  }
  if (options.storage === "throws") {
    Object.defineProperty(win, "localStorage", {
      configurable: true,
      get() {
        throw new Error("storage blocked");
      },
    });
  } else {
    for (const [key, value] of Object.entries(options.seed ?? {})) {
      win.localStorage.setItem(key, value);
    }
    if (options.profile) {
      win.localStorage.setItem(
        "tka-boot-profile",
        JSON.stringify(options.profile)
      );
    }
  }
  const document = page.window.document;
  const screen = document.getElementById("app-loading")!;
  const fill = document.getElementById("loading-bar-fill")!;
  const text = document.getElementById("loading-text")!;
  if (options.hidden === "landing") screen.style.display = "none";

  // The compositor model. The CSS starts the fill at 5%. A live animation
  // (fill: forwards) wins over the inline value, as in the browser.
  const placements: Placement[] = [{ at: -Infinity, from: 5, to: 5 }];
  const moves: Move[] = [];
  function moveAt(move: Move, t: number): number {
    const x = Math.min(1, Math.max(0, (t - move.at) / move.ms));
    for (let i = 1; i < move.stops.length; i++) {
      if (x <= move.offsets[i]! || i === move.stops.length - 1) {
        const span = move.offsets[i]! - move.offsets[i - 1]!;
        const f = span > 0 ? (x - move.offsets[i - 1]!) / span : 1;
        const from = move.stops[i - 1]!;
        return (
          from +
          (move.stops[i]! - from) *
            eased(move.eases[i - 1]!, Math.min(1, Math.max(0, f)))
        );
      }
    }
    return move.stops.at(-1)!;
  }
  function shown(t: number): number {
    let live: Move | undefined;
    for (const move of moves) {
      if (move.at <= t && !(move.cancelled <= t)) live = move;
    }
    if (live) return moveAt(live, t);
    let placed = placements[0]!;
    for (const candidate of placements)
      if (candidate.at <= t) placed = candidate;
    return placed.to;
  }
  // Where the fill was when the current task began: a write and a cancel in
  // the same task are seen together.
  let taskFrom: { at: number; value: number } | null = null;
  const before = () => {
    if (!taskFrom || taskFrom.at !== clock) {
      taskFrom = { at: clock, value: shown(clock - 1e-6) };
    }
    return taskFrom.value;
  };
  const styleProto = Object.getPrototypeOf(fill.style);
  const transformSetter = Object.getOwnPropertyDescriptor(
    styleProto,
    "transform"
  )!.set!;
  const transitions: string[] = [];
  Object.defineProperty(fill.style, "transition", {
    configurable: true,
    get: () => fill.style.getPropertyValue("transition"),
    set(value: string) {
      transitions.push(value);
    },
  });
  Object.defineProperty(fill.style, "transform", {
    configurable: true,
    get: () => fill.style.getPropertyValue("transform"),
    set(value: string) {
      placements.push({ at: clock, from: before(), to: scaleOf(value) });
      transformSetter.call(fill.style, value);
    },
  });
  const seen = () => clock - (options.lag ?? 0);
  win.Element.prototype.animate = function (
    this: Element,
    frames: Array<{ transform: string; offset: number; easing: string }>,
    timing: { duration: number; fill: string }
  ) {
    if (this !== fill) throw new Error("only the fill animates");
    const move: Move = {
      at: clock,
      from: before(),
      stops: frames.map((frame) => scaleOf(frame.transform)),
      offsets: frames.map((frame) => frame.offset),
      eases: frames.map((frame) => frame.easing),
      ms: timing.duration,
      fill: timing.fill,
      cancelled: Infinity,
    };
    moves.push(move);
    return {
      get startTime() {
        return seen() >= move.at ? move.at : null;
      },
      cancel() {
        move.cancelled = Math.min(move.cancelled, clock);
      },
    };
  };
  const computed = win.getComputedStyle.bind(win);
  win.getComputedStyle = (element: Element) =>
    element === fill
      ? {
          transform:
            clock < (options.unresolvedUntil ?? -Infinity)
              ? (options.unresolvedAs ?? "none")
              : `matrix(${shown(seen()) / 100}, 0, 0, 1, 0, 0)`,
        }
      : computed(element);

  win.eval(loadingScript);

  const width = () => shown(clock);
  /** The fill's on-screen position every 5 ms between two times. */
  function trace(from: number, to: number) {
    const points: Array<{ t: number; w: number }> = [];
    for (let t = from; t <= to; t += 5) points.push({ t, w: shown(t) });
    return points;
  }

  const [blockFrom, blockTo] = options.blocked ?? [Infinity, Infinity];
  function advance(to: number) {
    for (;;) {
      const due = timers
        .filter((timer) => timer.live && timer.at <= to)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      // A blocked main thread: the timer runs when the block ends.
      if (due.at > blockFrom && due.at < blockTo) {
        due.at = blockTo;
        continue;
      }
      clock = Math.max(clock, due.at);
      if (due.every) due.at += due.every;
      else due.live = false;
      due.run();
    }
    clock = Math.max(clock, to);
  }

  function replay(timeline: Timeline) {
    for (const [at, name] of timeline) {
      advance(at);
      win.__tkaBootMilestone(name);
    }
  }

  return {
    win,
    screen,
    fill,
    text,
    marks,
    moves,
    placements,
    transitions,
    shown,
    trace,
    width,
    now: () => clock,
    advance,
    replay,
    probe: () => win.__tkaBootBar as Probe,
    stored: (): Profile | null => {
      const saved = win.localStorage.getItem("tka-boot-profile");
      return saved ? JSON.parse(saved) : null;
    },
  };
}

/** Longest stretch, before ready, in which the fill sat still on screen. */
function longestStall(
  points: Array<{ t: number; w: number }>,
  readyAt: number
): number {
  let longest = 0;
  let since = points[0]!.t;
  for (let i = 1; i < points.length && points[i]!.t <= readyAt; i++) {
    if (points[i]!.w !== points[i - 1]!.w) since = points[i]!.t;
    longest = Math.max(longest, points[i]!.t - since);
  }
  return longest;
}

function expectMonotonic(points: Array<{ t: number; w: number }>) {
  for (let i = 1; i < points.length; i++) {
    expect(points[i]!.w, `at ${points[i]!.t}`).toBeGreaterThanOrEqual(
      points[i - 1]!.w - 1e-9
    );
  }
}

/** No write or animation starts behind where the fill was on screen, and
 * every animation only moves forward through its stops. */
function expectNoStepBack(run: ReturnType<typeof boot>) {
  for (const placed of run.placements.slice(1)) {
    expect(placed.to, `write at ${placed.at}`).toBeGreaterThanOrEqual(
      placed.from - 0.005
    );
  }
  for (const move of run.moves) {
    expect(move.stops[0]!, `move at ${move.at}`).toBeGreaterThanOrEqual(
      move.from - 0.005
    );
    for (let i = 1; i < move.stops.length; i++) {
      expect(move.stops[i]!).toBeGreaterThanOrEqual(move.stops[i - 1]!);
    }
  }
}

/** Each profiled milestone's share is out of reach until it arrives. */
function expectNoEarlyClaims(
  run: ReturnType<typeof boot>,
  timeline: Timeline,
  profile: Profile,
  startAt: number
) {
  const ready = profile.t.ready!;
  for (const [at, name] of timeline) {
    if (name === "ready" || profile.t[name] === undefined) continue;
    const cap = 4 + 96 * (profile.t[name]! / ready);
    for (const point of run.trace(startAt, at - 1)) {
      expect(point.w, `${name} at ${point.t}`).toBeLessThan(cap);
    }
  }
}

/** The segment animations, without the 200 ms ready glide. */
function segments(run: ReturnType<typeof boot>) {
  return run.moves.filter((move) => move.eases[0] !== "ease");
}

/** The profile the first dev warm boot leaves behind. */
function devWarmProfile(): Profile {
  const first = boot();
  first.replay(DEV_WARM);
  return first.stored()!;
}

describe("boot bar self-timing", () => {
  it("replays a matching dev warm profile without stalls, regressions or early claims", () => {
    const profile = devWarmProfile();
    const run = boot({ profile });
    run.replay(DEV_WARM);
    expect(run.probe().defaultProfile).toBe(false);

    const readyAt = 4370;
    const points = run.trace(SCRIPT_START, readyAt);
    expectMonotonic(points);
    expectNoStepBack(run);
    expectNoEarlyClaims(run, DEV_WARM, profile, SCRIPT_START);
    expect(longestStall(points, readyAt)).toBeLessThanOrEqual(600);
    // The fill moves by transform only, ends full, and the screen goes.
    expect(run.fill.style.width).toBe("");
    expect(run.transitions).toEqual([]);
    expect(run.moves.every((move) => move.fill === "forwards")).toBe(true);
    expect(run.shown(run.now() + 200)).toBe(100);
    expect(run.screen.classList.contains("loaded")).toBe(true);
  });

  it("keeps moving through a blocked main thread (dev warm 2, round 1's failure)", () => {
    const profile = devWarm2Profile();
    const run = boot({
      profile,
      startAt: DEV_WARM_2_START,
      blocked: DEV_WARM_2_BLOCK,
    });
    run.replay(DEV_WARM_2);
    const [blockFrom, blockTo] = DEV_WARM_2_BLOCK;
    // The block held: no tick ran, so the probe has no sample inside it.
    expect(
      run.probe().samples.filter((s) => s.t > blockFrom && s.t < blockTo)
    ).toEqual([]);

    const readyAt = 8378;
    const points = run.trace(DEV_WARM_2_START, readyAt);
    expectMonotonic(points);
    expectNoStepBack(run);
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(longestStall(points, readyAt)).toBeLessThanOrEqual(600);
    // The compositor's animation moved the fill inside the block.
    expect(run.shown(8000)).toBeGreaterThan(run.shown(blockFrom + 20) + 5);
  });

  it("keeps moving through a block that runs a segment to 3x its length (the tail)", () => {
    // Hydrated to cloud is recorded at 3124 ms; this cloud comes 3x that
    // after hydrated, and nothing on the main thread runs from 0.8 of the
    // recorded length until it arrives: no tick, no frame, no milestone.
    const profile = devWarm2Profile();
    const hydratedAt = 3072;
    const d = 6196 - 3072;
    const cloudAt = hydratedAt + 3 * d;
    const block: [number, number] = [hydratedAt + 0.8 * d, cloudAt];
    const run = boot({
      profile,
      startAt: DEV_WARM_2_START,
      blocked: block,
      frameEvery: 16,
    });
    run.replay([...DEV_WARM_2.slice(0, 3), [cloudAt, "cloud"]]);
    expect(
      run.probe().samples.filter((s) => s.t > block[0] && s.t < block[1])
    ).toEqual([]);

    const cloudShare = 4 + 96 * (profile.t.cloud! / profile.t.ready!);
    const points = run.trace(hydratedAt, cloudAt - 1);
    expectMonotonic(points);
    expectNoStepBack(run);
    for (const point of points) {
      expect(point.w, `at ${point.t}`).toBeLessThan(cloudShare);
    }
    // No 600 ms still stretch from hydrated through the whole block.
    expect(longestStall(points, cloudAt)).toBeLessThanOrEqual(600);
    // The tail is the segment's own animation, eased, written before the
    // block began, and it moved the fill by more than a sliver.
    const tailMove = segments(run).find((move) => move.at >= hydratedAt)!;
    expect(tailMove.at).toBeLessThan(block[0]);
    expect(tailMove.eases).toEqual(["linear", TAIL_EASE, "linear"]);
    expect(tailMove.ms * (1 - tailMove.offsets[1]!)).toBeCloseTo(
      Math.max(3 * d, 1500),
      0
    );
    expect(run.shown(block[1] - 1)).toBeGreaterThan(run.shown(block[0]) + 1);
  });

  it("never pulls the fill back when the main thread's clock lags the compositor", () => {
    const profile = devWarm2Profile();
    const run = boot({
      profile,
      startAt: DEV_WARM_2_START,
      blocked: DEV_WARM_2_BLOCK,
      lag: 300,
    });
    run.replay(DEV_WARM_2);
    expectNoStepBack(run);
    const points = run.trace(DEV_WARM_2_START, 8378);
    expectMonotonic(points);
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(longestStall(points, 8378)).toBeLessThanOrEqual(600);
  });

  it("waits for the first frame to start a segment, then runs for the time left", () => {
    const profile = devWarm2Profile();
    const firstFrame = DEV_WARM_2_START + 120;
    const run = boot({ profile, startAt: DEV_WARM_2_START, firstFrame });
    // Nothing is written before the first frame: a move started then could
    // jump straight to its end.
    run.advance(firstFrame - 1);
    expect(run.placements).toHaveLength(1);
    expect(run.moves).toHaveLength(0);
    run.advance(firstFrame);
    const glide = run.moves.at(-1)!;
    expect(glide.at).toBe(firstFrame);
    expect(glide.stops[0]).toBeCloseTo(5, 2);
    // The segment's linear part still ends when it would have, and its tail
    // runs max(3 segments, 1.5 s) after that.
    const span = DEV_WARM_2[0]![0] - DEV_WARM_2_START;
    expect(glide.eases.slice(0, 2)).toEqual(["linear", TAIL_EASE]);
    expect(glide.ms * glide.offsets[1]!).toBeCloseTo(0.85 * span - 120, 6);
    expect(glide.ms).toBeCloseTo(0.85 * span - 120 + 3 * span, 6);
    run.replay(DEV_WARM_2);
    const points = run.trace(DEV_WARM_2_START, 8378);
    expectMonotonic(points);
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(
      longestStall(
        points.filter((p) => p.t >= firstFrame),
        8378
      )
    ).toBeLessThanOrEqual(600);
  });

  it("starts each segment on a frame, and a blocked page delays it without a step back", () => {
    const profile = devWarm2Profile();
    // A milestone lands just before a block: its segment waits for the
    // block to end, and the fill keeps its old move until then.
    const run = boot({
      profile,
      startAt: DEV_WARM_2_START,
      frameEvery: 16,
      blocked: [6261, 6700],
      lag: 300,
    });
    run.replay(DEV_WARM_2);
    expect(segments(run).length).toBeGreaterThan(3);
    for (const move of segments(run)) {
      // On a frame; the first frame after the block comes when it ends.
      expect(
        move.at % 16 === 0 || move.at === 6700,
        `segment at ${move.at}`
      ).toBe(true);
    }
    const session = segments(run).find((m) => m.at >= 6260)!;
    expect(session.at).toBeGreaterThanOrEqual(6700);
    expectNoStepBack(run);
    const points = run.trace(DEV_WARM_2_START + 16, 8378);
    expectMonotonic(points);
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(longestStall(points, 8378)).toBeLessThanOrEqual(600);
  });

  it("restarts an early milestone's segment from where the fill is, only steeper", () => {
    const profile: Profile = {
      v: 1,
      at: 0,
      t: {
        start: 200,
        scripts: 1200,
        shell: 2200,
        hydrated: 3200,
        ready: 4200,
      },
    };
    const share = (name: string) => 4 + 96 * (profile.t[name]! / 4200);
    const run = boot({ profile });
    run.advance(700);
    const before = run.width();
    const placed = run.placements.length;
    const moved = run.moves.length;
    run.replay([[700, "scripts"]]); // expected at 1200
    // Pinned where it was (rounded up to the 0.01% the style is written
    // in), the old
    // animation cancelled in the same task, then one animation from there.
    const pins = run.placements.slice(placed);
    expect(pins).toHaveLength(1);
    expect(pins[0]!.to - before).toBeGreaterThanOrEqual(0);
    expect(pins[0]!.to - before).toBeLessThanOrEqual(0.01);
    expect(run.moves[moved - 1]!.cancelled).toBe(700);
    const segment = run.moves.slice(moved);
    expect(segment).toHaveLength(1);
    const move = segment[0]!;
    expect(move.stops[0]).toBe(pins[0]!.to);
    expect(move.ms * move.offsets[1]!).toBeCloseTo(850, 6);
    expect(move.ms).toBeCloseTo(850 + 3000, 6);
    const gap = share("shell") - share("scripts");
    expect(move.stops[1]).toBeCloseTo(share("scripts") + 0.85 * gap, 2);
    expect(move.stops[2]).toBeCloseTo(share("scripts") + 0.98 * gap, 2);
    const nominal = gap / 1000;
    expect((move.stops[1]! - move.stops[0]!) / 850).toBeGreaterThan(nominal);
    expectMonotonic(run.trace(SCRIPT_START, 2000));
  });

  it("handles out-of-order arrivals: no regression, one dismissal, late ranks logged", () => {
    const run = boot({ profile: devWarmProfile() });
    run.replay([
      [1000, "scripts"],
      [1100, "hydrated"],
      [1150, "shell"],
      [3680, "cloud"],
    ]);
    const atCloud = run.width();
    run.replay([
      [3695, "session"],
      [4370, "ready"],
      [4679, "services"],
      [4771, "workspace"],
      [4773, "settings"],
      [4791, "ready"],
    ]);
    expectMonotonic(run.trace(SCRIPT_START, 5000));
    expect(run.width()).toBeGreaterThanOrEqual(atCloud);
    expect(run.marks.filter((m) => m === "boot:splash:shell-handoff")).toEqual([
      "boot:splash:shell-handoff",
    ]);
    const log = run.probe().milestones;
    expect(log.filter((m) => m.ignored).map((m) => m.name)).toEqual([
      "shell",
      "services",
      "workspace",
      "settings",
    ]);
    // A duplicate ready is not logged twice; every first arrival is marked.
    expect(log.filter((m) => m.name === "ready")).toHaveLength(1);
    expect(run.marks).toContain("boot:splash:settings");
  });

  it("uses the built-in profile on a first visit and stores only pre-ready milestones", () => {
    const run = boot({ seed: { "tka-load-bytes": "760000" } });
    expect(run.probe().defaultProfile).toBe(true);
    expect(run.probe().profile.t.ready).toBeGreaterThan(0);
    // The retired byte calibration is cleared on first run.
    expect(run.win.localStorage.getItem("tka-load-bytes")).toBeNull();
    run.replay(DEV_WARM);
    const stored = run.stored()!;
    expect(stored.v).toBe(1);
    expect(typeof stored.at).toBe("number");
    expect(Object.keys(stored.t)).toEqual([
      "start",
      "scripts",
      "shell",
      "hydrated",
      "cloud",
      "session",
      "ready",
    ]);
    expect(stored.t).toMatchObject({ start: 200, shell: 1086, ready: 4370 });
  });

  it("stores nothing when the boot never went through the shell", () => {
    const run = boot();
    run.replay([
      [900, "scripts"],
      [1500, "ready"],
    ]);
    expect(run.screen.classList.contains("loaded")).toBe(true);
    expect(run.stored()).toBeNull();
  });

  it("creeps under the next share when the boot runs late, and says so in time", () => {
    const fast = devWarmProfile();
    for (const name of Object.keys(fast.t)) fast.t[name] = fast.t[name]! / 2;
    const run = boot({ profile: fast });
    run.replay(DEV_WARM.slice(0, 3)); // through hydrated at 1108
    const cloudCap = 4 + 96 * (fast.t.cloud! / fast.t.ready!);
    const writes = run.placements.length + run.moves.length;

    run.advance(2300);
    const early = run.width();
    run.advance(3600);
    const late = run.width();
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(cloudCap);
    // The tail is the segment's animation: the ticker wrote nothing.
    expect(run.placements.length + run.moves.length).toBe(writes);
    expect(longestStall(run.trace(1108, 3600), 3600)).toBeLessThanOrEqual(600);
    expect(run.probe().samples.at(-1)!.target).toBeLessThan(cloudCap);

    // Expected ready is about 2.2 s, so "Almost there" waits for the 4 s floor.
    run.advance(3990);
    expect(run.text.textContent).toBe("Opening Flow Arts Composer");
    run.advance(4000 + 200);
    expect(run.text.textContent).toBe("Almost there");
  });

  it("holds 'Almost there' until a second past a slow profile's ready", () => {
    const slow = devWarmProfile();
    for (const name of Object.keys(slow.t)) slow.t[name] = slow.t[name]! * 1.5;
    const flip = Math.max(4000, slow.t.ready! + 1000);
    const run = boot({ profile: slow });
    run.advance(flip - 10);
    expect(run.text.textContent).toBe("Opening Flow Arts Composer");
    run.advance(flip + 200);
    expect(run.text.textContent).toBe("Almost there");
  });

  it("keeps the 100 shim as ready and turns lower percents into marks only", () => {
    const run = boot();
    run.advance(600);
    const writes = run.placements.length + run.moves.length;
    run.win.__tkaLoadProgress(72, "Starting up...");
    expect(run.placements.length + run.moves.length).toBe(writes);
    expect(run.screen.classList.contains("loaded")).toBe(false);
    expect(run.marks).toContain("boot:splash:legacy:72");

    run.win.__tkaLoadProgress(100, "Ready");
    const glide = run.moves.at(-1)!;
    expect(glide).toMatchObject({ ms: 200, eases: ["ease", "linear"] });
    expect(glide.stops.at(-1)).toBe(100);
    expect(run.shown(run.now() + 200)).toBe(100);
    expect(run.screen.getAttribute("aria-valuenow")).toBe("100");
    expect(run.screen.classList.contains("loaded")).toBe(true);
    expect(run.probe().milestones.at(-1)?.name).toBe("ready");
  });

  it("still moves the fill under reduced motion, without animations, and leaves at once", () => {
    const run = boot({ reduceMotion: true });
    // It starts from the CSS 5%.
    expect(run.probe().samples[0]!.pct).toBe(5);
    run.advance(1500);
    expect(run.width()).toBeGreaterThan(5);
    run.replay([[1600, "ready"]]);
    expect(run.moves).toEqual([]);
    expect(run.transitions).toEqual([]);
    expect(run.placements.length).toBeGreaterThan(5);
    expect(run.width()).toBe(100);
    expect(run.screen.isConnected).toBe(false);
  });

  it("never reads an unresolved or foreign transform as a full fill", () => {
    // "none", or the identity a cold boot under reduced motion read while
    // other animations sat on the fill: as a scale, the identity is 100%.
    for (const [reduceMotion, unresolvedAs] of [
      [false, "none"],
      [true, "none"],
      [false, "matrix(1, 0, 0, 1, 0, 0)"],
      [true, "matrix(1, 0, 0, 1, 0, 0)"],
    ] as const) {
      const run = boot({
        profile: devWarmProfile(),
        reduceMotion,
        unresolvedUntil: SCRIPT_START + 200,
        unresolvedAs,
      });
      expect(run.probe().samples[0]!.pct).toBe(5);
      run.advance(SCRIPT_START + 150);
      expect(Number(run.screen.getAttribute("aria-valuenow"))).toBeLessThan(50);
      expect(run.probe().samples.every((s) => s.pct < 50)).toBe(true);
      run.replay(DEV_WARM.slice(0, 3));
      expect(run.width()).toBeGreaterThan(5);
    }
  });

  it("finishes the boot when storage throws", () => {
    const run = boot({ storage: "throws" });
    expect(run.probe().defaultProfile).toBe(true);
    run.replay(DEV_WARM.slice(0, 4));
    expect(run.width()).toBeGreaterThan(5);
    run.replay([[4370, "ready"]]);
    expect(run.shown(run.now() + 200)).toBe(100);
    expect(run.screen.classList.contains("loaded")).toBe(true);
  });

  it("probes what is on screen as a scale and reports it as the progressbar value", () => {
    const run = boot({ profile: devWarmProfile() });
    run.replay(DEV_WARM.slice(0, 3));
    run.advance(2000);
    const sample = run.probe().samples.at(-1)!;
    // Mid-segment the target is ahead of the fill, and the sample is the fill.
    expect(sample.target).toBeGreaterThan(sample.pct);
    expect(sample.pct).toBeCloseTo(run.shown(sample.t), 1);
    expect(sample.pct).toBeGreaterThan(20);
    expect(Number(run.screen.getAttribute("aria-valuenow"))).toBe(
      Math.round((100 * (sample.pct - 4)) / 96)
    );
    // Every write is a left-anchored scale, never a shift.
    expect(run.fill.style.transform).toMatch(/^scaleX\(0\.\d{4}\)$/);
  });

  it("leaves a hidden (landing) screen alone: no ticker, no profile", () => {
    const run = boot({ hidden: "landing" });
    run.replay(DEV_WARM);
    expect(run.probe().samples).toEqual([]);
    expect(run.stored()).toBeNull();
    expect(run.screen.style.display).toBe("none");
  });
});

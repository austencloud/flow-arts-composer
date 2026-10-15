/**
 * Boot bar contract: the app.html fill replays the last boot's own timing.
 *
 * Silent regressions: a fill that sits still, runs backwards, claims a
 * milestone before it arrives, or never lets the screen go all look like
 * "the app is slow" rather than a bug. These replay recorded boots against
 * the real inline script with a controlled clock.
 *
 * The fill moves by CSS transform transitions, which the compositor runs
 * even while the main thread is blocked. JSDOM runs no transitions, so the
 * harness models the compositor: every inline transform write becomes a
 * move (when, from where, to where, how long), and the fill's position at
 * any moment is read from that schedule. The script's own reads of the
 * computed transform get the same modelled position.
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

/** One inline transform write, as the compositor would run it. */
interface Move {
  at: number;
  from: number;
  to: number;
  ms: number;
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
const FILL_PX = 300;

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
     * compositor, as in a long task: computed styles and getAnimations()
     * see the fill where it was `lag` ms ago. */
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

  // The compositor model. The CSS starts the fill at 5%.
  const moves: Move[] = [{ at: -Infinity, from: 5, to: 5, ms: 0 }];
  const transitions: string[] = [];
  let transitionMs = 0;
  function shown(t: number): number {
    let move = moves[0]!;
    for (const candidate of moves) if (candidate.at <= t) move = candidate;
    if (move.ms <= 0 || t >= move.at + move.ms) return move.to;
    return move.from + ((move.to - move.from) * (t - move.at)) / move.ms;
  }
  const styleProto = Object.getPrototypeOf(fill.style);
  const transformSetter = Object.getOwnPropertyDescriptor(
    styleProto,
    "transform"
  )!.set!;
  const transitionSetter = Object.getOwnPropertyDescriptor(
    styleProto,
    "transition"
  )!.set!;
  Object.defineProperty(fill.style, "transition", {
    configurable: true,
    get: () => fill.style.getPropertyValue("transition"),
    set(value: string) {
      transitions.push(value);
      const ms = /transform (\d+(?:\.\d+)?)ms/.exec(value);
      transitionMs = ms ? parseFloat(ms[1]!) : 0;
      transitionSetter.call(fill.style, value);
    },
  });
  Object.defineProperty(fill.style, "transform", {
    configurable: true,
    get: () => fill.style.getPropertyValue("transform"),
    set(value: string) {
      const shift = /^translateX\((-?[\d.]+)%\)$/.exec(value);
      if (!shift) throw new Error(`unexpected fill transform ${value}`);
      moves.push({
        at: clock,
        from: shown(clock),
        to: 100 + parseFloat(shift[1]!),
        ms: transitionMs,
      });
      transformSetter.call(fill.style, value);
    },
  });
  Object.defineProperty(fill, "offsetWidth", { get: () => FILL_PX });
  const computed = win.getComputedStyle.bind(win);
  const seen = () => clock - (options.lag ?? 0);
  win.getComputedStyle = (element: Element) =>
    element === fill
      ? {
          transform:
            clock < (options.unresolvedUntil ?? -Infinity)
              ? (options.unresolvedAs ?? "none")
              : `matrix(1, 0, 0, 1, ${((shown(seen()) - 100) / 100) * FILL_PX}, 0)`,
        }
      : computed(element);
  if (options.lag !== undefined) {
    // A transition the main thread has not seen finish is still listed; one
    // it has not seen start has no start time yet.
    fill.getAnimations = () => {
      const move = moves.at(-1)!;
      if (move.ms <= 0 || seen() >= move.at + move.ms) return [];
      return [
        {
          transitionProperty: "transform",
          startTime: seen() >= move.at ? move.at : null,
        },
      ] as unknown as Animation[];
    };
  }

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
    expectNoEarlyClaims(run, DEV_WARM, profile, SCRIPT_START);
    expect(longestStall(points, readyAt)).toBeLessThanOrEqual(600);
    // The fill moves by transform only, ends full, and the screen goes.
    expect(run.fill.style.width).toBe("");
    expect(run.shown(run.now() + 200)).toBe(100);
    expect(run.screen.classList.contains("loaded")).toBe(true);
  });

  it("keeps moving through a blocked main thread (dev warm 2, round 1's failure)", () => {
    const profile: Profile = {
      v: 1,
      at: 0,
      t: Object.fromEntries([
        ["start", DEV_WARM_2_START],
        ...DEV_WARM_2.map(([t, name]) => [name, t]),
      ]),
    };
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
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(longestStall(points, readyAt)).toBeLessThanOrEqual(600);
    // The compositor's transition moved the fill inside the block.
    expect(run.shown(8000)).toBeGreaterThan(run.shown(blockFrom + 20) + 5);
  });

  it("never pulls the fill back when the main thread's clock lags the compositor", () => {
    const profile: Profile = {
      v: 1,
      at: 0,
      t: Object.fromEntries([
        ["start", DEV_WARM_2_START],
        ...DEV_WARM_2.map(([t, name]) => [name, t]),
      ]),
    };
    const run = boot({
      profile,
      startAt: DEV_WARM_2_START,
      blocked: DEV_WARM_2_BLOCK,
      lag: 300,
    });
    run.replay(DEV_WARM_2);
    // No write ever starts behind where the compositor has the fill.
    for (const move of run.moves.slice(1)) {
      expect(move.to, `write at ${move.at}`).toBeGreaterThanOrEqual(
        move.from - 0.005
      );
    }
    const points = run.trace(DEV_WARM_2_START, 8378);
    expectMonotonic(points);
    expectNoEarlyClaims(run, DEV_WARM_2, profile, DEV_WARM_2_START);
    expect(longestStall(points, 8378)).toBeLessThanOrEqual(600);
  });

  it("waits for the first frame to start a segment, then runs for the time left", () => {
    const profile: Profile = {
      v: 1,
      at: 0,
      t: Object.fromEntries([
        ["start", DEV_WARM_2_START],
        ...DEV_WARM_2.map(([t, name]) => [name, t]),
      ]),
    };
    const firstFrame = DEV_WARM_2_START + 120;
    const run = boot({ profile, startAt: DEV_WARM_2_START, firstFrame });
    // Nothing is written before the first frame: a transition written then
    // would jump straight to its end.
    run.advance(firstFrame - 1);
    expect(run.moves).toHaveLength(1);
    run.advance(firstFrame);
    const glide = run.moves.at(-1)!;
    expect(glide.at).toBe(firstFrame);
    expect(glide.from).toBeCloseTo(5, 2);
    // The segment's linear part still ends when it would have.
    const span = DEV_WARM_2[0]![0] - DEV_WARM_2_START;
    expect(glide.ms).toBeCloseTo(0.85 * span - 120, 0);
    expect(run.transitions.at(-1)).toBe(
      `transform ${Math.round(0.85 * span - 120)}ms linear`
    );
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
    const profile: Profile = {
      v: 1,
      at: 0,
      t: Object.fromEntries([
        ["start", DEV_WARM_2_START],
        ...DEV_WARM_2.map(([t, name]) => [name, t]),
      ]),
    };
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
    const segments = run.moves.filter(
      (m) => m.ms > 0 && m.ms !== 80 && m.ms !== 200
    );
    expect(segments.length).toBeGreaterThan(3);
    for (const move of segments) {
      // On a frame; the first frame after the block comes when it ends.
      expect(
        move.at % 16 === 0 || move.at === 6700,
        `segment at ${move.at}`
      ).toBe(true);
    }
    const session = segments.find((m) => m.at >= 6260)!;
    expect(session.at).toBeGreaterThanOrEqual(6700);
    for (const move of run.moves.slice(1)) {
      expect(move.to, `write at ${move.at}`).toBeGreaterThanOrEqual(
        move.from - 0.005
      );
    }
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
    const writes = run.moves.length;
    run.replay([[700, "scripts"]]); // expected at 1200
    const segment = run.moves.slice(writes);
    // Pinned where it was (to the 0.01% the style is written in), then one
    // linear transition from there.
    expect(segment).toHaveLength(2);
    expect(segment[0]!.ms).toBe(0);
    for (const value of [segment[0]!.from, segment[0]!.to, segment[1]!.from]) {
      expect(Math.abs(value - before)).toBeLessThanOrEqual(0.005);
    }
    const linear = segment[1]!;
    expect(linear.ms).toBe(850);
    expect(linear.to).toBeCloseTo(
      share("scripts") + 0.85 * (share("shell") - share("scripts")),
      2
    );
    const nominal = (share("shell") - share("scripts")) / 1000;
    expect((linear.to - linear.from) / linear.ms).toBeGreaterThan(nominal);
    expect(run.transitions.at(-1)).toBe("transform 850ms linear");
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

    run.advance(2300);
    const early = run.width();
    run.advance(3600);
    const late = run.width();
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThan(cloudCap);
    // The tail is short ticker steps, never a stall.
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
    const writes = run.moves.length;
    run.win.__tkaLoadProgress(72, "Starting up...");
    expect(run.moves.length).toBe(writes);
    expect(run.screen.classList.contains("loaded")).toBe(false);
    expect(run.marks).toContain("boot:splash:legacy:72");

    run.win.__tkaLoadProgress(100, "Ready");
    expect(run.transitions.at(-1)).toBe("transform 200ms ease");
    expect(run.shown(run.now() + 200)).toBe(100);
    expect(run.screen.getAttribute("aria-valuenow")).toBe("100");
    expect(run.screen.classList.contains("loaded")).toBe(true);
    expect(run.probe().milestones.at(-1)?.name).toBe("ready");
  });

  it("still moves the fill under reduced motion, without transitions, and leaves at once", () => {
    const run = boot({ reduceMotion: true });
    run.advance(1500);
    expect(run.width()).toBeGreaterThan(5);
    run.replay([[1600, "ready"]]);
    expect(new Set(run.transitions)).toEqual(new Set(["none"]));
    expect(run.moves.every((m) => m.ms === 0)).toBe(true);
    expect(run.screen.isConnected).toBe(false);
  });

  it("never reads an unresolved or foreign transform as a full fill", () => {
    // "none", or the identity a cold boot under reduced motion read while
    // other animations sat on the fill.
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

  it("probes what is on screen and reports it as the progressbar value", () => {
    const run = boot({ profile: devWarmProfile() });
    run.replay(DEV_WARM.slice(0, 3));
    run.advance(2000);
    const sample = run.probe().samples.at(-1)!;
    // Mid-segment the target is ahead of the fill, and the sample is the fill.
    expect(sample.target).toBeGreaterThan(sample.pct);
    expect(sample.pct).toBeCloseTo(run.shown(sample.t), 1);
    expect(Number(run.screen.getAttribute("aria-valuenow"))).toBe(
      Math.round((100 * (sample.pct - 4)) / 96)
    );
  });

  it("leaves a hidden (landing) screen alone: no ticker, no profile", () => {
    const run = boot({ hidden: "landing" });
    run.replay(DEV_WARM);
    expect(run.probe().samples).toEqual([]);
    expect(run.stored()).toBeNull();
    expect(run.screen.style.display).toBe("none");
  });
});

/**
 * Boot bar contract: the app.html fill replays the last boot's own timing.
 *
 * Silent regressions: a fill that sits still, runs backwards, claims a
 * milestone before it arrives, or never lets the screen go all look like
 * "the app is slow" rather than a bug. These replay recorded boots against
 * the real inline script with a controlled clock.
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
  samples: Array<{ t: number; pct: number }>;
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
  let clock = SCRIPT_START;
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

  win.eval(loadingScript);

  const width = () => parseFloat(fill.style.width || "5");
  // Every observation of the fill: one per timer run and per milestone.
  const widths: Array<{ t: number; w: number }> = [{ t: clock, w: width() }];

  function advance(to: number) {
    for (;;) {
      const due = timers
        .filter((timer) => timer.live && timer.at <= to)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = Math.max(clock, due.at);
      if (due.every) due.at += due.every;
      else due.live = false;
      due.run();
      widths.push({ t: clock, w: width() });
    }
    clock = Math.max(clock, to);
  }

  function replay(timeline: Timeline) {
    for (const [at, name] of timeline) {
      advance(at);
      win.__tkaBootMilestone(name);
      widths.push({ t: clock, w: width() });
    }
  }

  return {
    win,
    screen,
    fill,
    text,
    marks,
    widths,
    width,
    advance,
    replay,
    probe: () => win.__tkaBootBar as Probe,
    stored: (): Profile | null => {
      const saved = win.localStorage.getItem("tka-boot-profile");
      return saved ? JSON.parse(saved) : null;
    },
  };
}

/** Longest stretch, before ready, in which the script wrote no new width. */
function longestStall(probe: Probe, readyAt: number): number {
  const writes = [SCRIPT_START, ...probe.samples.map((s) => s.t), readyAt];
  let longest = 0;
  for (let i = 1; i < writes.length; i++) {
    longest = Math.max(longest, writes[i]! - writes[i - 1]!);
  }
  return longest;
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
    const probe = run.probe();
    expect(probe.defaultProfile).toBe(false);

    const readyAt = 4370;
    const before = run.widths.filter((entry) => entry.t < readyAt);
    for (let i = 1; i < before.length; i++) {
      expect(before[i]!.w).toBeGreaterThanOrEqual(before[i - 1]!.w);
    }
    // Each profiled milestone's share is out of reach until it arrives.
    const ready = profile.t.ready!;
    for (const [at, name] of DEV_WARM) {
      if (name === "ready" || profile.t[name] === undefined) continue;
      const cap = 4 + 96 * (profile.t[name]! / ready);
      for (const entry of run.widths.filter((e) => e.t < at)) {
        expect(entry.w, `${name} at ${entry.t}`).toBeLessThan(cap);
      }
    }
    expect(longestStall(probe, readyAt)).toBeLessThanOrEqual(600);
    // The fill ends full and the screen goes.
    expect(run.fill.style.width).toBe("100%");
    expect(run.screen.classList.contains("loaded")).toBe(true);
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
    for (let i = 1; i < run.widths.length; i++) {
      expect(run.widths[i]!.w).toBeGreaterThanOrEqual(run.widths[i - 1]!.w);
    }
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
    const before = run.width();
    run.win.__tkaLoadProgress(72, "Starting up...");
    expect(run.width()).toBe(before);
    expect(run.screen.classList.contains("loaded")).toBe(false);
    expect(run.marks).toContain("boot:splash:legacy:72");

    run.win.__tkaLoadProgress(100, "Ready");
    expect(run.fill.style.width).toBe("100%");
    expect(run.screen.classList.contains("loaded")).toBe(true);
    expect(run.probe().milestones.at(-1)?.name).toBe("ready");
  });

  it("still moves the fill under reduced motion and leaves at once", () => {
    const run = boot({ reduceMotion: true });
    run.advance(1500);
    expect(run.width()).toBeGreaterThan(5);
    run.replay([[1600, "ready"]]);
    expect(run.screen.isConnected).toBe(false);
  });

  it("finishes the boot when storage throws", () => {
    const run = boot({ storage: "throws" });
    expect(run.probe().defaultProfile).toBe(true);
    run.replay(DEV_WARM.slice(0, 4));
    expect(run.width()).toBeGreaterThan(5);
    run.replay([[4370, "ready"]]);
    expect(run.fill.style.width).toBe("100%");
    expect(run.screen.classList.contains("loaded")).toBe(true);
  });

  it("leaves a hidden (landing) screen alone: no ticker, no profile", () => {
    const run = boot({ hidden: "landing" });
    run.replay(DEV_WARM);
    expect(run.probe().samples).toEqual([]);
    expect(run.stored()).toBeNull();
    expect(run.screen.style.display).toBe("none");
  });
});

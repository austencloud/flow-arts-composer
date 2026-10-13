/**
 * Composer handoff contract.
 *
 * Silent regressions: the public page → app reload still works without any of
 * this, it just loses the morph. The handoff script must survive the homepage's
 * app-only stripping (pageswap fires on "/"), the pressed Composer link and the
 * boot capsule must share the name only while one handoff is in flight, the
 * arrival must leave its instrumentation, and the boot screen must stop
 * rendering the boot phases it is handed.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { stripRootAppOnlyBlocks } from "#lib/server/performance/landing-preload-policy.js";

const KEY = "tka-composer-handoff";
const template = readFileSync("src/app.html", "utf8");
const scripts = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1] ?? ""
);
const handoffScript = scripts.find((script) => script.includes(`"${KEY}"`))!;
const loadingScript = scripts.find((script) =>
  script.includes("var __tkaFinished = false")
)!;

interface HandoffRecord {
  mode: string;
  swapToRevealMs: number;
  source: unknown;
  target: unknown;
  readyMs: number | null;
  finishedMs: number | null;
}

let pages: JSDOM[] = [];
afterEach(() => {
  for (const page of pages) page.window.close();
  pages = [];
});

function open(html: string, url: string): JSDOM {
  const page = new JSDOM(html, { url, runScripts: "outside-only" });
  pages.push(page);
  return page;
}

/** A view transition stand-in: records skips and types, resolves when told. */
function fakeTransition() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  return {
    skipped: false,
    types: new Set<string>(),
    ready: Promise.resolve(),
    finished,
    finish,
    skipTransition() {
      this.skipped = true;
    },
  };
}

function fire(
  page: JSDOM,
  type: "pageswap" | "pagereveal",
  init: Record<string, unknown>
): void {
  const event = new page.window.Event(type);
  Object.assign(event, init);
  page.window.dispatchEvent(event);
}

function place(element: Element, x: number, y: number, w: number, h: number) {
  element.getBoundingClientRect = () =>
    ({
      left: x,
      top: y,
      width: w,
      height: h,
      right: x + w,
      bottom: y + h,
    }) as DOMRect;
}

function press(page: JSDOM, element: Element) {
  element.dispatchEvent(
    new page.window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

function handoffOf(page: JSDOM): HandoffRecord | undefined {
  return (page.window as unknown as { __tkaHandoff?: HandoffRecord })
    .__tkaHandoff;
}

const PUBLIC_PAGE =
  '<div class="hero-demo"></div>' +
  '<a class="cta" href="/create">Open Flow Arts Composer</a>' +
  '<a class="other" href="/learn/concepts">Learn</a>';

const BOOT_SCREEN =
  '<div id="app-loading"><div id="boot-capsule" class="boot-capsule">' +
  '<div class="boot-capsule-fill" id="loading-bar-fill"></div>' +
  '<span class="boot-capsule-label" id="loading-text"></span></div></div>';

function publicPage() {
  const page = open(PUBLIC_PAGE, "https://localhost/");
  // Keep JSDOM from trying to navigate when a link is pressed.
  page.window.document.addEventListener("click", (event) =>
    event.preventDefault()
  );
  page.window.eval("window.__tkaIsLanding = true;");
  page.window.eval(handoffScript);
  const document = page.window.document;
  const cta = document.querySelector<HTMLAnchorElement>(".cta")!;
  const hero = document.querySelector<HTMLElement>(".hero-demo")!;
  place(cta, 760, 20, 220, 40);
  place(hero, 100, 100, 400, 400);
  return { page, cta, hero };
}

function readRecord(page: JSDOM) {
  const saved = page.window.sessionStorage.getItem(KEY);
  return saved ? JSON.parse(saved) : null;
}

function arrive(record: unknown) {
  const page = open(BOOT_SCREEN, "https://localhost/create");
  if (record) page.window.sessionStorage.setItem(KEY, JSON.stringify(record));
  return page;
}

describe("composer handoff", () => {
  it("keeps the transition opt-in and the handoff script on the stripped homepage", () => {
    const home = stripRootAppOnlyBlocks(template);
    expect(home).toContain("@view-transition");
    expect(home).toContain(`"${KEY}"`);
    expect(home).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*@view-transition\s*\{\s*navigation: none;/
    );
    expect(handoffScript).toContain("prefers-reduced-motion: reduce");
  });

  it("retires the old centrepiece everywhere", () => {
    expect(template).not.toContain("composer-stage");
    expect(template).not.toContain("boot-mark");
    expect(template).not.toContain(".hero-demo");
    expect(template).toContain('<link rel="expect" href="#boot-capsule"');
    expect(template).toMatch(
      /active-view-transition-type\(tka-handoff\)::view-transition-old\(root\)/
    );
  });

  it("names the pressed Composer link, never the hero, and records its rect", () => {
    const { page, cta, hero } = publicPage();

    // A link elsewhere: no name, no record.
    press(page, page.window.document.querySelector(".other")!);
    fire(page, "pageswap", {
      viewTransition: fakeTransition(),
      activation: { entry: { url: "https://localhost/learn/concepts" } },
    });
    expect(cta.style.viewTransitionName).toBe("");
    expect(readRecord(page)).toBeNull();

    press(page, cta);
    const transition = fakeTransition();
    fire(page, "pageswap", {
      viewTransition: transition,
      activation: { entry: { url: "https://localhost/create" } },
    });
    expect(cta.style.viewTransitionName).toBe("composer-cta");
    expect(hero.style.viewTransitionName).toBe("");
    expect(transition.types.has("tka-handoff")).toBe(true);
    const record = readRecord(page);
    expect(record.mode).toBe("morph");
    expect(typeof record.at).toBe("number");
    expect(record.source).toMatchObject({ x: 760, y: 20, w: 220, h: 40 });

    // Back/forward cache restore: the old page must not keep the name.
    fire(page, "pagereveal", { viewTransition: null });
    expect(cta.style.viewTransitionName).toBe("");
  });

  it("falls back to the plain fade when the pressed link is off screen or unknown", () => {
    const { page, cta } = publicPage();
    place(cta, 760, -200, 220, 40);
    press(page, cta);
    const transition = fakeTransition();
    fire(page, "pageswap", {
      viewTransition: transition,
      activation: { entry: { url: "https://localhost/create" } },
    });
    expect(cta.style.viewTransitionName).toBe("");
    expect(transition.types.has("tka-handoff")).toBe(false);
    expect(readRecord(page)).toMatchObject({ mode: "fade", source: null });

    // Navigation to /create with no activated link (script, history).
    const second = publicPage();
    fire(second.page, "pageswap", {
      viewTransition: fakeTransition(),
      activation: { entry: { url: "https://localhost/create" } },
    });
    expect(readRecord(second.page)).toMatchObject({ mode: "fade" });
  });

  it("skips the transition under reduced motion and writes nothing", () => {
    const { page, cta } = publicPage();
    const reduce = ((query: string) => ({
      matches: query.includes("reduce"),
    })) as unknown as typeof page.window.matchMedia;
    page.window.matchMedia = reduce;
    press(page, cta);
    const transition = fakeTransition();
    fire(page, "pageswap", {
      viewTransition: transition,
      activation: { entry: { url: "https://localhost/create" } },
    });
    expect(transition.skipped).toBe(true);
    expect(cta.style.viewTransitionName).toBe("");
    expect(readRecord(page)).toBeNull();

    const arrival = arrive({ mode: "morph", at: Date.now(), source: null });
    arrival.window.matchMedia = reduce;
    arrival.window.eval(handoffScript);
    const landing = fakeTransition();
    fire(arrival, "pagereveal", { viewTransition: landing });
    expect(landing.skipped).toBe(true);
    expect(
      arrival.window.document.getElementById("boot-capsule")!.style
        .viewTransitionName
    ).toBe("");
  });

  it("names the capsule on a morph arrival, instruments it, and clears the name", async () => {
    const source = { x: 1200, y: 20, w: 220, h: 40, vw: 1440, vh: 900 };
    const page = arrive({ mode: "morph", at: Date.now() - 30, source });
    // JSDOM has no User Timing; record what the arrival marks and measures.
    const timings: string[] = [];
    Object.assign(page.window.performance, {
      mark: (name: string) => timings.push(name),
      measure: (name: string) => timings.push(name),
    });
    page.window.eval(handoffScript);
    const capsule = page.window.document.getElementById("boot-capsule")!;
    place(capsule, 600, 426, 240, 48);
    const transition = fakeTransition();

    fire(page, "pagereveal", { viewTransition: transition });
    expect(capsule.style.viewTransitionName).toBe("composer-cta");
    expect(transition.types.has("tka-handoff")).toBe(true);
    expect(page.window.sessionStorage.getItem(KEY)).toBeNull();

    const handoff = handoffOf(page)!;
    expect(handoff.mode).toBe("morph");
    expect(handoff.swapToRevealMs).toBeGreaterThanOrEqual(30);
    expect(handoff.source).toEqual(source);
    expect(handoff.target).toMatchObject({ x: 600, y: 426, w: 240, h: 48 });

    transition.finish();
    await transition.finished;
    await Promise.resolve();
    expect(capsule.style.viewTransitionName).toBe("");
    expect(handoff.readyMs).not.toBeNull();
    expect(handoff.finishedMs).not.toBeNull();
    expect(timings).toEqual([
      "tka:handoff:reveal",
      "tka:handoff:ready",
      "tka:handoff:finished",
      "tka:handoff",
    ]);
  });

  it("instruments a fade arrival without naming the capsule", () => {
    const page = arrive({ mode: "fade", at: Date.now(), source: null });
    page.window.eval(handoffScript);
    const transition = fakeTransition();
    fire(page, "pagereveal", { viewTransition: transition });
    expect(
      page.window.document.getElementById("boot-capsule")!.style
        .viewTransitionName
    ).toBe("");
    expect(transition.types.has("tka-handoff")).toBe(false);
    expect(handoffOf(page)?.mode).toBe("fade");
  });

  it("does not morph or instrument an arrival that was not handed off", () => {
    const page = arrive(null);
    page.window.eval(handoffScript);
    fire(page, "pagereveal", { viewTransition: fakeTransition() });
    expect(
      page.window.document.getElementById("boot-capsule")!.style
        .viewTransitionName
    ).toBe("");
    expect(handoffOf(page)).toBeUndefined();
  });

  it("stretches the timing only when the slow-motion knob holds a number", () => {
    const slowed = (value: string) => {
      const page = arrive({ mode: "morph", at: Date.now(), source: null });
      page.window.localStorage.setItem("tka-handoff-slow", value);
      page.window.eval(handoffScript);
      fire(page, "pagereveal", { viewTransition: fakeTransition() });
      return page.window.document.documentElement.style.getPropertyValue(
        "--tka-handoff-slow"
      );
    };
    expect(slowed("8")).toBe("8");
    expect(slowed("fast")).toBe("");
    expect(template).toContain("calc(420ms * var(--tka-handoff-slow, 1))");
  });

  it("shows two plain strings in the capsule and never the boot phases it is handed", () => {
    const page = arrive(null);
    Object.defineProperty(page.window.navigator, "languages", {
      value: ["en"],
    });
    // Capture timers so the 4 s "Almost there" step runs on demand.
    const timers: Array<{ run: () => void; ms: number }> = [];
    page.window.setTimeout = ((run: () => void, ms: number) =>
      timers.push({ run, ms })) as unknown as typeof page.window.setTimeout;
    page.window.eval(loadingScript);
    const text = page.window.document.getElementById("loading-text")!;
    const fill = page.window.document.getElementById("loading-bar-fill")!;
    expect(text.textContent).toBe("Opening Flow Arts Composer");

    page.window.eval('window.__tkaLoadProgress(88, "Loading settings...")');
    expect(text.textContent).toBe("Opening Flow Arts Composer");
    expect(fill.style.width).toBe("88%");

    timers.find((timer) => timer.ms === 4000)!.run();
    timers.find((timer) => timer.ms === 200)!.run();
    expect(text.textContent).toBe("Almost there");
  });
});

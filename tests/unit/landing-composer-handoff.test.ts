/**
 * Composer handoff contract.
 *
 * Silent regressions: the public page → app reload still works without any of
 * this, it just loses the morph. The handoff script must survive the homepage's
 * app-only stripping (pageswap fires on "/"), the shared name must exist only
 * while one handoff is in flight, and the boot screen must stop rendering the
 * boot phases it is handed.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { stripRootAppOnlyBlocks } from "#lib/server/performance/landing-preload-policy.js";

const template = readFileSync("src/app.html", "utf8");
const scripts = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (match) => match[1] ?? ""
);
const handoffScript = scripts.find((script) =>
  script.includes('"tka-composer-handoff"')
)!;
const loadingScript = scripts.find((script) =>
  script.includes("var __tkaFinished = false")
)!;

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

/** A view transition stand-in: records skips, resolves when told. */
function fakeTransition() {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  return {
    skipped: false,
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

describe("composer handoff", () => {
  it("keeps the transition opt-in and the handoff script on the stripped homepage", () => {
    const home = stripRootAppOnlyBlocks(template);
    expect(home).toContain("@view-transition");
    expect(home).toContain('"tka-composer-handoff"');
    expect(home).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*@view-transition\s*\{\s*navigation: none;/
    );
    expect(handoffScript).toContain("prefers-reduced-motion: reduce");
  });

  it("names the on-screen hero only when a public page leaves for /create", () => {
    const page = open('<div class="hero-demo"></div>', "https://localhost/");
    page.window.eval("window.__tkaIsLanding = true;");
    page.window.eval(handoffScript);
    const hero = page.window.document.querySelector<HTMLElement>(".hero-demo")!;
    hero.getBoundingClientRect = () =>
      ({
        width: 400,
        height: 400,
        top: 100,
        left: 100,
        bottom: 500,
        right: 500,
      }) as DOMRect;

    fire(page, "pageswap", {
      viewTransition: fakeTransition(),
      activation: { entry: { url: "https://localhost/learn/concepts" } },
    });
    expect(hero.style.viewTransitionName).toBe("");
    expect(
      page.window.sessionStorage.getItem("tka-composer-handoff")
    ).toBeNull();

    fire(page, "pageswap", {
      viewTransition: fakeTransition(),
      activation: { entry: { url: "https://localhost/create" } },
    });
    expect(hero.style.viewTransitionName).toBe("composer-stage");
    expect(page.window.sessionStorage.getItem("tka-composer-handoff")).toBe(
      "morph"
    );

    // Back/forward cache restore: the old page must not keep the name.
    fire(page, "pagereveal", { viewTransition: null });
    expect(hero.style.viewTransitionName).toBe("");
  });

  it("gives the boot mark the name on arrival and clears it when the morph ends", async () => {
    const page = open(
      '<div id="app-loading"><svg id="boot-mark"></svg></div>',
      "https://localhost/create"
    );
    page.window.sessionStorage.setItem("tka-composer-handoff", "morph");
    page.window.eval(handoffScript);
    const mark = page.window.document.getElementById("boot-mark")!;
    const transition = fakeTransition();

    fire(page, "pagereveal", { viewTransition: transition });
    expect(mark.style.viewTransitionName).toBe("composer-stage");
    expect(
      page.window.sessionStorage.getItem("tka-composer-handoff")
    ).toBeNull();

    transition.finish();
    await transition.finished;
    await Promise.resolve();
    expect(mark.style.viewTransitionName).toBe("");
  });

  it("does not morph an arrival that was not handed off", () => {
    const page = open(
      '<div id="app-loading"><svg id="boot-mark"></svg></div>',
      "https://localhost/create"
    );
    page.window.eval(handoffScript);
    fire(page, "pagereveal", { viewTransition: fakeTransition() });
    expect(
      page.window.document.getElementById("boot-mark")!.style.viewTransitionName
    ).toBe("");
  });

  it("shows two plain strings and never the boot phases it is handed", () => {
    const page = open(
      '<div id="app-loading"><div id="loading-bar-fill"></div><p id="loading-text"></p></div>',
      "https://localhost/create"
    );
    Object.defineProperty(page.window.navigator, "languages", {
      value: ["en"],
    });
    // Capture timers so the 4 s "Almost there" step runs on demand.
    const timers: Array<{ run: () => void; ms: number }> = [];
    page.window.setTimeout = ((run: () => void, ms: number) =>
      timers.push({ run, ms })) as unknown as typeof page.window.setTimeout;
    page.window.eval(loadingScript);
    const text = page.window.document.getElementById("loading-text")!;
    expect(text.textContent).toBe("Opening Flow Arts Composer");

    page.window.eval('window.__tkaLoadProgress(88, "Loading settings...")');
    expect(text.textContent).toBe("Opening Flow Arts Composer");

    timers.find((timer) => timer.ms === 4000)!.run();
    timers.find((timer) => timer.ms === 200)!.run();
    expect(text.textContent).toBe("Almost there");
  });
});

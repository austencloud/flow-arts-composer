/**
 * The Hand Motions page is the lesson's script and plays the lesson's own
 * stages in place: every shared word is in the markup, the map, the two
 * hands and the quiz are screens of the page, and nothing links out to the
 * separate lesson.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

// The figures and stages draw pictographs the test runner does not serve;
// the words, the screens and the links carry the proof.
const stub = vi.hoisted(() => async () => ({
  default: (await import("./__test-stubs__/EmptyStub.svelte")).default,
}));
vi.mock("#lib/shared/guide-topics/HandMotionsChart.svelte", stub);
vi.mock("#lib/shared/guide-topics/HandCombinationBoard.svelte", stub);
// The map stage itself renders: its slots carry the three moves' words.
vi.mock("#lib/shared/guide-topics/MotionMapFigure.svelte", stub);
vi.mock(
  "#lib/features/learn/components/interactive/motions/HandPairsStage.svelte",
  stub
);
vi.mock(
  "#lib/features/learn/components/interactive/motions/HandMotionsQuizStage.svelte",
  stub
);

import HandMotionsTopicPage from "./HandMotionsTopicPage.svelte";

/**
 * The page shows one screen at a time: open each screen in turn through its
 * pill and read its words and links, in screen order.
 */
async function readScreens(container: HTMLElement): Promise<{
  labels: string[];
  screens: string[];
  links: (string | null)[];
}> {
  const labels: string[] = [];
  const screens: string[] = [];
  const links: (string | null)[] = [];
  const pills = container.querySelectorAll<HTMLButtonElement>(
    ".guide-screens .pill"
  );
  expect(pills.length).toBeGreaterThan(2);
  for (const pill of pills) {
    labels.push((pill.textContent ?? "").trim().replace(/^[0-9]+/, ""));
    pill.click();
    await new Promise((r) => setTimeout(r, 500));
    const body = container.querySelector(".guide-screens .body")!;
    screens.push(body.textContent ?? "");
    for (const a of container.querySelectorAll<HTMLAnchorElement>(
      ".guide-screens .body a, .guide-screens .lead a"
    ))
      links.push(a.getAttribute("href"));
  }
  return { labels, screens, links };
}

describe("Hand Motions topic page", () => {
  it("plays the map, the two hands and the quiz in place, with no links out", async () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: false,
      kicker: "Level 1",
      lessonHref: "/learn/concepts/hand-motions-intro?from-start",
      lessonId: "hand-motions-intro",
    });
    const { labels, screens, links } = await readScreens(screen.container);
    expect(labels.slice(0, 2)).toEqual(["Three moves", "The map"]);
    expect(labels.slice(-2)).toEqual(["Two hands", "Quiz"]);
    expect(screens[1]).toContain("Pick a point to move the hand.");
    expect(screens.at(-2)).toContain("Move the blue hand, then the red hand.");
    expect(screens.at(-1)).toContain("Which one is this?");
    expect(links).toEqual([]);
    expect(screen.container.textContent).not.toContain(
      "Learn this interactively"
    );
  });

  it("leaves the two hands and the quiz to the lesson it is read inside", async () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: true,
      kicker: "Read this topic",
      lessonHref: null,
      lessonId: null,
    });
    const { labels, screens, links } = await readScreens(screen.container);
    expect(labels).not.toContain("Two hands");
    expect(labels).not.toContain("Quiz");
    expect(screens[1]).toContain("Pick a point to move the hand.");
    expect(links).toEqual([]);
  });

  it("carries the shared words: the three moves and the combinations lead", async () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: false,
      kicker: "Level 1",
      lessonHref: null,
      lessonId: "hand-motions-intro",
    });
    const { screens } = await readScreens(screen.container);
    const text = screens.join(" ");
    for (const word of [
      "Shift",
      "Dash",
      "Static",
      "Remain at the same point",
      "Using these, we can make six combinations, named below.",
    ]) {
      expect(text).toContain(word);
    }
  });
});

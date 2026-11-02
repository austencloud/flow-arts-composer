/**
 * The run of six combination pages after Hand Motions (2026-10-31, Austen:
 * "one tiny little bite-sized chunk of a concept at a time with clear way to
 * move forward and an understanding where you are in context of the whole
 * picture"). Dual-Shift, Shift and Cross-Shift each have a page; Dash,
 * Dual-Dash and Static share one, a screen each. Every page of the run shows
 * the same switcher of all six, so the run reads as one spine.
 */
import {
  HAND_COMBINATIONS,
  combinationNameSegments,
  type HandCombination,
} from "#lib/shared/guide-topics/hand-motions-topic.js";
import type { TopicFrame, TopicPageLink } from "./topic-pages";

/** The kicker on every page of the run. */
export const HAND_TYPE_KICKER = "Level 1 · Hand Motions · the six combinations";

/** The Guide pages that make up the run. */
export const HAND_TYPE_SLUGS: ReadonlySet<string> = new Set(
  HAND_COMBINATIONS.map((c) => c.guideSlug)
);

/** The combinations a page teaches, a screen each, in record order. */
export function pageCombinations(slug: string): readonly HandCombination[] {
  return HAND_COMBINATIONS.filter((c) => c.guideSlug === slug);
}

/** The combination a page opens on: where a link to the page lands. */
export function combinationOpening(slug: string): HandCombination | null {
  return pageCombinations(slug)[0] ?? null;
}

/** The Guide slug a Level 1 page link points at, with any locale prefix. */
export function slugOfHref(href: string): string {
  return href.split(/[?#]/)[0]!.replace(/\/+$/, "").split("/").at(-1) ?? "";
}

/** The book's Shift purple is too dark to read on the dark canvas; the
 *  Type 1 page lifts it, and so does every name in the run. */
const LIFT_ON_DARK: Record<string, string> = { "#6f2da8": "#b48cff" };

/** The screen green, blue and orange are too pale to read on the light
 *  page; there the names take the book's printed shades, the ones the
 *  run's prose already wears on a light page. */
const DEEPEN_ON_LIGHT: Record<string, string> = {
  "#26e600": "#2f9e44",
  "#00b3ff": "#0b8fd0",
  "#eb7d00": "#d26b00",
};

export function inkOn(color: string, dark: boolean): string {
  const key = color.toLowerCase();
  return (dark ? LIFT_ON_DARK[key] : DEEPEN_ON_LIGHT[key]) || color;
}

export type NameSegment = { text: string; color: string };

/** A combination name in its letter-type colours, lifted for a dark page:
 *  Dual-Shift, Cross-Shift and Dual-Dash in two. */
export function nameSegments(
  combination: HandCombination,
  name: string,
  dark: boolean
): NameSegment[] {
  return combinationNameSegments(name, combination.letterType).map((s) => ({
    text: s.text,
    color: inkOn(s.color, dark),
  }));
}

export type SwitcherEntry = {
  combination: HandCombination;
  /** 1 to 6. */
  number: number;
  href: string;
};

/** The six chips, in record order, each linking to its combination's screen. */
export function switcherEntries(
  localize: (href: string) => string = (href) => href
): SwitcherEntry[] {
  return HAND_COMBINATIONS.map((combination, i) => ({
    combination,
    number: i + 1,
    href: localize(combination.webHref),
  }));
}

/** Where a Back or Next button leads (GuideScreens' NavTarget). */
export type RunNavTarget =
  | { kind: "screen"; index: number; text: string }
  | { kind: "page"; href: string; text: string };

/**
 * The combination a Back or Next button leads to, for its coloured name:
 * a screen of this page that teaches one, or a page of the run, which a link
 * opens on its first combination. Null for anything else.
 */
export function navCombination(
  target: RunNavTarget,
  screenCombination: (index: number) => HandCombination | null
): HandCombination | null {
  return target.kind === "screen"
    ? screenCombination(target.index)
    : combinationOpening(slugOfHref(target.href));
}

/** The frame with its neighbouring pages of the run named by the
 *  combination they open on ("Shift", not the page's long title). */
export function runFrame(
  frame: TopicFrame | undefined,
  name: (combination: HandCombination) => string
): TopicFrame | undefined {
  if (!frame) return frame;
  const relabel = (link: TopicPageLink): TopicPageLink => {
    const combination = link && combinationOpening(slugOfHref(link.href));
    return link && combination ? { ...link, title: name(combination) } : link;
  };
  return {
    ...frame,
    prevPage: relabel(frame.prevPage),
    nextPage: relabel(frame.nextPage),
  };
}

import type { Component } from "svelte";
import CodexPointerTopicPage from "./CodexPointerTopicPage.svelte";
import GridTopicPage from "./GridTopicPage.svelte";
import HandMotionsTopicPage from "./HandMotionsTopicPage.svelte";
import PlacementsTopicPage from "./PlacementsTopicPage.svelte";
import StaffPlacementsTopicPage from "./StaffPlacementsTopicPage.svelte";
import Type1DualShiftsTopicPage from "./Type1DualShiftsTopicPage.svelte";

export type TopicPageLink = { href: string; title: string } | null;

/** Where the one-screen frame's Back, Next and All guides lead. */
export type TopicFrame = {
  prevPage: TopicPageLink;
  nextPage: TopicPageLink;
  hubHref: string;
};

/** Props every migrated Guide topic page receives from GuidePageHost. */
export type TopicPageProps = {
  darkMode: boolean;
  kicker: string;
  lessonHref: string | null;
  /** Optional so a page renders alone (tests, previews). */
  frame?: TopicFrame;
  /** The page's own heading, for pages that serve more than one slug. */
  title?: string;
};

/**
 * Guide topics that have moved to the shared-record page template. Any slug
 * not listed here keeps the FlowFrame or sheet rendering.
 */
export const TOPIC_PAGES: Readonly<Record<string, Component<TopicPageProps>>> =
  {
    "the-grid": GridTopicPage,
    "hand-placements": PlacementsTopicPage,
    "hand-motions": HandMotionsTopicPage,
    "staff-placements": StaffPlacementsTopicPage,
    "hm-type1": Type1DualShiftsTopicPage,
    codex: CodexPointerTopicPage,
    "codex-2": CodexPointerTopicPage,
  };

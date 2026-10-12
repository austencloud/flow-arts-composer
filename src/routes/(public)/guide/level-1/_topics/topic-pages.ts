import type { Component } from "svelte";
import GridTopicPage from "./GridTopicPage.svelte";
import HandMotionsTopicPage from "./HandMotionsTopicPage.svelte";
import PlacementsTopicPage from "./PlacementsTopicPage.svelte";
import StaffPlacementsTopicPage from "./StaffPlacementsTopicPage.svelte";

/** Props every migrated Guide topic page receives from GuidePageHost. */
export type TopicPageProps = {
  darkMode: boolean;
  kicker: string;
  lessonHref: string | null;
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
  };

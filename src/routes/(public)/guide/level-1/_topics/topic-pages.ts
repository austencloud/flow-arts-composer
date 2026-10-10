import type { Component } from "svelte";
import GridTopicPage from "./GridTopicPage.svelte";

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
  };

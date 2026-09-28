import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
import type { Level2TopicPage } from "./level2-topic-routes";

/** Resolve visitor-facing copy at render time so a locale switch updates it. */
export function localizedLevel2Topic(
  topic: Level2TopicPage,
  field: "h1" | "description"
): string {
  return tDynamic(`guide_l2_topic_${topic.slug.replaceAll("-", "_")}_${field}`);
}

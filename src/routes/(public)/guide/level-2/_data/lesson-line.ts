import {
  threadOf,
  type LessonThread,
} from "../../_components/fit/lesson-thread";
import { LEVEL2_TOPIC_PAGES } from "./level2-topic-routes";

/** About how many screens each lesson has at 1440 by 900 (census,
 *  2026-11-16): they only size the line's pieces. */
const SCREENS: Record<string, number> = {
  "turn-shifts": 3,
  "types-1-6-turns": 6,
  "s-and-t": 4,
  "opening-closing": 4,
  "one-one-turns": 4,
};
const USUAL = 2;

export function level2Thread(slug: string): LessonThread | null {
  const chapter = LEVEL2_TOPIC_PAGES.find((p) => p.slug === slug)?.chapter;
  if (!chapter) return null;
  const lessons = LEVEL2_TOPIC_PAGES.filter((p) => p.chapter === chapter).map(
    (p) => ({ pages: [{ slug: p.slug, screens: SCREENS[p.slug] ?? USUAL }] })
  );
  return threadOf(`level-2-${chapter}`, lessons, slug);
}

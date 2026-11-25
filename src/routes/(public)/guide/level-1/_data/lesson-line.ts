import {
  threadOf,
  type LessonThread,
  type ThreadLesson,
} from "../../_components/fit/lesson-thread";
import { GUIDE_WEB_PAGES } from "./guide-manifest";
import { HAND_TYPE_SLUGS } from "../_topics/hand-type-switcher";

/** About how many screens each lesson has at 1440 by 900 (census,
 *  2026-11-16, and hand-motions' own list): they size the line's pieces, so
 *  one that drifts by a screen only changes a width. */
const SCREENS: Record<string, number> = {
  "the-grid": 2,
  "hand-placements": 1,
  "hand-motions": 6,
  "hm-type1": 6,
  "hm-type2": 1,
  "hm-type34": 2,
  "hm-type56": 3,
  "staff-placements": 2,
  "staff-motions": 5,
  "lt1-abc-ghi": 6,
  "lt1-dj-ek-fl": 4,
  "lt1-mp-nq-or-stuv": 5,
  "lt1-gamma-words": 7,
  "base-letters": 2,
  "lt3-dash-letters": 2,
  "examples-cccc": 4,
  "sixteen-count": 2,
  "eight-letter-words": 2,
};
const USUAL = 3;

/** A chapter's lessons: a page each, the six combinations' pages one. */
function lessonsOf(group: string): ThreadLesson[] {
  const lessons: ThreadLesson[] = [];
  let run: ThreadLesson | null = null;
  for (const entry of GUIDE_WEB_PAGES) {
    if (entry.group !== group) continue;
    const page = { slug: entry.id, screens: SCREENS[entry.id] ?? USUAL };
    if (HAND_TYPE_SLUGS.has(entry.id)) {
      if (run) {
        run.pages.push(page);
        continue;
      }
      run = { pages: [page] };
      lessons.push(run);
    } else lessons.push({ pages: [page] });
  }
  return lessons;
}

export function level1Thread(slug: string): LessonThread | null {
  const group = GUIDE_WEB_PAGES.find((p) => p.id === slug)?.group;
  return group ? threadOf(`level-1-${group}`, lessonsOf(group), slug) : null;
}

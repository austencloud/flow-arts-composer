/**
 * The one line across a chapter's lessons (2026-11-23, Austen: the lessons
 * are one continuous flow, so one thin line for the whole chapter replaces
 * each page's row of numbered pills and the run's six chips). One piece per
 * lesson, as wide as the lesson is long, filling screen by screen.
 */

/** A lesson: one piece of the line, over one page or several. */
export type ThreadLesson = {
  /** Its pages in reading order, each with about how many screens it has.
   *  The numbers only size the pieces; a page's true count fills them. */
  pages: { slug: string; screens: number }[];
};

/** Where a page stands on its chapter's line. */
export type LessonThread = {
  /** Which chapter's line this is, so a line carries on from the last page. */
  chapter: string;
  /** Each piece's length. */
  lengths: number[];
  /** The piece this page belongs to. */
  piece: number;
  /** The part of that piece before this page, and the part this page is. */
  from: number;
  span: number;
};

const length = (lesson: ThreadLesson) =>
  lesson.pages.reduce((sum, page) => sum + page.screens, 0);

export function threadOf(
  chapter: string,
  lessons: readonly ThreadLesson[],
  slug: string
): LessonThread | null {
  const piece = lessons.findIndex((l) => l.pages.some((p) => p.slug === slug));
  const lesson = lessons[piece];
  if (!lesson) return null;
  const at = lesson.pages.findIndex((p) => p.slug === slug);
  const total = length(lesson);
  const before = length({ pages: lesson.pages.slice(0, at) });
  return {
    chapter,
    lengths: lessons.map(length),
    piece,
    from: before / total,
    span: lesson.pages[at]!.screens / total,
  };
}

/** How far along the line a screen is, in pieces: 2.5 is halfway through the
 *  third. A lesson's last screen fills its piece. */
export function threadPosition(
  thread: LessonThread,
  screen: number,
  count: number
): number {
  const read = Math.min(1, (screen + 1) / Math.max(1, count));
  return thread.piece + thread.from + thread.span * read;
}

/** How full piece `n` is, 0 to 1. */
export function pieceFill(position: number, n: number): number {
  return Math.max(0, Math.min(1, position - n));
}

import { findCaptureTake } from "./capture-files.mjs";

/**
 * What a walkthrough build left in a post, read back from the post itself:
 * an op cannot hand extra data back through an open editor. Mirrors
 * `post-walkthrough.ts`, which puts the bubbles on the `walkthrough` track
 * and each chapter's name on its first bubble.
 */

export const WALKTHROUGH_TRACK_ID = "walkthrough";
/** A YouTube chapter starts this long before its first bubble. */
export const CHAPTER_MARK_LEAD_SECONDS = 1.5;
/** Shorter than this, a bubble is hard to read (the promo renderer's floor). */
export const MIN_READ_SECONDS = 1.6;

/** 75.4 -> "1:15". */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const round = (seconds) => Math.round(seconds * 100) / 100;

export function walkthroughReport(project) {
  const track = (project.tracks ?? []).find(
    (entry) => entry.id === WALKTHROUGH_TRACK_ID
  );
  if (!track)
    throw new Error(
      "This post has no walkthrough yet. Build one with: walkthrough --feature SLUG --lines FILE."
    );
  const bubbles = track.items
    .filter((item) => item.kind === "text")
    .sort((a, b) => a.start - b.start);
  const chapters = bubbles
    .filter((bubble) => bubble.label)
    .map((bubble) => {
      const seconds = round(
        Math.max(0, bubble.start - CHAPTER_MARK_LEAD_SECONDS)
      );
      return { name: bubble.label, seconds, mark: clock(seconds) };
    });
  return {
    bubbles: bubbles.length,
    chapters,
    // YouTube wants the first chapter at 0:00.
    youtube: chapters
      .map(
        (chapter, index) =>
          `${index === 0 ? "0:00" : chapter.mark} ${chapter.name}`
      )
      .join("\n"),
    short: bubbles
      .filter((bubble) => bubble.duration < MIN_READ_SECONDS)
      .map((bubble) => ({
        id: bubble.id,
        text: bubble.text,
        seconds: round(bubble.duration),
      })),
  };
}

/** The take a recording plays in: the one linked to capture `id`, or the only take. */
export function walkthroughTake(takes, id) {
  const linked = typeof id === "string" ? findCaptureTake(takes, id) : null;
  if (linked) return linked.id;
  if (takes.length === 1) return takes[0].id;
  throw new Error(
    takes.length === 0
      ? "This post has no takes. Add the recording with link-capture first."
      : "More than one take could be the recording. Pass --take ID (see capture-info)."
  );
}

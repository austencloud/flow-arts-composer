export const TIMING_LESSON_SCHEMA_VERSION = 2;

export const TIMING_LESSON_TOPICS = [
  {
    id: "placement",
    title: "Placement",
    description:
      "Where things are. Rotate or reflect them: the relationship stays the same.",
  },
  {
    id: "timing",
    title: "Timing",
    description: "Choose a rhythm to watch its downbeats.",
  },
  {
    id: "direction",
    title: "Direction",
    description: "Which way things rotate relative to each other.",
  },
] as const;

export type TimingLessonTopic = (typeof TIMING_LESSON_TOPICS)[number]["id"];

// Saved steps include the hand-path offset. Keep returning learners on the
// comparison board when the old single introduction becomes three steps.
export function migrateTimingLessonSavedStep(
  step: number,
  version: number,
  pathCount: number
): number {
  const first = pathCount + 1;
  const last = first + TIMING_LESSON_TOPICS.length;
  if (!Number.isFinite(step)) return first;
  if (version < TIMING_LESSON_SCHEMA_VERSION && step >= first + 1) return last;
  return Math.min(last, Math.max(first, Math.floor(step)));
}

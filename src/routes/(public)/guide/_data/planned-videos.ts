/**
 * Guide pages that need real footage Austen has not filmed yet (2026-11-07,
 * Austen: a side note "both for the back end, for me and for you as an
 * agent, but also for the viewer to know that, like, hey, this is a work in
 * progress").
 *
 * One entry per page: its slug and the clips it needs, each with what the
 * clip must show. A page with an entry shows a small "Video coming" note on
 * its first screen; nothing else hard-codes that note.
 *
 * When a clip lands, remove its entry (or its line), and the note goes with
 * it once the page needs no more clips. Adding a page is one entry here.
 */

export type PlannedClip = {
  /** The move, in the guide's own words. */
  name: string;
  /** What the footage must show. */
  shows: string;
};

export type PlannedVideoPage = {
  /** The page's slug under its guide level, e.g. "negative-space". */
  slug: string;
  clips: readonly PlannedClip[];
};

export const PLANNED_VIDEOS: readonly PlannedVideoPage[] = [
  {
    slug: "negative-space",
    clips: [
      {
        name: "Negative space",
        shows: "The prop passing through the space above the shoulder.",
      },
      {
        name: "Body turns",
        shows: "A torso turn, so the prop passes in front of the body.",
      },
      {
        name: "360° isolation",
        shows: "A full 360° isolation.",
      },
      {
        name: "4-petal antispin",
        shows: "4-petal antispin in the wall plane.",
      },
    ],
  },
];

/** The clips a page still needs, or null when it needs none. */
export function plannedVideoFor(slug: string): PlannedVideoPage | null {
  const page = PLANNED_VIDEOS.find((p) => p.slug === slug);
  return page && page.clips.length > 0 ? page : null;
}

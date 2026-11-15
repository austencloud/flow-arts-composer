import type { PostItem, PostProject } from "@austencloud/video-editor/core";
import { editContext } from "#lib/shared/post-studio-plugin/index.js";
import { parkTitles } from "#lib/shared/media-composition/domain/post-project-edits.js";
import { mappingFixture } from "./mapping-fixture";

const TITLES_ID = "name-pair-titles";
/** Big for the first two seconds, then the pair glides up to the top left. */
const PARK_AT_SECONDS = 2;
/**
 * Seconds from the titles' start: the slow breakdown, where the animation in
 * the corner and the footage under the titles share one move clock.
 */
const LIT_SPAN = { from: 18, to: 46 };

/**
 * The woods takes with a name pair over them: the name and how to say it,
 * parked top left by 2.8 s, staying to the end, and lighting the letter being
 * performed through the slow part. A small animation in the corner shows the
 * same move's letter for comparison. Never loads or saves the creator's draft.
 */
export function namePairFixture(sequenceId: string): PostProject {
  const base = mappingFixture();
  const main = base.tracks[0]!;
  const end = main.items.reduce(
    (latest, item) => Math.max(latest, item.start + item.duration),
    0
  );
  const animation = {
    id: "name-pair-animation",
    kind: "animation",
    start: 0,
    duration: end,
    box: { x: 0.66, y: 0.74, width: 0.3, height: 0.2 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    overlay: true,
  } as PostItem;
  const titles = {
    id: TITLES_ID,
    kind: "titles",
    start: 0,
    duration: end,
    box: { x: 0, y: 0, width: 1, height: 1 },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: null,
    fill: false,
    spoken: "delta-dash, lambda, R, Z",
    lit: LIT_SPAN,
  } as PostItem;
  // The tapped beats belong to the post's sequence, so they carry its id.
  const timings = Object.fromEntries(
    Object.entries(base.timings ?? {}).map(([key, timing]) => [
      key,
      { ...timing, sequenceId },
    ])
  );
  const project: PostProject = {
    ...base,
    sequenceId,
    timings,
    tracks: [
      main,
      {
        id: "name-pair-animation-track",
        hidden: false,
        locked: false,
        items: [animation],
      },
      {
        id: "name-pair-titles-track",
        hidden: false,
        locked: false,
        items: [titles],
      },
    ],
  };
  // The real Park top left edit writes the box keys and the stay.
  return parkTitles(project, TITLES_ID, PARK_AT_SECONDS, editContext(0));
}

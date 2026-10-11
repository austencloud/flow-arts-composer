import type { ClipStep, VideoEditorState } from "@austencloud/video-editor";
import {
  POST_TIME_EPSILON,
  findItem,
  itemEnd,
  type PostVideoItem,
  postSecondsOfKeyframe,
} from "@austencloud/video-editor/core";
import type {
  ResolvedTakeTiming,
  TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { shownLandings } from "#lib/shared/share/components/post-studio/builder/timing-lane-landings.js";
import { tkaEditorOf } from "./tka-editor-context";

/**
 * The take's landings that fall inside the clip, in post seconds, earliest
 * first: the moments a placement is held, from the beats Austen tapped for
 * the take, so a keyframe can go where the performer lands, then be nudged
 * to where the body actually got there. A step's label is the count as the
 * Timing tool shows it ("S", then 1 to the moves per pass). A take not yet
 * tapped has none.
 */
export function clipSteps(
  item: PostVideoItem,
  timing: TakeTiming | null,
  resolved: ResolvedTakeTiming | null
): ClipStep[] {
  if (!timing || !resolved || resolved.movesPerPass <= 0) return [];
  const moves = resolved.movesPerPass;
  const start = item.start - POST_TIME_EPSILON;
  const end = itemEnd(item) + POST_TIME_EPSILON;
  return shownLandings(timing, resolved)
    .map((landing) => {
      const stepIndex =
        landing.position > 0 ? (landing.position - 1) % moves : null;
      return {
        seconds: postSecondsOfKeyframe(item, landing.seconds),
        position: landing.position,
        stepIndex,
        label: stepIndex === null ? "S" : String(stepIndex + 1),
        passStart: stepIndex === 0,
      };
    })
    .filter((step) => step.seconds >= start && step.seconds <= end)
    .sort((a, b) => a.seconds - b.seconds);
}

/** The crop screen's steps for a clip tka's editor holds; none for any other. */
export function tkaCropSteps(
  editor: VideoEditorState,
  itemId: string
): readonly ClipStep[] {
  const wrapper = tkaEditorOf(editor)?.wrapper;
  const clip = wrapper ? findItem(wrapper.project, itemId)?.item : undefined;
  if (!wrapper || clip?.kind !== "video") return [];
  return clipSteps(
    clip,
    wrapper.timing(clip.takeId),
    wrapper.resolvedTiming(clip.takeId)
  );
}

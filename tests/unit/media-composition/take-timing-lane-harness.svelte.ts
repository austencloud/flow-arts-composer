import { flushSync, mount, unmount } from "svelte";
import {
  placeTakeLanding,
  resolveTakeTiming,
  takeLandingDragRange,
  type TakeTiming,
} from "$lib/shared/media-composition/domain/take-timing";
import TakeTimingLane from "$lib/shared/share/components/post-studio/builder/TakeTimingLane.svelte";
import type { LandingRef } from "$lib/shared/share/components/post-studio/builder/post-timing-session.svelte";

/**
 * The timing lane on `initial` at `mediaSeconds` in Adjust landings mode,
 * wired as the session wires it: a click selects a landing, and a drag
 * places it on the take. Needs a real `document.createElement` and a
 * `ResizeObserver` for the lane to measure its width with.
 */
export function mountTimingLane(
  initial: TakeTiming,
  mediaSeconds: number,
  moveBeats: readonly number[]
) {
  let timing = $state.raw(initial);
  let resolved = $state.raw(resolveTakeTiming(initial, moveBeats));
  let selected = $state.raw<LandingRef | null>(null);
  const target = document.body.appendChild(document.createElement("div"));
  const lane = mount(TakeTimingLane, {
    target,
    props: {
      get timing() {
        return timing;
      },
      get resolved() {
        return resolved;
      },
      durationSeconds: initial.sections[initial.sections.length - 1]!.endSeconds,
      mediaSeconds,
      movesPerPass: moveBeats.length,
      windowSeconds: 8,
      editable: true,
      get selected() {
        return selected;
      },
      onseek: () => {},
      onselect: (landing: LandingRef | null) => {
        selected = landing;
      },
      onplace: (landing: LandingRef, seconds: number) => {
        timing = placeTakeLanding(
          timing,
          landing.sectionId,
          landing.position,
          seconds,
          moveBeats
        );
        resolved = resolveTakeTiming(timing, moveBeats);
      },
      dragRange: (landing: LandingRef) =>
        takeLandingDragRange(
          timing,
          landing.sectionId,
          landing.position,
          moveBeats
        ),
    },
  });
  flushSync();
  const labelsOf = (selector: string) =>
    [...target.querySelectorAll(selector)].map(
      (button) => button.getAttribute("aria-label") ?? ""
    );
  return {
    /** Every landing button's accessible name, in lane order. */
    labels: () => labelsOf("button.landing"),
    /** The accessible names of the landings placed by hand. */
    pinnedLabels: () => labelsOf("button.landing.pinned"),
    destroy: () => {
      unmount(lane);
      target.remove();
    },
  };
}

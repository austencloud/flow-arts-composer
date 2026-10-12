/**
 * A figure that builds itself: a short list of beats (pause, change some
 * state, tween a value from 0 to 1) played once, in order. The Guide front
 * page's hero and the Hand Motions motion map use it. Reduced motion skips
 * straight to the finished picture. cancel() stops a build nobody wants any
 * more (the learner grabbed the hand, the figure unmounted); playing again
 * replaces the running build.
 */
import { reducedMotion } from "./motion.js";

/** Pause between beats, long enough to read each one. */
export const BUILD_BEAT_PAUSE_MS = 650;

export type BuildBeat =
  | { pause: number }
  | { act: () => void }
  | { tween: number; step: (t: number) => void };

export interface BuildSequence {
  play(beats: readonly BuildBeat[], finish: () => void): void;
  cancel(): void;
}

export function createBuildSequence(): BuildSequence {
  let run = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;

  function cancel(): void {
    run += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function play(beats: readonly BuildBeat[], finish: () => void): void {
    cancel();
    if (reducedMotion()) {
      finish();
      return;
    }
    const current = run;
    let index = 0;

    const next = (): void => {
      if (current !== run) return;
      const beat = beats[index++];
      if (!beat) {
        finish();
        return;
      }
      if ("act" in beat) {
        beat.act();
        next();
        return;
      }
      if ("pause" in beat) {
        timer = setTimeout(next, beat.pause);
        return;
      }
      let startedAt: number | null = null;
      const tick = (now: number) => {
        if (current !== run) return;
        startedAt ??= now;
        const t = Math.min(1, (now - startedAt) / beat.tween);
        beat.step(t);
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        } else {
          frame = 0;
          next();
        }
      };
      frame = requestAnimationFrame(tick);
    };

    next();
  }

  return { play, cancel };
}

/** Calls start once, the first time the element is on screen. */
export function whenOnScreen(
  element: Element,
  start: () => void,
  threshold = 0.6
): () => void {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      start();
    },
    { threshold }
  );
  observer.observe(element);
  return () => observer.disconnect();
}

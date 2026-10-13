/**
 * shape-matrix-reveal — the Surprise choreography.
 *
 * A roll changes three things at once: the 4×4 grid, one crossing in it, and
 * the hand relationship that animates it. Shown all at once the result is
 * unreadable. The reveal explains the roll in the order it was made:
 *
 *   rows land → columns land → the crossings appear → one crossing is chosen
 *   → its mandala takes the stage → the relationship lands and plays.
 *
 * Every step is a Web Animations call on elements that already hold their
 * final state, so the page is correct at every frame and nothing needs to be
 * undone when the run ends. Reduced motion skips the whole schedule: the
 * final state is already on screen and the recipe bar announces the draw.
 */

import { EASE_STANDARD } from "@austencloud/motion";
import { motionDuration } from "#lib/shared/transitions/motion.js";
import { DURATION, STAGGER } from "#lib/shared/transitions/transitions.js";

export interface RevealBeat {
  /** Delay from the roll, in milliseconds. */
  at: number;
  duration: number;
  /** Extra delay per item, for the four headers of an axis. */
  stagger: number;
}

export const SHAPE_MATRIX_REVEAL: Record<
  "rows" | "columns" | "crossings" | "chosen" | "relationship" | "hero",
  RevealBeat
> = {
  rows: { at: 0, duration: DURATION.emphasis, stagger: STAGGER.normal },
  columns: {
    at: DURATION.normal + STAGGER.normal,
    duration: DURATION.emphasis,
    stagger: STAGGER.normal,
  },
  crossings: {
    at: DURATION.emphasis + DURATION.normal,
    duration: DURATION.dramatic,
    stagger: 0,
  },
  chosen: {
    at: DURATION.scene,
    duration: DURATION.dramatic + DURATION.fast,
    stagger: 0,
  },
  relationship: {
    at: DURATION.scene + DURATION.normal,
    duration: DURATION.dramatic,
    stagger: 0,
  },
  hero: {
    at: DURATION.scene + DURATION.normal,
    duration: DURATION.dramatic + DURATION.instant,
    stagger: 0,
  },
};

/** How long the chosen crossing and its headers keep their highlight class. */
export const SHAPE_MATRIX_REVEAL_HOLD_MS = DURATION.scene * 2;
export const SHAPE_MATRIX_REVEAL_CHOSEN_CLASS = "reveal-chosen";

export interface RevealAnimator {
  animate: (
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) => void;
  reducedMotion: () => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

function defaultAnimator(): RevealAnimator {
  return {
    animate: (element, keyframes, options) => {
      if (typeof (element as HTMLElement).animate !== "function") return;
      (element as HTMLElement).animate(keyframes, options);
    },
    reducedMotion: () =>
      typeof window !== "undefined" &&
      ((typeof document !== "undefined" &&
        document.documentElement.dataset.motionPreference === "reduce") ||
        (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ??
          false)),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
  };
}

function staggered(
  animator: RevealAnimator,
  elements: Element[],
  beat: RevealBeat,
  keyframes: Keyframe[]
): void {
  elements.forEach((element, index) => {
    animator.animate(element, keyframes, {
      delay: beat.at + index * beat.stagger,
      duration: motionDuration(beat.duration),
      easing: EASE_STANDARD,
      fill: "backwards",
    });
  });
}

/**
 * Run the grid half of the reveal inside the grid's own host: the row
 * headers, the column headers, the interior, then the chosen crossing with
 * the two headers that name it.
 */
export function runShapeMatrixGridReveal(
  host: ParentNode,
  animator: RevealAnimator = defaultAnimator()
): void {
  if (animator.reducedMotion()) return;

  const rowHeads = [...host.querySelectorAll(".rowhead")];
  const colHeads = [...host.querySelectorAll(".colhead")];
  const cells = [...host.querySelectorAll(".cell")];

  staggered(animator, rowHeads, SHAPE_MATRIX_REVEAL.rows, [
    { opacity: 0, transform: "translateX(-0.4rem)" },
    { opacity: 1, transform: "translateX(0)" },
  ]);
  staggered(animator, colHeads, SHAPE_MATRIX_REVEAL.columns, [
    { opacity: 0, transform: "translateY(-0.4rem)" },
    { opacity: 1, transform: "translateY(0)" },
  ]);
  // One stable surface, not a slot-machine waterfall.
  staggered(animator, cells, SHAPE_MATRIX_REVEAL.crossings, [
    { opacity: 0.12 },
    { opacity: 1 },
  ]);

  const chosen = host.querySelector(".cell.sel");
  if (!chosen) return;
  const row = chosen.closest("tr");
  const rowHead = row?.querySelector(".rowhead") ?? null;
  const columnIndex = row
    ? [...row.querySelectorAll(".cell")].indexOf(chosen)
    : -1;
  const colHead = columnIndex >= 0 ? (colHeads[columnIndex] ?? null) : null;

  const targets = [chosen, rowHead, colHead].filter(
    (element): element is Element => element !== null
  );
  animator.setTimeout(() => {
    for (const element of targets) {
      element.classList.add(SHAPE_MATRIX_REVEAL_CHOSEN_CLASS);
    }
    animator.setTimeout(() => {
      for (const element of targets) {
        element.classList.remove(SHAPE_MATRIX_REVEAL_CHOSEN_CLASS);
      }
    }, SHAPE_MATRIX_REVEAL_HOLD_MS);
  }, SHAPE_MATRIX_REVEAL.chosen.at);
  animator.animate(
    chosen,
    [
      { transform: "scale(1)" },
      { transform: "scale(1.12)", offset: 0.35 },
      { transform: "scale(1)" },
    ],
    {
      delay: SHAPE_MATRIX_REVEAL.chosen.at,
      duration: motionDuration(SHAPE_MATRIX_REVEAL.chosen.duration),
      easing: EASE_STANDARD,
    }
  );
}

/**
 * Run the result half: the chosen relationship chip lands, then the hero
 * stage breathes in behind it. A compact layout runs the tile-to-hero morph
 * instead, so the caller decides whether the hero beat applies.
 */
export function runShapeMatrixDetailReveal(
  host: ParentNode,
  options: { hero?: boolean } = {},
  animator: RevealAnimator = defaultAnimator()
): void {
  if (animator.reducedMotion()) return;

  const chip = host.querySelector(
    'button.relationship-choice[aria-pressed="true"]'
  );
  if (chip) {
    animator.animate(
      chip,
      [
        { transform: "scale(1)" },
        { transform: "scale(1.08)", offset: 0.4 },
        { transform: "scale(1)" },
      ],
      {
        delay: SHAPE_MATRIX_REVEAL.relationship.at,
        duration: motionDuration(SHAPE_MATRIX_REVEAL.relationship.duration),
        easing: EASE_STANDARD,
      }
    );
  }

  if (options.hero === false) return;
  const hero = host.querySelector(".hero-frame");
  if (!hero) return;
  animator.animate(
    hero,
    [
      { opacity: 0.35, transform: "scale(0.965)" },
      { opacity: 1, transform: "scale(1)" },
    ],
    {
      delay: SHAPE_MATRIX_REVEAL.hero.at,
      duration: motionDuration(SHAPE_MATRIX_REVEAL.hero.duration),
      easing: EASE_STANDARD,
      fill: "backwards",
    }
  );
}

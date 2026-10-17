/**
 * The seam for "a course-map card grows into its lesson, and back".
 *
 * Opening a lesson from the course map used to swap the whole screen in one
 * frame (Austen, 2026-10-16: the thing you are looking at should morph into
 * the next thing you look at). Wrapping the swap in `startMorph` lets the
 * browser carry the tapped card into the lesson: the card box grows into the
 * lesson surface, its picture into the lesson's board and its name into the
 * lesson title, while the rest of the map fades. Back runs the same names the
 * other way.
 *
 * The names are claimed only while a morph runs. `LessonStageFrame` always
 * holds `learn-grid-stage`; the card, surface and title names stay off
 * otherwise, so the lesson's own view transitions (the Hand Motions grid
 * split) never capture the whole lesson.
 *
 * Review and Steps swap one lesson's two views the same way: the title and
 * lead line claim names only while that swap runs.
 *
 * Continue and Previous swap one lesson for the next inside the same view.
 * The live board flies itself there (live-lesson-board), so that morph keeps
 * `learn-grid-stage` off and carries only the heading and the controls, which
 * would otherwise cut from one lesson's words to the next.
 */
import { flushSync } from "svelte";
import { startMorph } from "#lib/shared/transitions/results-morph.js";
import { loadConceptExperience } from "../domain/concept-experience-registry";

interface LessonMorphSource {
  conceptId: string;
  /** The map shows the recommended lesson twice; null means either card. */
  prominent: boolean | null;
}

// Raw, so `morphing === source` compares the object run() was handed rather
// than a deep-state proxy of it.
let morphing = $state.raw<LessonMorphSource | null>(null);
/** The card the learner opened, so Back returns to that same card. */
let openedFrom: LessonMorphSource | null = null;

/** True for the card (hero or list) carrying the running morph. */
export function isLessonMorphCard(conceptId: string, prominent: boolean) {
  const source = morphing;
  return (
    source !== null &&
    source.conceptId === conceptId &&
    (source.prominent === null || source.prominent === prominent)
  );
}

export function isLessonMorphRunning() {
  return morphing !== null;
}

function run(source: LessonMorphSource, mutate: () => void) {
  morphing = source;
  // The tapped card must carry its names before the browser captures the map.
  flushSync();
  const transition = startMorph(mutate);
  if (!transition) {
    morphing = null;
    return;
  }
  void transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (morphing === source) morphing = null;
    });
}

/** The card itself says which copy was tapped, before the map hands on. */
let tapped: LessonMorphSource | null = null;
export function noteLessonCardTap(conceptId: string, prominent: boolean) {
  tapped = { conceptId, prominent };
}

/** A lesson was chosen: grow its card into it once the lesson's code is in. */
export function openLessonWithMorph(conceptId: string, mutate: () => void) {
  const source =
    tapped?.conceptId === conceptId ? tapped : { conceptId, prominent: null };
  tapped = null;
  openedFrom = source;
  // The lesson must mount inside the morph, not show "loading" there.
  void loadConceptExperience(conceptId)
    .catch(() => undefined)
    .then(() => run(source, mutate));
}

/** Back to the map: the lesson shrinks into its card. */
export function closeLessonWithMorph(conceptId: string, mutate: () => void) {
  const source =
    openedFrom?.conceptId === conceptId
      ? openedFrom
      : { conceptId, prominent: null };
  openedFrom = null;
  run(source, mutate);
}

let continuing = $state(false);

/** True while Continue or Previous hands one lesson to the next. */
export function isLessonContinueRunning() {
  return continuing;
}

/** Continue or Previous: the heading and controls turn into the next lesson's. */
export function continueLessonWithMorph(conceptId: string, mutate: () => void) {
  void loadConceptExperience(conceptId)
    .catch(() => undefined)
    .then(() => {
      continuing = true;
      // The board's name must be off before the browser captures the lesson.
      flushSync();
      const transition = startMorph(mutate);
      if (!transition) {
        continuing = false;
        return;
      }
      void transition.finished
        .catch(() => undefined)
        .finally(() => (continuing = false));
    });
}

let switchingView = $state(false);

/** True while Review or Steps swaps a lesson's two views. */
export function isLessonViewSwitchRunning() {
  return switchingView;
}

/**
 * Review and Steps swap the same lesson's two views. While the swap runs, the
 * lesson's title and lead line carry to the review's first section and back,
 * the board flies into its first picture, and the review's cards fade.
 */
export function switchLessonViewWithMorph(mutate: () => void) {
  switchingView = true;
  // The step view's title and lead must carry names before the capture.
  flushSync();
  const transition = startMorph(mutate);
  if (!transition) {
    switchingView = false;
    return;
  }
  void transition.finished
    .catch(() => undefined)
    .finally(() => (switchingView = false));
}

/** Warm a lesson's code ahead of the tap (hover, focus, press). */
export function warmLesson(conceptId: string) {
  void loadConceptExperience(conceptId).catch(() => undefined);
}

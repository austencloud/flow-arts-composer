/**
 * The pace of the LOOP tab's own performance. Screen changes (panels, menus,
 * the card rearranging) run on the app's shared motion clock; these are the
 * beats of the lesson, slow enough to be followed by someone seeing a LOOP for
 * the first time. All in milliseconds.
 */

/** The pause on the finished steps before the first copy leaves. */
export const COPY_LEAD_MS = 500;
/** One row of copies travelling down to the next. */
export const COPY_FLIGHT_MS = 900;
/** The breath between one landed row and the next departure. */
export const COPY_REST_MS = 120;
/** The breath between the last landed row and the performance. */
export const COPIES_DONE_MS = 250;
/** The finished card emptying before it is performed. */
export const PERFORM_CLEAR_MS = 450;
/** One step of the performance, and the moving part of it. */
export const PERFORM_STEP_MS = 720;
export const PERFORM_MOVE_MS = 620;
/** How early a step's props appear, so they seem to carry on from the last. */
export const PERFORM_LEAD_MS = 160;
/** The explainer rests on its finished card before it starts over. */
export const EXPLAINER_REST_MS = 1800;
/** The explainer's highlight on the start and the matching end. */
export const EXPLAINER_MATCH_MS = 2000;
/** The explainer's first breath, before its first step. */
export const LESSON_OPENING_MS = 700;
/** How long each line stays up when nothing moves. */
export const EXPLAINER_LINE_MS = 2800;

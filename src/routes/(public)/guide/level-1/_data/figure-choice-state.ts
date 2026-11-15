/**
 * The "which one?" question under a row of figure cards (figureChoice block),
 * as a pure state machine so its rules are tested without a browser.
 *
 *   waiting    the row's opening play is running; both buttons locked.
 *   open       the reader may answer; a button already marked wrong stays
 *              locked.
 *   replaying  a wrong answer replays the row; every button locked.
 *   answered   the right answer: the real titles and the answer's words show.
 *
 * The answer lasts for the visit (`rememberChoice` / `recallChoice`), so coming
 * back to the screen shows it answered with no second quiz and no second
 * opening play.
 */

export type FigureChoicePhase = "waiting" | "open" | "replaying" | "answered";

export interface FigureChoiceState {
  phase: FigureChoicePhase;
  /** Indexes answered wrong, still marked. */
  wrong: readonly number[];
  /** The opening play has run (or was skipped); it never runs twice. */
  played: boolean;
}

export type FigureChoiceEvent =
  | { type: "openingDone" }
  | { type: "choose"; index: number; answer: number }
  | { type: "replayDone" };

/** Where a visit starts: under reduced motion the buttons open at once. */
export function initialChoiceState(reducedMotion: boolean): FigureChoiceState {
  return reducedMotion
    ? { phase: "open", wrong: [], played: true }
    : { phase: "waiting", wrong: [], played: false };
}

export function choiceReducer(
  state: FigureChoiceState,
  event: FigureChoiceEvent
): FigureChoiceState {
  switch (event.type) {
    case "openingDone":
      return state.phase === "waiting"
        ? { ...state, phase: "open", played: true }
        : { ...state, played: true };
    case "choose":
      if (!isChoiceEnabled(state, event.index)) return state;
      if (event.index === event.answer) return { ...state, phase: "answered" };
      return {
        ...state,
        phase: "replaying",
        wrong: [...state.wrong, event.index],
      };
    case "replayDone":
      return state.phase === "replaying" ? { ...state, phase: "open" } : state;
  }
}

export function isChoiceEnabled(
  state: FigureChoiceState,
  index: number
): boolean {
  return state.phase === "open" && !state.wrong.includes(index);
}

// The visit's answers, by block id. Module state: it lasts until the page
// reloads, which is what "for the visit" means here.
const visit = new Map<string, FigureChoiceState>();

export function rememberChoice(id: string, state: FigureChoiceState): void {
  visit.set(id, state);
}

/** The state to show on arriving at the question. A replay in progress when
 * the reader left counts as done: the buttons open again. */
export function recallChoice(
  id: string,
  reducedMotion: boolean
): FigureChoiceState {
  const seen = visit.get(id);
  if (!seen) return initialChoiceState(reducedMotion);
  if (seen.phase === "answered") return seen;
  return { ...seen, phase: "open", played: true };
}

/** For tests: forget the visit. */
export function forgetChoices(): void {
  visit.clear();
}

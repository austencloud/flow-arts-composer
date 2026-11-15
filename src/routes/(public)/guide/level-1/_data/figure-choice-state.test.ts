import { beforeEach, describe, expect, it } from "vitest";
import {
  choiceReducer,
  forgetChoices,
  initialChoiceState,
  isChoiceEnabled,
  recallChoice,
  rememberChoice,
  type FigureChoiceEvent,
  type FigureChoiceState,
} from "./figure-choice-state";

const A = 0;
const B = 1;
const run = (state: FigureChoiceState, ...events: FigureChoiceEvent[]) =>
  events.reduce(choiceReducer, state);
const choose = (index: number): FigureChoiceEvent => ({ type: "choose", index, answer: A });

describe("the opener's question", () => {
  beforeEach(() => forgetChoices());

  it("keeps both buttons locked until the opening play finishes", () => {
    const s = initialChoiceState(false);
    expect([isChoiceEnabled(s, A), isChoiceEnabled(s, B)]).toEqual([false, false]);
    // A tap before then does nothing.
    expect(run(s, choose(A)).phase).toBe("waiting");
    const open = run(s, { type: "openingDone" });
    expect([isChoiceEnabled(open, A), isChoiceEnabled(open, B)]).toEqual([true, true]);
  });

  it("opens at once under reduced motion", () => {
    expect(initialChoiceState(true).phase).toBe("open");
  });

  it("answers right first", () => {
    const s = run(initialChoiceState(false), { type: "openingDone" }, choose(A));
    expect(s.phase).toBe("answered");
    expect(s.wrong).toEqual([]);
  });

  it("goes wrong, locks both while the row replays, then opens only the right one", () => {
    const wrong = run(initialChoiceState(false), { type: "openingDone" }, choose(B));
    expect(wrong.phase).toBe("replaying");
    expect(wrong.wrong).toEqual([B]);
    expect([isChoiceEnabled(wrong, A), isChoiceEnabled(wrong, B)]).toEqual([false, false]);
    // Locked means locked: a tap during the replay changes nothing.
    expect(run(wrong, choose(A))).toEqual(wrong);
    const again = run(wrong, { type: "replayDone" });
    expect([isChoiceEnabled(again, A), isChoiceEnabled(again, B)]).toEqual([true, false]);
    const right = run(again, choose(A));
    expect(right.phase).toBe("answered");
    // B stays marked wrong after the right answer.
    expect(right.wrong).toEqual([B]);
  });

  it("keeps the answer for the visit, with no second opening play", () => {
    const answered = run(initialChoiceState(false), { type: "openingDone" }, choose(A));
    rememberChoice("opener", answered);
    const back = recallChoice("opener", false);
    expect(back.phase).toBe("answered");
    expect(back.played).toBe(true);
  });

  it("comes back open, not mid-replay, when left during a replay", () => {
    const wrong = run(initialChoiceState(false), { type: "openingDone" }, choose(B));
    rememberChoice("opener", wrong);
    const back = recallChoice("opener", false);
    expect(back.phase).toBe("open");
    expect(back.wrong).toEqual([B]);
    expect(back.played).toBe(true);
  });

  it("starts fresh on a first arrival", () => {
    expect(recallChoice("never-seen", false)).toEqual(initialChoiceState(false));
  });
});

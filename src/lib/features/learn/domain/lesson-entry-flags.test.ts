import { describe, expect, it, vi } from "vitest";
import { applyLessonEntryFlags } from "./lesson-entry-flags";

const SITE = "https://tkaflowarts.com";

function fakePersistence() {
  return {
    reset: vi.fn(),
    saveStep: vi.fn(),
    savePhaseData: vi.fn(),
  };
}

describe("applyLessonEntryFlags", () => {
  it("opens a named stage: writes its step and schema, touches nothing else", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=two-hands`),
      () => persistence
    );
    expect(persistence.reset).not.toHaveBeenCalled();
    expect(persistence.saveStep).toHaveBeenCalledWith(3);
    expect(persistence.savePhaseData).toHaveBeenCalledWith(
      "stageSchemaVersion",
      4
    );
  });

  it("resets first, then opens the stage, when both flags are present", () => {
    const persistence = fakePersistence();
    const order: string[] = [];
    persistence.reset.mockImplementation(() => order.push("reset"));
    persistence.saveStep.mockImplementation(() => order.push("step"));
    applyLessonEntryFlags(
      new URL(
        `${SITE}/learn/concepts/hand-motions-intro?from-start&stage=quiz`
      ),
      () => persistence
    );
    expect(order).toEqual(["reset", "step"]);
    expect(persistence.saveStep).toHaveBeenCalledWith(4);
  });

  it("ignores an unknown stage name and a lesson without stages", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=nope`),
      () => persistence
    );
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/grid?stage=map`),
      () => persistence
    );
    expect(persistence.saveStep).not.toHaveBeenCalled();
    expect(persistence.savePhaseData).not.toHaveBeenCalled();
  });

  it("a plain restart still resets", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/grid?from-start`),
      () => persistence
    );
    expect(persistence.reset).toHaveBeenCalledTimes(1);
  });
});

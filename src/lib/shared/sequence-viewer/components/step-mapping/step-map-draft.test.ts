import { beforeEach, describe, expect, it } from "vitest";
import {
  clearStepMapDraft,
  loadStepMapDraft,
  saveStepMapDraft,
  stepMapDraftStorageKey,
} from "./step-map-draft";

beforeEach(() => localStorage.clear());

const draft = {
  marks: [0.4, 1.9, 3.2],
  passes: 1,
  mode: "mark" as const,
  selectedMark: 2,
  currentTime: 3.2,
};

describe("step map draft", () => {
  it("round-trips an in-progress run under its key", () => {
    saveStepMapDraft("seq:vid", draft);
    expect(loadStepMapDraft("seq:vid")).toMatchObject(draft);
  });

  it("keeps drafts for different keys apart", () => {
    saveStepMapDraft("a", draft);
    expect(loadStepMapDraft("b")).toBeNull();
  });

  it("forgets the draft once it is cleared", () => {
    saveStepMapDraft("seq:vid", draft);
    clearStepMapDraft("seq:vid");
    expect(loadStepMapDraft("seq:vid")).toBeNull();
    expect(localStorage.getItem(stepMapDraftStorageKey("seq:vid"))).toBeNull();
  });

  it("saving an empty, untouched run clears rather than stores", () => {
    saveStepMapDraft("seq:vid", draft);
    saveStepMapDraft("seq:vid", { ...draft, marks: [], selectedMark: 0 });
    expect(loadStepMapDraft("seq:vid")).toBeNull();
  });

  it("ignores garbage and malformed entries", () => {
    localStorage.setItem(stepMapDraftStorageKey("x"), "{not json");
    expect(loadStepMapDraft("x")).toBeNull();
    localStorage.setItem(
      stepMapDraftStorageKey("y"),
      JSON.stringify({ marks: ["a"], passes: 1, mode: "mark" })
    );
    expect(loadStepMapDraft("y")).toBeNull();
  });
});

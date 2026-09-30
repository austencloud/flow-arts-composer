import { describe, expect, it } from "vitest";
import {
  isAutoSequenceName,
  resolveSequenceIdentityTitle,
} from "./viewer-title";

describe("isAutoSequenceName", () => {
  it.each([
    "Assemble Sequence",
    "Shared Sequence",
    "Sequence",
    "  Assemble Sequence  ",
    "Sequence 2:21:45 PM",
    "Sequence 14:21:45",
    // Current engines put a narrow no-break space before PM.
    "Sequence 2:21:45 PM",
  ])("treats %j as a placeholder", (name) => {
    expect(isAutoSequenceName(name)).toBe(true);
  });

  it.each(["My Cool Combo", "Sequence Length", "Sequence 8 beats", "", "   "])(
    "keeps %j as a real name",
    (name) => {
      expect(isAutoSequenceName(name)).toBe(false);
    }
  );
});

describe("resolveSequenceIdentityTitle", () => {
  it("shows the word when the sequence has letters", () => {
    expect(
      resolveSequenceIdentityTitle({
        word: "ABC",
        name: "Assemble Sequence",
      })
    ).toBe("ABC");
  });

  it("returns empty for a letterless Assemble sequence, never the placeholder", () => {
    expect(
      resolveSequenceIdentityTitle({ word: "", name: "Assemble Sequence" })
    ).toBe("");
  });

  it("returns empty for a letterless Construct sequence stamped with the clock", () => {
    expect(
      resolveSequenceIdentityTitle({ word: "", name: "Sequence 2:21:45 PM" })
    ).toBe("");
  });

  it("falls back to the display name, then a real name, for a letterless sequence", () => {
    expect(
      resolveSequenceIdentityTitle({
        word: "",
        displayName: "Sunday Flow",
        name: "Assemble Sequence",
      })
    ).toBe("Sunday Flow");
    expect(
      resolveSequenceIdentityTitle({ word: "", name: "Sunday Flow" })
    ).toBe("Sunday Flow");
  });

  it("skips a placeholder display name in favor of a real name", () => {
    expect(
      resolveSequenceIdentityTitle({
        word: "",
        displayName: "Assemble Sequence",
        name: "Sunday Flow",
      })
    ).toBe("Sunday Flow");
  });
});

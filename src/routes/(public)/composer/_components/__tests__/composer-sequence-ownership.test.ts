import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  carryPageSequence,
  featuredCaption,
  openingPageSequence,
  shouldAdoptCarriedSequence,
} from "../composer-sequence-ownership";

function seq(id: string): SequenceData {
  return { id, name: id, word: id, steps: [] } as unknown as SequenceData;
}

describe("page sequence", () => {
  it("opens on the baked opening with source opening", () => {
    const state = openingPageSequence(seq("opening"));
    expect(state.sequence.id).toBe("opening");
    expect(state.source).toBe("opening");
  });

  it("last write wins across every source", () => {
    let state = openingPageSequence(seq("opening"));
    state = carryPageSequence(state, "hero", seq("hero-1"));
    expect(state).toEqual({ sequence: seq("hero-1"), source: "hero" });
    state = carryPageSequence(state, "construct", seq("built"));
    expect(state).toEqual({ sequence: seq("built"), source: "construct" });
    state = carryPageSequence(state, "generate", seq("drawn"));
    expect(state).toEqual({ sequence: seq("drawn"), source: "generate" });
    state = carryPageSequence(state, "tunnel", seq("tunnel-draw"));
    expect(state).toEqual({ sequence: seq("tunnel-draw"), source: "tunnel" });
    state = carryPageSequence(state, "hero", seq("hero-2"));
    expect(state).toEqual({ sequence: seq("hero-2"), source: "hero" });
  });

  it("ignores a missing sequence", () => {
    const state = openingPageSequence(seq("opening"));
    expect(carryPageSequence(state, "generate", null)).toBe(state);
    expect(carryPageSequence(state, "generate", undefined)).toBe(state);
  });

  it("returns the same state for the same id from the same source", () => {
    const state = carryPageSequence(
      openingPageSequence(seq("opening")),
      "hero",
      seq("hero-1")
    );
    expect(carryPageSequence(state, "hero", seq("hero-1"))).toBe(state);
  });

  it("captions the featured card by origin", () => {
    expect(featuredCaption("opening")).toBe("The sequence playing above.");
    expect(featuredCaption("hero")).toBe("The sequence playing above.");
    expect(featuredCaption("construct")).toBe("The sequence you built.");
    expect(featuredCaption("generate")).toBe("The sequence you generated.");
    expect(featuredCaption("tunnel")).toBe("The sequence you generated.");
  });
});

describe("shouldAdoptCarriedSequence", () => {
  it("adopts a different sequence while in view", () => {
    expect(shouldAdoptCarriedSequence(seq("a"), seq("b"), true)).toBe(true);
    expect(shouldAdoptCarriedSequence(null, seq("b"), true)).toBe(true);
  });

  it("does not adopt its own sequence, out of view, or nothing", () => {
    expect(shouldAdoptCarriedSequence(seq("a"), seq("a"), true)).toBe(false);
    expect(shouldAdoptCarriedSequence(seq("a"), seq("b"), false)).toBe(false);
    expect(shouldAdoptCarriedSequence(seq("a"), null, true)).toBe(false);
  });
});

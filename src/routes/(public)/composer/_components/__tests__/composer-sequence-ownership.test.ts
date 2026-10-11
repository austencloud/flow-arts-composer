import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
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

  it("a new draw from the same source replaces the old one", () => {
    const first = seq("hero-1");
    const second = seq("hero-2");
    let state = carryPageSequence(
      openingPageSequence(seq("opening")),
      "hero",
      first
    );
    state = carryPageSequence(state, "hero", second);
    expect(state.sequence).toBe(second);
    expect(state.source).toBe("hero");
    const drawn = seq("drawn-2");
    state = carryPageSequence(
      carryPageSequence(state, "generate", seq("drawn-1")),
      "generate",
      drawn
    );
    expect(state.sequence).toBe(drawn);
    expect(state.source).toBe("generate");
  });

  it("the same sequence from a new source changes the source", () => {
    const shared = seq("shared");
    const generated = carryPageSequence(
      openingPageSequence(seq("opening")),
      "generate",
      shared
    );
    const carried = carryPageSequence(generated, "tunnel", shared);
    expect(carried).not.toBe(generated);
    expect(carried.source).toBe("tunnel");
    expect(carried.sequence).toBe(shared);
  });

  it("carries the exact object it is given", () => {
    const built = seq("built");
    const state = carryPageSequence(
      openingPageSequence(seq("opening")),
      "construct",
      built
    );
    expect(state.sequence).toBe(built);
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

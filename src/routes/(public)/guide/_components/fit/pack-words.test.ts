import { describe, expect, it } from "vitest";
import { captionLabel, packPieces, type PackPiece } from "./pack-words";

const piece = (id: string, cost: number, leads = false): PackPiece<string> => ({
  piece: id,
  cost,
  leads,
});

describe("packPieces", () => {
  it("keeps everything together when it fits", () => {
    expect(packPieces([piece("a", 50), piece("b", 50)], 100)).toEqual([["a", "b"]]);
  });
  it("splits about evenly rather than leaving a stub", () => {
    const parts = packPieces(
      ["a", "b", "c", "d", "e", "f"].map((id) => piece(id, 50)),
      200
    );
    expect(parts).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });
  it("carries a heading on with the words it opens", () => {
    const parts = packPieces(
      [piece("a", 90), piece("head", 30, true), piece("b", 90)],
      120
    );
    expect(parts).toEqual([["a"], ["head", "b"]]);
  });
  it("gives a piece over the budget a part of its own", () => {
    expect(packPieces([piece("a", 500), piece("b", 100)], 200)).toEqual([["a"], ["b"]]);
  });
});

describe("captionLabel", () => {
  it("takes the plain part before a colon, without a closing aside", () => {
    expect(captionLabel("Quarter-Opp: the arms cross")).toBe("Quarter-Opp");
    expect(captionLabel("AABB ×2 (reversals after 3 & 7)")).toBe("AABB ×2");
  });
  it("gives no label when no short name can be had", () => {
    expect(captionLabel(null)).toBeNull();
    expect(captionLabel("a caption that reads as a whole sentence and runs long")).toBeNull();
  });
});

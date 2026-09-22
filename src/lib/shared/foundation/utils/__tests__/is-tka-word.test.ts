import { describe, expect, it } from "vitest";
import { isTkaWord } from "../word-simplifier";

describe("isTkaWord", () => {
  it("accepts runs of canonical letters", () => {
    expect(isTkaWord("BBBA")).toBe(true);
    expect(isTkaWord("A")).toBe(true);
    expect(isTkaWord("ΩORZ")).toBe(true);
    expect(isTkaWord("FΨ")).toBe(true);
    expect(isTkaWord("αβγ")).toBe(true);
    expect(isTkaWord("⊕")).toBe(true);
  });

  it("accepts dash letters as single units", () => {
    expect(isTkaWord("W-")).toBe(true);
    expect(isTkaWord("AW-B")).toBe(true);
    expect(isTkaWord("Φ-Ψ-Λ-")).toBe(true);
    expect(isTkaWord("τ-")).toBe(true);
  });

  it("rejects names a person typed", () => {
    expect(isTkaWord("Sunrise")).toBe(false);
    expect(isTkaWord("Pinwheel")).toBe(false);
    expect(isTkaWord("Tunnel #3")).toBe(false);
    expect(isTkaWord("Untitled tunnel")).toBe(false);
  });

  it("rejects anything that is not one unbroken run of letters", () => {
    expect(isTkaWord("")).toBe(false);
    expect(isTkaWord("A B")).toBe(false);
    expect(isTkaWord("A!")).toBe(false);
    expect(isTkaWord("BBBA ")).toBe(false);
  });

  it("rejects lowercase Latin, which is what keeps prose out", () => {
    // Letter.ALPHA is "α", never "a" — membership is what does the work here,
    // not the tokenizer, which happily splits "abc" into three units.
    expect(isTkaWord("abc")).toBe(false);
    expect(isTkaWord("Mandala")).toBe(false);
  });

  it("rejects lowercase theta, which TKA never writes", () => {
    // Canon: theta is always uppercase Θ. The webfont cmaps uppercase Greek
    // only, so a lowercase θ would fall back to serif mid-word.
    expect(isTkaWord("Θ")).toBe(true);
    expect(isTkaWord("θ")).toBe(false);
  });

  it("accepts well-formed skew notation", () => {
    expect(isTkaWord("{US}")).toBe(true);
    expect(isTkaWord("A{STS}B")).toBe(true);
    expect(isTkaWord("{Σ-Δ-}ζ")).toBe(true);
  });

  it("rejects malformed skew notation", () => {
    expect(isTkaWord("{}")).toBe(false);
    expect(isTkaWord("{A}{B}")).toBe(false);
    expect(isTkaWord("{A")).toBe(false);
    expect(isTkaWord("A}")).toBe(false);
    expect(isTkaWord("{{A}}")).toBe(false);
    expect(isTkaWord("{A}-B")).toBe(false);
  });
});

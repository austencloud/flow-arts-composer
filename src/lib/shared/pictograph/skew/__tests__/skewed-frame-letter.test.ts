import { describe, expect, it } from "vitest";
import {
  classifySkewedFrameLetter,
  frameSpacing,
  isSkewedFramePair,
  SKEW_FRAME_LOCATIONS,
  SKEWED_FRAME_LETTERS,
  skewedFrameLetterLabel,
  type SkewFrameHand,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "../skewed-frame-letter";

const hand = (
  motionType: SkewFrameMotionType,
  startLocation: SkewFrameLocation,
  endLocation: SkewFrameLocation
): SkewFrameHand => ({ motionType, startLocation, endLocation });

describe("frame geometry", () => {
  it("tells mixed pairs from pure pairs", () => {
    expect(isSkewedFramePair("n", "ne")).toBe(true);
    expect(isSkewedFramePair("ne", "s")).toBe(true);
    expect(isSkewedFramePair("n", "s")).toBe(false);
    expect(isSkewedFramePair("ne", "sw")).toBe(false);
  });

  it("names the spacing", () => {
    expect(frameSpacing("n", "ne")).toBe("eta");
    expect(frameSpacing("nw", "n")).toBe("eta");
    expect(frameSpacing("n", "se")).toBe("zeta");
    expect(frameSpacing("sw", "n")).toBe("zeta");
    expect(frameSpacing("n", "e")).toBeNull();
  });
});

describe("classifySkewedFrameLetter", () => {
  it("returns null outside the skewed frame or for inconsistent motions", () => {
    expect(
      classifySkewedFrameLetter({ left: hand("pro", "n", "e"), right: hand("pro", "s", "w") })
    ).toBeNull();
    // A pro hand cannot travel 45°.
    expect(
      classifySkewedFrameLetter({ left: hand("pro", "n", "ne"), right: hand("static", "se", "se") })
    ).toBeNull();
    // A static hand cannot move.
    expect(
      classifySkewedFrameLetter({ left: hand("static", "n", "e"), right: hand("static", "ne", "ne") })
    ).toBeNull();
  });

  it.each<[string, SkewFrameHand, SkewFrameHand]>([
    // Type 1 same direction (blue n → e clockwise, red ne → se clockwise: eta→eta)
    ["S", hand("pro", "n", "e"), hand("pro", "ne", "se")],
    ["T", hand("anti", "n", "e"), hand("anti", "ne", "se")],
    ["U", hand("anti", "n", "e"), hand("pro", "ne", "se")], // red leads and is pro
    ["V", hand("pro", "n", "e"), hand("anti", "ne", "se")], // red leads and is anti
    // Type 1 opposite direction: hands that separate pass opposite (alpha),
    // hands that close pass together (beta), from either spacing.
    ["M", hand("pro", "n", "w"), hand("pro", "ne", "se")], // from eta
    ["N", hand("anti", "n", "w"), hand("anti", "ne", "se")],
    ["O", hand("pro", "n", "w"), hand("anti", "ne", "se")],
    ["M", hand("pro", "n", "w"), hand("pro", "se", "sw")], // from zeta
    ["N", hand("anti", "n", "w"), hand("anti", "se", "sw")],
    ["O", hand("anti", "n", "w"), hand("pro", "se", "sw")],
    ["P", hand("pro", "n", "e"), hand("pro", "ne", "nw")], // from eta
    ["Q", hand("anti", "n", "e"), hand("anti", "ne", "nw")],
    ["R", hand("anti", "n", "e"), hand("pro", "ne", "nw")],
    ["P", hand("pro", "n", "e"), hand("pro", "se", "ne")], // from zeta
    ["Q", hand("anti", "n", "e"), hand("anti", "se", "ne")],
    ["R", hand("pro", "n", "e"), hand("anti", "se", "ne")],
    // Type 2 shift + static
    ["W", hand("pro", "n", "w"), hand("static", "se", "se")], // zeta→zeta
    ["X", hand("anti", "n", "w"), hand("static", "se", "se")],
    ["Y", hand("pro", "n", "e"), hand("static", "ne", "ne")], // eta→eta
    ["Z", hand("anti", "n", "e"), hand("static", "ne", "ne")],
    ["Σ", hand("pro", "n", "e"), hand("static", "se", "se")], // zeta→eta
    ["Δ", hand("anti", "n", "e"), hand("static", "se", "se")],
    ["Θ", hand("pro", "n", "w"), hand("static", "ne", "ne")], // eta→zeta
    ["Ω", hand("anti", "n", "w"), hand("static", "ne", "ne")],
    // Type 3 shift + dash
    ["W-", hand("pro", "n", "e"), hand("dash", "ne", "sw")], // eta→zeta
    ["X-", hand("anti", "n", "e"), hand("dash", "ne", "sw")],
    ["Y-", hand("pro", "n", "w"), hand("dash", "se", "nw")], // zeta→eta
    ["Z-", hand("anti", "n", "w"), hand("dash", "se", "nw")],
    ["Σ-", hand("pro", "n", "w"), hand("dash", "ne", "sw")], // eta→eta
    ["Δ-", hand("anti", "n", "w"), hand("dash", "ne", "sw")],
    ["Θ-", hand("pro", "n", "e"), hand("dash", "se", "nw")], // zeta→zeta
    ["Ω-", hand("anti", "n", "e"), hand("dash", "se", "nw")],
    // Type 4 dash + static
    ["Φ", hand("dash", "n", "s"), hand("static", "ne", "ne")], // eta→zeta
    ["Ψ", hand("dash", "n", "s"), hand("static", "se", "se")], // zeta→eta
    // Type 5 dual dash
    ["Φ-", hand("dash", "n", "s"), hand("dash", "se", "nw")], // zeta→zeta
    ["Ψ-", hand("dash", "n", "s"), hand("dash", "ne", "sw")], // eta→eta
    // Type 6 static
    ["ζ", hand("static", "n", "n"), hand("static", "se", "se")],
    ["η", hand("static", "n", "n"), hand("static", "ne", "ne")],
  ])("letters %s", (letter, left, right) => {
    expect(classifySkewedFrameLetter({ left, right })).toBe(letter);
  });

  it("letters every one of the 1152 skewed-frame beats with exactly the 32 letters", () => {
    const options: Array<{ motionType: SkewFrameMotionType; steps: number }> = [
      { motionType: "pro", steps: 2 },
      { motionType: "pro", steps: -2 },
      { motionType: "anti", steps: 2 },
      { motionType: "anti", steps: -2 },
      { motionType: "static", steps: 0 },
      { motionType: "dash", steps: 4 },
    ];
    const move = (loc: SkewFrameLocation, steps: number): SkewFrameLocation => {
      const index = SKEW_FRAME_LOCATIONS.indexOf(loc);
      return SKEW_FRAME_LOCATIONS[(index + steps + 8) % 8]!;
    };
    const counts = new Map<string, number>();
    let beats = 0;
    for (const blue of SKEW_FRAME_LOCATIONS) {
      for (const red of SKEW_FRAME_LOCATIONS) {
        if (!isSkewedFramePair(blue, red)) continue;
        for (const b of options) {
          for (const r of options) {
            beats++;
            const letter = classifySkewedFrameLetter({
              left: hand(b.motionType, blue, move(blue, b.steps)),
              right: hand(r.motionType, red, move(red, r.steps)),
            });
            expect(letter, `${blue}/${b.motionType}/${b.steps} ${red}/${r.motionType}/${r.steps}`).not.toBeNull();
            counts.set(letter!, (counts.get(letter!) ?? 0) + 1);
          }
        }
      }
    }
    expect(beats).toBe(1152);
    expect([...counts.keys()].sort()).toEqual([...SKEWED_FRAME_LETTERS].sort());
    const expectedCounts: Record<string, number> = {
      S: 64, T: 64, U: 64, V: 64,
      M: 32, N: 32, O: 64, P: 32, Q: 32, R: 64,
      W: 32, X: 32, Y: 32, Z: 32, "Σ": 32, "Δ": 32, "Θ": 32, "Ω": 32,
      "W-": 32, "X-": 32, "Y-": 32, "Z-": 32, "Σ-": 32, "Δ-": 32, "Θ-": 32, "Ω-": 32,
      "Φ": 32, "Ψ": 32, "Φ-": 16, "Ψ-": 16, "ζ": 16, "η": 16,
    };
    expect(Object.fromEntries(counts)).toEqual(expectedCounts);
  });
});

describe("skewedFrameLetterLabel", () => {
  it.each<[string, SkewFrameHand, SkewFrameHand]>([
    // Numbered by start spacing: 1 from eta (45°), 2 from zeta (135°).
    ["S1", hand("pro", "n", "e"), hand("pro", "ne", "se")],
    ["S2", hand("pro", "n", "e"), hand("pro", "se", "sw")],
    ["V1", hand("pro", "n", "e"), hand("anti", "ne", "se")],
    ["M1", hand("pro", "n", "w"), hand("pro", "ne", "se")],
    ["M2", hand("pro", "n", "w"), hand("pro", "se", "sw")],
    ["R1", hand("anti", "n", "e"), hand("pro", "ne", "nw")],
    ["R2", hand("pro", "n", "e"), hand("anti", "se", "ne")],
    // One spacing only: plain.
    ["W", hand("pro", "n", "w"), hand("static", "se", "se")],
    ["Θ-", hand("pro", "n", "e"), hand("dash", "se", "nw")],
    ["Φ", hand("dash", "n", "s"), hand("static", "ne", "ne")],
    ["η", hand("static", "n", "n"), hand("static", "ne", "ne")],
  ])("labels %s", (label, left, right) => {
    expect(skewedFrameLetterLabel({ left, right })).toBe(label);
  });

  it("is null where the classifier is null", () => {
    expect(skewedFrameLetterLabel({ left: hand("pro", "n", "e"), right: hand("pro", "s", "w") })).toBeNull();
  });
});

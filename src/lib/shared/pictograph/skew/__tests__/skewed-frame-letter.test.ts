import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  classifySkewedFrameLetter,
  crossedPosition,
  frameSpacing,
  isSkewedFramePair,
  leadingHand,
  SKEW_FRAME_LOCATIONS,
  SKEWED_FRAME_LETTERS,
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

  it("finds the leader as the hand ahead by the smaller arc", () => {
    // Both travelling clockwise: red at ne is ahead of blue at n.
    expect(leadingHand("n", "ne", 90)).toBe("right");
    // Same hands travelling counter-clockwise: blue at n is ahead.
    expect(leadingHand("n", "ne", -90)).toBe("left");
    // Zeta spacing, clockwise: red at se (135° ahead) leads.
    expect(leadingHand("n", "se", 90)).toBe("right");
    expect(leadingHand("n", "se", -90)).toBe("left");
  });

  it("finds the crossed position for opposite travel", () => {
    // Blue n clockwise, red ne counter-clockwise: they converge through beta.
    expect(crossedPosition("n", "ne", 90)).toBe("beta");
    // Blue n counter-clockwise, red ne clockwise: they diverge through alpha.
    expect(crossedPosition("n", "ne", -90)).toBe("alpha");
    expect(crossedPosition("n", "se", 90)).toBe("beta");
    expect(crossedPosition("n", "se", -90)).toBe("alpha");
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
    // Type 1 opposite direction from eta (blue n, red ne)
    ["D", hand("pro", "n", "w"), hand("pro", "ne", "se")], // diverge: cross alpha
    ["E", hand("anti", "n", "w"), hand("anti", "ne", "se")],
    ["F", hand("pro", "n", "w"), hand("anti", "ne", "se")],
    ["P", hand("pro", "n", "e"), hand("pro", "ne", "nw")], // converge: cross beta
    ["Q", hand("anti", "n", "e"), hand("anti", "ne", "nw")],
    ["R", hand("anti", "n", "e"), hand("pro", "ne", "nw")],
    // Type 1 opposite direction from zeta (blue n, red se)
    ["J", hand("pro", "n", "e"), hand("pro", "se", "ne")], // converge: cross beta
    ["K", hand("anti", "n", "e"), hand("anti", "se", "ne")],
    ["L", hand("pro", "n", "e"), hand("anti", "se", "ne")],
    ["M", hand("pro", "n", "w"), hand("pro", "se", "sw")], // diverge: cross alpha
    ["N", hand("anti", "n", "w"), hand("anti", "se", "sw")],
    ["O", hand("anti", "n", "w"), hand("pro", "se", "sw")],
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

  it("letters every one of the 1152 skewed-frame beats with exactly the 38 letters", () => {
    const options: Array<{ motionType: SkewFrameMotionType; turn: number }> = [
      { motionType: "pro", turn: 2 },
      { motionType: "pro", turn: -2 },
      { motionType: "anti", turn: 2 },
      { motionType: "anti", turn: -2 },
      { motionType: "static", turn: 0 },
      { motionType: "dash", turn: 4 },
    ];
    const move = (loc: SkewFrameLocation, turn: number): SkewFrameLocation => {
      const index = SKEW_FRAME_LOCATIONS.indexOf(loc);
      return SKEW_FRAME_LOCATIONS[(index + turn + 8) % 8]!;
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
              left: hand(b.motionType, blue, move(blue, b.turn)),
              right: hand(r.motionType, red, move(red, r.turn)),
            });
            expect(letter, `${blue}/${b.motionType}/${b.turn} ${red}/${r.motionType}/${r.turn}`).not.toBeNull();
            counts.set(letter!, (counts.get(letter!) ?? 0) + 1);
          }
        }
      }
    }
    expect(beats).toBe(1152);
    expect([...counts.keys()].sort()).toEqual([...SKEWED_FRAME_LETTERS].sort());
    const expectedCounts: Record<string, number> = {
      S: 64, T: 64, U: 64, V: 64,
      D: 16, E: 16, F: 32, J: 16, K: 16, L: 32, M: 16, N: 16, O: 32, P: 16, Q: 16, R: 32,
      W: 32, X: 32, Y: 32, Z: 32, "Σ": 32, "Δ": 32, "Θ": 32, "Ω": 32,
      "W-": 32, "X-": 32, "Y-": 32, "Z-": 32, "Σ-": 32, "Δ-": 32, "Θ-": 32, "Ω-": 32,
      "Φ": 32, "Ψ": 32, "Φ-": 16, "Ψ-": 16, "ζ": 16, "η": 16,
    };
    expect(Object.fromEntries(counts)).toEqual(expectedCounts);
  });
});

describe("standard-frame cross-checks against DiamondPictographDataframe.csv", () => {
  const csvPath = resolve(__dirname, "../../../../../../static/data/pictographs/DiamondPictographDataframe.csv");
  const lines = readFileSync(csvPath, "utf8").split("\n").filter((line) => line.trim());
  const header = lines[0]!.split(",");
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, values[index]!.trim()]));
  });
  const turnOf = (start: string, end: string): 90 | -90 => {
    const delta =
      (SKEW_FRAME_LOCATIONS.indexOf(end as SkewFrameLocation) -
        SKEW_FRAME_LOCATIONS.indexOf(start as SkewFrameLocation) +
        8) %
      8;
    return delta === 2 ? 90 : -90;
  };

  it("U rows are led by the pro hand and V rows by the anti hand", () => {
    for (const row of rows.filter((r) => r.letter === "U" || r.letter === "V")) {
      const leader = leadingHand(
        row.blueStartLocation as SkewFrameLocation,
        row.redStartLocation as SkewFrameLocation,
        turnOf(row.blueStartLocation!, row.blueEndLocation!)
      );
      const leaderType = leader === "left" ? row.blueMotionType : row.redMotionType;
      expect(leaderType, JSON.stringify(row)).toBe(row.letter === "U" ? "pro" : "anti");
    }
  });

  it("M rows cross alpha and P rows cross beta", () => {
    for (const row of rows.filter((r) => r.letter === "M" || r.letter === "P")) {
      const crossed = crossedPosition(
        row.blueStartLocation as SkewFrameLocation,
        row.redStartLocation as SkewFrameLocation,
        turnOf(row.blueStartLocation!, row.blueEndLocation!)
      );
      expect(crossed, JSON.stringify(row)).toBe(row.letter === "M" ? "alpha" : "beta");
    }
  });
});

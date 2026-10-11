/**
 * Layer Signature Tests
 *
 * The load-bearing test here is the first one: it checks the layer rule against
 * the real end-orientation calculator across every motion type, turn value,
 * spin direction and starting orientation. If anyone ever changes how end
 * orientation is worked out, this fails immediately rather than quietly
 * producing wrong signatures.
 */

import { describe, it, expect } from "vitest";
import corpusFixture from "../fixtures/layer-signature-corpus.json";
// The app's own end-orientation calculation, checked against the layer rule
// that now lives in the engine. Two independent copies agreeing is the point:
// if the app's renderer and the engine's generator ever drift on what a turn
// does to an orientation, this test is where it surfaces.
import { calculateEndOrientation } from "#lib/shared/render/core/calculations/orientation.js";
import { RADIAL_CW_CYCLE } from "@tka/sequence-engine/core";
import { normalizeLegacySteps } from "@tka/tka-types";
import {
  applyFlip,
  collapseLayer,
  flipVectorOf,
  flipsLayer,
  formatPattern,
  formatSignature,
  isLayerClosed,
  layerClassDelta,
  layerMetrics,
  layerOf,
  layerPatternOf,
  layerSignature,
  mirrorPattern,
  orientationClass,
  parsePattern,
  signatureFromPattern,
  type LayerId,
  type LayerStepInput,
} from "#lib/shared/foundation/domain/layer-signature.js";

const MOTION_TYPES = ["pro", "anti", "static", "dash", "float"];
const TURN_VALUES = [
  0,
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  "fl",
] as const;
const HANDPATHS = {
  cw: ["s", "w"],
  ccw: ["w", "s"],
  dash: ["s", "n"],
  static: ["n", "n"],
} as const;

const motion = (
  motionType: string,
  turns: number | string,
  rotationDirection: string,
  startLocation: string,
  endLocation: string,
  startOrientation = "in"
) => ({
  motionType,
  turns,
  rotationDirection,
  startLocation,
  endLocation,
  startOrientation,
});

const step = (
  left: ReturnType<typeof motion>,
  right: ReturnType<typeof motion>
): LayerStepInput => ({
  motions: { left, right },
});

describe("layerClassDelta agrees with the end-orientation calculator", () => {
  it("predicts the class change for every motion the calculator accepts", () => {
    const disagreements: string[] = [];

    for (const startOrientation of RADIAL_CW_CYCLE) {
      for (const motionType of MOTION_TYPES) {
        for (const turns of TURN_VALUES) {
          for (const rotationDirection of ["cw", "ccw"]) {
            for (const [startLocation, endLocation] of Object.values(
              HANDPATHS
            )) {
              const input = {
                motionType,
                turns,
                rotationDirection,
                startLocation,
                endLocation,
                startOrientation,
              };
              const end = calculateEndOrientation(input as never);
              const before = orientationClass(startOrientation);
              const after = orientationClass(end);
              if (before === null || after === null) continue;

              const actual = ((after - before + 4) % 4) as 0 | 1 | 2 | 3;
              const predicted = layerClassDelta(input);
              if (actual !== predicted) {
                disagreements.push(
                  `${motionType} ${turns} ${rotationDirection} ${startLocation}->${endLocation} ` +
                    `from ${startOrientation}: calculator ${actual}, predicted ${predicted}`
                );
              }
            }
          }
        }
      }
    }

    expect(disagreements.slice(0, 5)).toEqual([]);
  });
});

describe("what moves a prop between radial and non-radial", () => {
  it("whole turns never do, whatever the motion type", () => {
    for (const motionType of ["pro", "anti", "static", "dash"]) {
      for (const turns of [0, 1, 2, 3]) {
        expect(flipsLayer(motion(motionType, turns, "cw", "s", "w"))).toBe(
          false
        );
      }
    }
  });

  it("half turns always do", () => {
    for (const motionType of ["pro", "anti", "static", "dash"]) {
      for (const turns of [0.5, 1.5, 2.5]) {
        expect(flipsLayer(motion(motionType, turns, "cw", "s", "w"))).toBe(
          true
        );
      }
    }
  });

  it("a float does when the hand travels around the circle", () => {
    expect(flipsLayer(motion("float", "fl", "no_rot", "s", "w"))).toBe(true);
    expect(flipsLayer(motion("float", "fl", "no_rot", "w", "s"))).toBe(true);
  });

  it("a float does NOT when the hand crosses the middle or stays put", () => {
    expect(flipsLayer(motion("float", "fl", "no_rot", "s", "n"))).toBe(false);
    expect(flipsLayer(motion("float", "fl", "no_rot", "n", "n"))).toBe(false);
  });

  it("quarter turns land on the level 6 halfway orientations instead", () => {
    for (const turns of [0.25, 0.75]) {
      const delta = layerClassDelta(motion("pro", turns, "cw", "s", "w"));
      expect(delta === 1 || delta === 3).toBe(true);
    }
  });
});

describe("reading a layer from two orientations", () => {
  it("names the four combinations", () => {
    expect(layerOf("in", "out")).toBe(1);
    expect(layerOf("clock", "counter")).toBe(2);
    expect(layerOf("in", "counter")).toBe(3);
    expect(layerOf("clock", "in")).toBe(4);
  });

  it("returns nothing for orientations off the cycle", () => {
    expect(layerOf("centerN", "in")).toBeNull();
    expect(layerOf("in", undefined)).toBeNull();
  });

  it("collapses the two mirror-image layers for display", () => {
    expect([1, 2, 3, 4].map((l) => collapseLayer(l as LayerId))).toEqual([
      1, 2, 3, 3,
    ]);
  });
});

describe("moving between layers", () => {
  it("matches what the orientations themselves say", () => {
    // Walk every layer through every flip and confirm the table agrees with
    // reading the resulting orientations directly.
    const sample: Record<LayerId, [string, string]> = {
      1: ["in", "in"],
      2: ["clock", "clock"],
      3: ["in", "clock"],
      4: ["clock", "in"],
    };
    const flipOri = (o: string) => (o === "in" ? "clock" : "in");

    for (const layer of [1, 2, 3, 4] as LayerId[]) {
      const [left, right] = sample[layer];
      expect(applyFlip(layer, ".")).toBe(layerOf(left, right));
      expect(applyFlip(layer, "B")).toBe(layerOf(flipOri(left), right));
      expect(applyFlip(layer, "R")).toBe(layerOf(left, flipOri(right)));
      expect(applyFlip(layer, "X")).toBe(
        layerOf(flipOri(left), flipOri(right))
      );
    }
  });

  it("undoes itself — every flip applied twice returns home", () => {
    for (const layer of [1, 2, 3, 4] as LayerId[]) {
      for (const flip of [".", "B", "R", "X"] as const) {
        expect(applyFlip(applyFlip(layer, flip), flip)).toBe(layer);
      }
    }
  });
});

describe("signatures of real sequences", () => {
  // The published ABBΦ- quartered rotated LOOP, turn pattern only. Its stored
  // signature is 1233341112333411 — the letters repeat every 4 steps but the
  // layers only repeat every 8.
  const abbPhiPattern = (locations: readonly (readonly [string, string])[]) => [
    step(
      motion("pro", 0, "cw", ...locations[0]!),
      motion("pro", 1, "cw", ...locations[1]!)
    ),
    step(
      motion("float", 0, "noRotation", ...locations[2]!),
      motion("float", 0, "noRotation", ...locations[3]!)
    ),
    step(
      motion("anti", 0.5, "cw", ...locations[4]!),
      motion("anti", 0, "cw", ...locations[5]!)
    ),
    step(
      motion("dash", 0, "noRotation", ...locations[6]!),
      motion("dash", 1, "cw", ...locations[7]!)
    ),
  ];

  const chainA = abbPhiPattern([
    ["s", "w"],
    ["n", "e"],
    ["w", "s"],
    ["e", "n"],
    ["s", "e"],
    ["n", "w"],
    ["e", "w"],
    ["w", "e"],
  ]);
  const chainB = abbPhiPattern([
    ["n", "e"],
    ["s", "w"],
    ["e", "s"],
    ["w", "n"],
    ["n", "w"],
    ["s", "e"],
    ["n", "s"],
    ["s", "n"],
  ]);

  it("reads the first quarter of the published sequence", () => {
    expect(formatSignature(layerSignature(chainA))).toBe("1233");
  });

  it("gives the same reading for a completely different set of hand paths", () => {
    expect(formatSignature(layerSignature(chainB))).toBe("1233");
  });

  it("gives the same reading from any all-radial starting pair", () => {
    for (const [left, right] of [
      ["in", "in"],
      ["in", "out"],
      ["out", "in"],
      ["out", "out"],
    ]) {
      const started = chainA.map((s, i) =>
        i === 0
          ? step(
              { ...s.motions!.left!, startOrientation: left } as never,
              { ...s.motions!.right!, startOrientation: right } as never
            )
          : s
      );
      expect(formatSignature(layerSignature(started))).toBe("1233");
    }
  });

  it("shifts the whole reading when the props start non-radial", () => {
    const started = chainA.map((s, i) =>
      i === 0
        ? step(
            { ...s.motions!.left!, startOrientation: "clock" } as never,
            { ...s.motions!.right!, startOrientation: "in" } as never
          )
        : s
    );
    expect(formatSignature(layerSignature(started))).toBe("4322");
  });

  it("never changes when there are no half turns and no floats", () => {
    const wholeTurnsOnly = [
      step(
        motion("pro", 1, "cw", "s", "w"),
        motion("anti", 2, "ccw", "n", "e")
      ),
      step(
        motion("dash", 0, "no_rot", "w", "e"),
        motion("static", 3, "cw", "e", "e")
      ),
      step(
        motion("anti", 0, "ccw", "e", "n"),
        motion("pro", 1, "cw", "w", "s")
      ),
    ];
    const metrics = layerMetrics(layerSignature(wholeTurnsOnly));
    expect(metrics.frozen).toBe(true);
    expect(metrics.breadth).toBe(1);
  });
});

describe("turn patterns as their own thing", () => {
  const pattern = {
    startLayer: 1 as LayerId,
    flips: [".", "X", "B", "."] as const,
  };

  it("survives a round trip through text", () => {
    expect(formatPattern(pattern)).toBe("1:.XB.");
    expect(parsePattern("1:.XB.")).toEqual(pattern);
    expect(parsePattern("nonsense")).toBeNull();
  });

  it("produces the same signature every time it is laid down", () => {
    expect(formatSignature(signatureFromPattern(pattern))).toBe("1233");
  });

  it("comes back out of a sequence unchanged", () => {
    const extracted = layerPatternOf(abbPhiChain());
    expect(formatPattern(extracted)).toBe("1:.XB.");
    expect(formatSignature(signatureFromPattern(extracted))).toBe("1233");
  });

  it("knows when a pattern brings both props home", () => {
    expect(isLayerClosed({ startLayer: 1, flips: [".", "X", "X", "."] })).toBe(
      true
    );
    expect(isLayerClosed({ startLayer: 1, flips: [".", "X", "B", "."] })).toBe(
      false
    );
  });

  it("swaps the props when mirrored, and mirroring twice is a no-op", () => {
    const mirrored = mirrorPattern({
      startLayer: 3,
      flips: ["B", "R", "X", "."],
    });
    expect(formatPattern(mirrored)).toBe("4:RBX.");
    expect(mirrorPattern(mirrored)).toEqual({
      startLayer: 3,
      flips: ["B", "R", "X", "."],
    });
  });

  function abbPhiChain() {
    return [
      step(motion("pro", 0, "cw", "s", "w"), motion("pro", 1, "cw", "n", "e")),
      step(
        motion("float", 0, "noRotation", "w", "s"),
        motion("float", 0, "noRotation", "e", "n")
      ),
      step(
        motion("anti", 0.5, "cw", "s", "e"),
        motion("anti", 0, "cw", "n", "w")
      ),
      step(
        motion("dash", 0, "noRotation", "e", "w"),
        motion("dash", 1, "cw", "w", "e")
      ),
    ];
  }
});

describe("real published sequences", () => {
  // Six sequences pulled straight out of publicSequences, trimmed to the motion
  // fields this module reads. Their signatures are what the app already shows
  // when you look at the props in each pictograph.
  const corpus = (
    corpusFixture as ReadonlyArray<{
      word: string;
      level: number;
      steps: LayerStepInput[];
    }>
  ).map((sequence) => ({
    ...sequence,
    steps: normalizeLegacySteps(sequence.steps),
  }));

  const expected: Record<string, string> = {
    "VPY-ΩVPY-ΩVPY-ΩVPY-Ω": "1233341112333411",
    "Θ-W-Φ-Φ-Θ-W-Φ-Φ-Θ-W-Φ-Φ-Θ-W-Φ-Φ-": "4231423142314231",
    "DΦ-CJDΦ-CJDΦ-CJDΦ-CJ": "4442333144423331",
    ΣWΣWΣWΣW: "11111111",
    "Δ-ZΩZ-Δ-ZΩZ-": "32413241",
    "ΔX-LΦΔX-LΦΔX-LΦΔX-LΦ": "1111111111111111",
  };

  it.each(corpus.map((s) => [s.word, s] as const))(
    "reads %s the way the saved orientations do",
    (word, sequence) => {
      expect(formatSignature(layerSignature(sequence.steps))).toBe(
        expected[word]
      );
    }
  );

  it("gets the same answer from the turn pattern alone, with the orientations ignored", () => {
    // This is the claim the whole module rests on: the layers are decided by the
    // turns, not by the letters or the stored orientations.
    for (const sequence of corpus) {
      const fromPattern = signatureFromPattern(layerPatternOf(sequence.steps));
      expect(formatSignature(fromPattern)).toBe(
        formatSignature(layerSignature(sequence.steps))
      );
    }
  });

  it("finds no layer movement at all below level 3", () => {
    for (const sequence of corpus.filter((s) => s.level < 3)) {
      expect(layerMetrics(layerSignature(sequence.steps)).frozen).toBe(true);
    }
  });
});

describe("measuring a signature", () => {
  const sig = (s: string) => [...s].map(Number) as LayerId[];

  it("scores the published sequence the way it reads by eye", () => {
    const m = layerMetrics(sig("1233341112333411"));
    expect(m.breadth).toBe(4);
    expect(m.desync).toBe(0.5);
    expect(m.period).toBe(8);
    expect(m.frozen).toBe(false);
  });

  it("scores a flat sequence as frozen", () => {
    const m = layerMetrics(sig("1111111111111111"));
    expect(m).toMatchObject({
      breadth: 1,
      switchRate: 0,
      desync: 0,
      period: 1,
      frozen: true,
    });
  });

  it("counts only the steps where the props disagree as busy", () => {
    expect(layerMetrics(sig("1212")).desync).toBe(0);
    expect(layerMetrics(sig("3434")).desync).toBe(1);
  });

  it("handles an empty sequence", () => {
    expect(layerMetrics([])).toMatchObject({ breadth: 0, frozen: true });
    expect(flipVectorOf(null)).toBe(".");
    expect(layerSignature(null)).toEqual([]);
  });
});

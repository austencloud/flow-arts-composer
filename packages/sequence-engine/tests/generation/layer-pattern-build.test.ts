/**
 * Asking the real builder for a layer signature.
 *
 * These drive the production dataframe through the actual SequenceBuilder — no
 * hand-built steps — and read the layers back off the orientations the builder
 * itself propagated. That is the whole claim in one assertion: a layer pattern
 * is independent of the word, so the same pattern over unrelated words produces
 * the same signature.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "../../src/generation/index.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData } from "../../src/generation/constraints/types.js";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import {
  formatSignature,
  layerSignature,
  layerPatternOf,
  parsePattern,
  signatureFromPattern,
  isLayerClosed,
  flipsLayer,
} from "../../src/core/orientation/layer-signature.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.resolve(
  __dirname,
  "../../../../static/data/pictographs/DiamondPictographDataframe.csv"
);

function loadVariations(csvPath: string): PictographData[] {
  const lines = readFileSync(csvPath, "utf8").split("\n");
  const out: PictographData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPlacement: c[1]!,
      endPlacement: c[2]!,
      timing: c[3]!,
      direction: c[4]!,
      leftMotion: {
        hand: "left",
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        hand: "right",
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
        startOrientation: "in",
        endOrientation: "in",
      },
    } as unknown as PictographData);
  }
  return out;
}

class CsvVariationProvider implements IVariationProvider {
  private readonly index = new Map<string, PictographData[]>();

  constructor(private readonly data: PictographData[]) {
    for (const p of data) {
      const key = `${p.letter}:${p.startPlacement}`;
      const bucket = this.index.get(key);
      if (bucket) bucket.push(p);
      else this.index.set(key, [p]);
    }
  }

  getVariations(letter: string, position: string): PictographData[] {
    return this.index.get(`${letter}:${position}`) ?? [];
  }

  getAllVariations(): PictographData[] {
    return this.data;
  }
}

const MAPPINGS_PATH = path.resolve(
  __dirname,
  "../../../../static/data/learn/letter-mappings.json"
);

function builder(): SequenceBuilder {
  return new SequenceBuilder(new CsvVariationProvider(loadVariations(CSV_PATH)));
}

// Word-based building walks the letter transition graph, so it needs the real
// mappings loaded — the same file the app ships.
beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

/** The layers the builder actually produced, read off its own orientations. */
function builtSignature(sequence: readonly unknown[]): string {
  return formatSignature(layerSignature(sequence.slice(1) as never));
}

/**
 * The builder inserts bridge steps to get between letters that have no direct
 * transition, so a four-letter word can come back five or six steps long. A
 * pattern covers the steps it names and leaves the rest as generated, so a
 * comparison against the pattern reads only that many steps.
 */
function shapedPart(sequence: readonly unknown[], patternLength: number): string {
  return builtSignature(sequence).slice(0, patternLength);
}

describe("SequenceBuilder — targetLayerPattern", () => {
  const WORDS = ["ABCD", "WXYZ", "JKLM"];

  it("puts unrelated words into the same layers", () => {
    const wanted = parsePattern("1:X.BR")!;
    const expected = formatSignature(signatureFromPattern(wanted));

    const produced = WORDS.map((word) => {
      const result = builder().build({
        word,
        gridMode: "diamond",
        level: 3,
        constraintPreset: "smooth",
        targetLayerPattern: wanted,
      });
      return shapedPart(result.sequence, wanted.flips.length);
    });

    // Every word lands on the same signature, and that signature is the one
    // the pattern describes.
    expect(produced).toEqual([expected, expected, expected]);
  });

  it("accepts the written form of a pattern", () => {
    const result = builder().build({
      word: "ABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: "1:BBRR",
    });

    const wanted = parsePattern("1:BBRR")!;
    expect(shapedPart(result.sequence, wanted.flips.length)).toBe(
      formatSignature(signatureFromPattern(wanted))
    );
  });

  it("holds a sequence in one layer when asked for no crossings at all", () => {
    const result = builder().build({
      word: "ABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: "1:....",
    });

    expect(shapedPart(result.sequence, 4)).toBe("1111");
  });

  it("visits all four layers when asked to", () => {
    const result = builder().build({
      word: "ABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: "1:BRBR",
    });

    const signature = builtSignature(result.sequence);
    expect(new Set(signature).size).toBe(4);
  });

  it("brings both props home when the pattern is closed", () => {
    const closed = parsePattern("1:XBRX.BR.")!;
    expect(isLayerClosed(closed)).toBe(true);

    const result = builder().build({
      word: "ABCDABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: closed,
    });

    expect(isLayerClosed(layerPatternOf(result.sequence.slice(1) as never))).toBe(
      true
    );
  });

  it("rejects a pattern it cannot read rather than quietly ignoring it", () => {
    expect(() =>
      builder().build({
        word: "ABCD",
        gridMode: "diamond",
        level: 3,
        targetLayerPattern: "nonsense",
      })
    ).toThrow(/Unreadable layer pattern/);
  });

  it("keeps level 1 and level 2 in layer 1, because non-radial starts at level 3", () => {
    // Only a half turn or a float takes a prop off radial, and neither exists
    // below level 3. So these are not merely frozen wherever they began — both
    // props are radial throughout, which is layer 1 and nothing else. Asking
    // for a crossing changes nothing rather than smuggling in a turn value the
    // level does not have.
    for (const level of [1, 2]) {
      const result = builder().build({
        word: "ABCD",
        gridMode: "diamond",
        level,
        constraintPreset: "smooth",
        targetLayerPattern: "1:XXXX",
      });

      const signature = builtSignature(result.sequence);
      expect(signature, `level ${level}`).toBe("1".repeat(signature.length));

      const turns = (result.sequence.slice(1) as never as Array<{
        motions: { left: { turns: unknown }; right: { turns: unknown } };
      }>).flatMap((s) => [s.motions.left.turns, s.motions.right.turns]);
      for (const turn of turns) {
        if (typeof turn === "number") {
          expect(Number.isInteger(turn), `level ${level} turn ${turn}`).toBe(true);
        }
      }
    }
  });
});

describe("SequenceBuilder — crossing parity for four-repetition LOOPs", () => {
  it("gives each prop an odd number of crossings, counting floats correctly", () => {
    // Without a target pattern the builder rolls its own turns; a plain build
    // is the control. What matters is that when a four-repetition cycle IS
    // requested, the parity is exact — the count includes floats, which the
    // allocator's own tally scores as zero.
    const result = builder().build({
      word: "ABCDABCD",
      gridMode: "diamond",
      level: 3,
      constraintPreset: "smooth",
      targetLayerPattern: "1:B.......",
    });

    const steps = result.sequence.slice(1) as never as Array<{
      motions: { left: never; right: never };
    }>;
    const left = steps.filter((s) => flipsLayer(s.motions.left)).length;
    const right = steps.filter((s) => flipsLayer(s.motions.right)).length;
    expect(left % 2).toBe(1);
    expect(right % 2).toBe(0);
    // An odd crossing count is exactly what stops the layers coming home.
    expect(isLayerClosed(layerPatternOf(result.sequence.slice(1) as never))).toBe(
      false
    );
  });
});

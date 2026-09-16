/**
 * The number the card shows before generating is the number that comes back.
 *
 * The Turns card reads out the layer signature a pattern will produce while the
 * user is still setting up — there is no sequence to measure yet, and no letters
 * have been chosen. That is only honest if the signature really is independent
 * of the letters: start layer, plus which props crossed, step by step.
 *
 * So this runs the real builder over three unrelated words with the same
 * pattern, measures the layers it actually produced, and compares them against
 * the app's prediction, which never sees any of it.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SequenceBuilder } from "@tka/sequence-engine/generation";
import {
  TransitionGraph,
  setLetterTransitionGraph,
  layerSignature,
  formatSignature,
} from "@tka/sequence-engine/core";
import { predictLayerSignature } from "$lib/shared/create/domain/layer-prediction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CSV_PATH = path.join(
  REPO_ROOT,
  "static/data/pictographs/DiamondPictographDataframe.csv"
);
const MAPPINGS_PATH = path.join(
  REPO_ROOT,
  "static/data/learn/letter-mappings.json"
);

function loadVariations(): unknown[] {
  const lines = readFileSync(CSV_PATH, "utf8").split("\n");
  const out: unknown[] = [];
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
        color: "blue",
        motionType: c[5]!,
        rotationDirection: c[6]!,
        startLocation: c[7]!,
        endLocation: c[8]!,
        startOrientation: "in",
        endOrientation: "in",
      },
      rightMotion: {
        color: "red",
        motionType: c[9]!,
        rotationDirection: c[10]!,
        startLocation: c[11]!,
        endLocation: c[12]!,
        startOrientation: "in",
        endOrientation: "in",
      },
    });
  }
  return out;
}

function builder(): SequenceBuilder {
  const data = loadVariations();
  const index = new Map<string, unknown[]>();
  for (const p of data as Array<{ letter: string; startPlacement: string }>) {
    const key = `${p.letter}:${p.startPlacement}`;
    const bucket = index.get(key);
    if (bucket) bucket.push(p);
    else index.set(key, [p]);
  }
  const provider = {
    getVariations: (letter: string, placement: string) =>
      index.get(`${letter}:${placement}`) ?? [],
    getAllVariations: () => data,
  };
  return new SequenceBuilder(provider as never);
}

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

describe("the layer readout tells the truth", () => {
  it("predicts the signature the builder goes on to produce", () => {
    // Blue crosses on every other step and red never does, so the sequence
    // should alternate between two layers and keep doing it forever.
    const lanes = { left: [0.5, 0], right: [0, 0] };

    for (const word of ["ABCD", "WXYZ", "JKLM"]) {
      const result = builder().build({
        word,
        gridMode: "diamond",
        level: 3,
        constraintPreset: "smooth",
        turnPattern: lanes,
        leftStartOrientation: "in",
        rightStartOrientation: "in",
      } as never);

      const built = formatSignature(
        layerSignature(result.sequence.slice(1) as never)
      );

      // The same answer, worked out with no sequence in hand at all.
      const predicted = predictLayerSignature({
        leftStartOrientation: "in",
        rightStartOrientation: "in",
        lanes,
        length: built.length,
      });

      // Guards against the comparison passing on two empty strings. The
      // builder inserts bridges, so these come back 6-8 steps long: e.g.
      // ABCD builds as ABCJD and reads 44114.
      expect(built.length, word).toBeGreaterThan(4);
      expect(new Set(built).size, `${word} never leaves one layer`).toBe(2);

      expect(predicted.uncertain, word).toBe(false);
      expect(predicted.signature, word).toBe(built);
    }
  });

  it("says so rather than guessing when a float is in the pattern", () => {
    // A float takes a prop across only when its hand travels around the circle,
    // and that is a property of the letter — which is exactly what has not been
    // chosen yet.
    const predicted = predictLayerSignature({
      leftStartOrientation: "in",
      rightStartOrientation: "in",
      lanes: { left: ["fl", 0], right: [0, 0] },
      length: 8,
    });

    expect(predicted.uncertain).toBe(true);
  });
});

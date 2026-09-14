/**
 * Real-dataset variation provider for engine tests. Copies the CSV pattern
 * from tests/generation/loop-spec-build.test.ts so builder-level tests run
 * against the production dataframes instead of a hand-built graph.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PictographData } from "../../src/generation/constraints/types.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../../../static/data/pictographs");

export function loadVariations(fileName: string): PictographData[] {
  const lines = readFileSync(path.join(DATA_DIR, fileName), "utf8").split("\n");
  const out: PictographData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]!.split(",").map((s) => s.trim());
    if (c.length < 13 || !c[0]) continue;
    out.push({
      letter: c[0],
      startPosition: c[1]!,
      endPosition: c[2]!,
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

export const loadDiamondVariations = (): PictographData[] =>
  loadVariations("DiamondPictographDataframe.csv");
export const loadBoxVariations = (): PictographData[] =>
  loadVariations("BoxPictographDataframe.csv");

export class CsvVariationProvider implements IVariationProvider {
  private readonly index = new Map<string, PictographData[]>();

  constructor(private readonly data: PictographData[]) {
    for (const p of data) {
      const key = `${p.letter}:${p.startPosition}`;
      const bucket = this.index.get(key);
      if (bucket) bucket.push(p);
      else this.index.set(key, [p]);
    }
  }

  getVariations(
    letter: string,
    position: string,
    _gridMode: string
  ): PictographData[] {
    return this.index.get(`${letter}:${position}`) ?? [];
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return this.data;
  }
}

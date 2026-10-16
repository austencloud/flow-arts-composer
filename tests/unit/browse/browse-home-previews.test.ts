/**
 * The Browse home's tile previews: each scene is decorative and names the
 * place it mirrors (the same contract Create's scenes keep), every layout
 * keeps its cards inside the box, and the sequence and mandala picks give a
 * wall of different pictures.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BROWSE_HOME_SCENES } from "#lib/features/browse/home/previews/browse-home-scenes.js";
import {
  collectionShelf,
  sequenceWall,
  visualsPair,
  youShelf,
  type PreviewRect,
} from "#lib/features/browse/home/previews/browse-home-preview-layout.js";
import { mandalaPairAt } from "#lib/features/browse/home/previews/browse-preview-mandalas.js";
import { drawPreviewSequences } from "#lib/features/browse/home/previews/browse-preview-sequences.js";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import type { MethodPreviewShape } from "#lib/features/create/shared/components/method-previews/method-preview-layout.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const DIR = "src/lib/features/browse/home/previews";

const SCENE_FILES: Record<string, string> = {
  sequences: "SequencesScene.svelte",
  collections: "CollectionsScene.svelte",
  visuals: "VisualsScene.svelte",
  you: "YouScene.svelte",
};

const INTERACTIVE = [
  /<button\b/,
  /<a\s/,
  /<input\b/,
  /<select\b/,
  /<textarea\b/,
  /tabindex/,
];

/** Boxes the tiles produce across the viewport tiers. */
const BOXES: ReadonlyArray<[MethodPreviewShape, number, number]> = [
  ["strip", 320, 64],
  ["roomy", 360, 110],
  ["roomy", 280, 170],
  ["square", 90, 90],
  ["square", 200, 180],
];

function inside(rect: PreviewRect, width: number, height: number): boolean {
  return (
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.width <= width + 0.5 &&
    rect.y + rect.height <= height + 0.5
  );
}

function overlaps(a: PreviewRect, b: PreviewRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

describe("browse home preview scenes", () => {
  it("are decorative and name the place they mirror", () => {
    for (const id of Object.keys(BROWSE_HOME_SCENES)) {
      const file = SCENE_FILES[id];
      expect(file, `scene file for ${id}`).toBeDefined();
      const path = resolve(process.cwd(), DIR, file!);
      expect(existsSync(path), path).toBe(true);
      const source = readFileSync(path, "utf8");
      for (const pattern of INTERACTIVE) {
        expect(source, `${file} ${pattern}`).not.toMatch(pattern);
      }
      expect(source, `${file} names its place`).toMatch(/Mirrors:/);
    }
  });
});

describe("browse home preview layouts", () => {
  it.each(BOXES)(
    "keep the sequence wall inside a %s %ix%i box",
    (shape, w, h) => {
      const cards = sequenceWall(shape, w, h);
      expect(cards.length).toBeGreaterThanOrEqual(3);
      for (const card of cards) expect(inside(card, w, h)).toBe(true);
      for (let i = 1; i < cards.length; i++) {
        expect(overlaps(cards[i - 1]!, cards[i]!)).toBe(false);
      }
    }
  );

  it.each(BOXES)(
    "keep collection stacks inside a %s %ix%i box",
    (shape, w, h) => {
      const shelf = collectionShelf(shape, w, h);
      expect(shelf).not.toBeNull();
      expect(shelf!.stacks.length).toBeGreaterThanOrEqual(1);
      expect(shelf!.fan).toHaveLength(3);
      for (const rect of [...shelf!.stacks, ...shelf!.fan]) {
        expect(inside(rect, w, h)).toBe(true);
      }
    }
  );

  it.each(BOXES)(
    "keep the visuals pair inside a %s %ix%i box",
    (_shape, w, h) => {
      const pair = visualsPair(w, h)!;
      expect(inside(pair.tunnel, w, h)).toBe(true);
      expect(inside(pair.mandala, w, h)).toBe(true);
      expect(overlaps(pair.tunnel, pair.mandala)).toBe(false);
    }
  );

  it.each(BOXES)("keep your shelf inside a %s %ix%i box", (shape, w, h) => {
    const shelf = youShelf(shape, w, h)!;
    expect(shelf).not.toBeNull();
    for (const rect of [shelf.source, shelf.plate, ...shelf.slots]) {
      expect(inside(rect, w, h)).toBe(true);
    }
    expect(inside(shelf.heart, w, h)).toBe(true);
    if (shape === "square") {
      expect(shelf.slots).toHaveLength(0);
    } else {
      expect(shelf.slots.length).toBeGreaterThanOrEqual(2);
      expect(overlaps(shelf.source, shelf.plate)).toBe(false);
    }
  });

  it("returns nothing for an unmeasured box", () => {
    expect(sequenceWall("strip", 0, 0)).toEqual([]);
    expect(collectionShelf("strip", 0, 40)).toBeNull();
    expect(visualsPair(0, 0)).toBeNull();
    expect(youShelf("strip", 0, 0)).toBeNull();
  });
});

describe("browse home preview picks", () => {
  it("steps the mandala pair so neighbouring turns differ", () => {
    const axis = Array.from({ length: 20 }, (_, index) => ({ index }) as never);
    const picks = Array.from({ length: 6 }, (_, turn) =>
      mandalaPairAt(axis, turn)
    );
    const keys = picks.map(
      (pair) => `${axis.indexOf(pair!.left)}:${axis.indexOf(pair!.right)}`
    );
    expect(new Set(keys).size).toBe(6);
    expect(mandalaPairAt(axis, -1)).toEqual(mandalaPairAt(axis, 5));
    expect(mandalaPairAt([], 0)).toBeNull();
  });

  it("draws different words and fills the rest from the demo", async () => {
    const words = ["ABC", "ABC", "DEF"];
    let call = 0;
    const draw = async () => {
      const word = words[call++];
      if (!word) return null;
      return { sequence: { ...DEMO_SEQUENCE, word } as SequenceData };
    };
    const drawn = await drawPreviewSequences(4, { draw });
    expect(drawn).toHaveLength(4);
    expect(drawn.slice(0, 2).map((entry) => entry.word)).toEqual([
      "ABC",
      "DEF",
    ]);
    expect(drawn[2]!.sequence).toBe(DEMO_SEQUENCE);
    expect(drawn[2]!.offset).not.toBe(drawn[3]!.offset);
  });

  it("falls back to the demo when the pool fails", async () => {
    const drawn = await drawPreviewSequences(3, {
      draw: async () => {
        throw new Error("offline");
      },
    });
    expect(drawn.every((entry) => entry.sequence === DEMO_SEQUENCE)).toBe(true);
  });
});

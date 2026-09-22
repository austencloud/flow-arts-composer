import { describe, expect, it } from "vitest";
import {
  encodeSequence,
  decodeSequence,
} from "$lib/shared/navigation/services/sequence-encoder";
import { CompositionalDecoder } from "$lib/shared/qr/services/compositional-decoder";
import { computeRecipeHash } from "$lib/shared/qr/services/compositional-utils";
import witnesses from "../../fixtures/loop-audit/qr-legacy-recipes.json";

// Captured from the six app executors at witnesses.sourceCommit, before their
// removal. These flat encodings freeze the actual old QR wire output rather
// than comparing two adapters that both call today's engine.
describe("pre-migration QR recipes", () => {
  it.each(witnesses.records)(
    "decodes $tag/$grid to its original wire output",
    async ({ tag, seed, full, count }) => {
      const decoder = new CompositionalDecoder(
        { encode: encodeSequence },
        { decode: decodeSequence },
        { decompressString: (value) => value }
      );
      const hash = await computeRecipeHash(full);
      const decoded = await decoder.decode(`r1:${tag}:${hash}:${seed}`);
      expect(decoded).toBe(full);
      expect(decodeSequence(decoded).steps).toHaveLength(count);
    }
  );
});

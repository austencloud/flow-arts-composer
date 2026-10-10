import { describe, it, expect } from "vitest";
import {
  CollectedMandalaSchema,
  MANDALA_COLLECTION_STORAGE_KEY,
} from "../mandala-collection-types";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

const valid = {
  id: "m1",
  name: "My Mandala",
  steps: [],
  variant: "both",
  leftPropType: "staff",
  rightPropType: "staff",
  createdAt: 123,
};

describe("CollectedMandalaSchema", () => {
  it("accepts a well-formed record", () => {
    expect(CollectedMandalaSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["blue", "left"],
    ["red", "right"],
  ])("normalizes legacy %s variants to %s", (legacy, canonical) => {
    const result = CollectedMandalaSchema.safeParse({
      ...valid,
      variant: legacy,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.variant).toBe(canonical);
  });

  it("restores literal blue/red prop fields from a saved mandala", () => {
    const result = CollectedMandalaSchema.parse({
      ...valid,
      leftPropType: undefined,
      rightPropType: undefined,
      bluePropType: "poi",
      redPropType: "fan",
    });

    expect(result.leftPropType).toBe("poi");
    expect(result.rightPropType).toBe("fan");
  });

  it("preserves the saved path shape while accepting older entries without it", () => {
    expect(
      CollectedMandalaSchema.safeParse({ ...valid, pathShape: "concave" })
        .success
    ).toBe(true);
    expect(CollectedMandalaSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an id", () => {
    const { id: _drop, ...rest } = valid;
    expect(CollectedMandalaSchema.safeParse(rest).success).toBe(false);
  });

  it("exposes the storage key", () => {
    expect(MANDALA_COLLECTION_STORAGE_KEY).toBe("tka:mandala-collection");
  });

  // Unit 3 (lineage stamp): old entries lack sourceWord/sourceSequenceId
  // entirely — the schema must still accept them.
  it("accepts an entry with no lineage stamp (old entries)", () => {
    expect(CollectedMandalaSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an entry stamped with a simplified source word", () => {
    // The stamp always goes through simplifyRepeatedWord at save time — a
    // repeating word like "FΨFΨFΨFΨ" is stored as its shortest form "FΨ",
    // never the raw repeated string (rule: simplified-word-display).
    const sourceWord = simplifyRepeatedWord("FΨFΨFΨFΨ");
    expect(sourceWord).toBe("FΨ");

    const stamped = { ...valid, sourceWord };
    const result = CollectedMandalaSchema.safeParse(stamped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceWord).toBe("FΨ");
      expect(result.data.sourceSequenceId).toBeUndefined();
    }
  });

  it("accepts an entry stamped with both a source word and a source sequence id", () => {
    const stamped = { ...valid, sourceWord: "FΨ", sourceSequenceId: "seq-456" };
    const result = CollectedMandalaSchema.safeParse(stamped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceSequenceId).toBe("seq-456");
    }
  });
});

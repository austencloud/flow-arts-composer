import { describe, it, expect } from "vitest";
import {
  computeBundleSignature,
  resolvePrewarmPropTypes,
} from "../card-pool-prewarm";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const seq = (id: string) =>
  ({ id, word: id, steps: [] }) as unknown as SequenceData;
const base = {
  sequences: [seq("a"), seq("b")],
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  theme: "cosmic",
  iconPaths: ["/icons/fire.png"],
};

describe("computeBundleSignature", () => {
  it("is stable for the same inputs regardless of sequence order", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({
      ...base,
      sequences: [seq("b"), seq("a")],
    });
    expect(s1).toBe(s2);
  });

  it("changes when a sequence id set changes", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({
      ...base,
      sequences: [seq("a"), seq("c")],
    });
    expect(s1).not.toBe(s2);
  });

  it("changes for variations that share a base sequence id", () => {
    const variationA = {
      ...seq("reused"),
      steps: [{ startPosition: "alpha" }],
    } as unknown as SequenceData;
    const variationB = {
      ...seq("reused"),
      steps: [{ startPosition: "beta" }],
    } as unknown as SequenceData;

    expect(
      computeBundleSignature({ ...base, sequences: [variationA] })
    ).not.toBe(computeBundleSignature({ ...base, sequences: [variationB] }));
  });

  it("changes when prop types change", () => {
    const s1 = computeBundleSignature(base);
    const s2 = computeBundleSignature({ ...base, rightPropType: PropType.FAN });
    expect(s1).not.toBe(s2);
  });

  it("changes when footer icons or theme change", () => {
    const original = computeBundleSignature(base);

    expect(
      computeBundleSignature({ ...base, iconPaths: ["/icons/water.png"] })
    ).not.toBe(original);
    expect(computeBundleSignature({ ...base, theme: "light" })).not.toBe(
      original
    );
  });

  it("seeds hand-path pools with hand assets regardless of live prop settings", () => {
    const handPath = { ...base, handPathMode: true };

    expect(resolvePrewarmPropTypes(handPath)).toEqual({
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
    });
    expect(computeBundleSignature(handPath)).toBe(
      computeBundleSignature({
        ...base,
        leftPropType: PropType.HAND,
        rightPropType: PropType.HAND,
      })
    );
  });
});

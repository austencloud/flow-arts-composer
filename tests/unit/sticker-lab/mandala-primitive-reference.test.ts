import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import { createMandalaPrimitiveRef } from "#lib/features/sticker-lab/domain/mandala-primitive-reference.js";

const paths: MandalaPaths = {
  left: [{ d: "M 10 0 C 10 0, 20 0, 30 0", tipIndex: 0 }],
  right: [{ d: "M -10 0 C -10 0, -20 0, -30 0", tipIndex: 0 }],
  purple: [],
};

function sequence(id: string): SequenceData {
  return {
    id,
    word: id,
    loopType: "rotated-loop",
    steps: [],
  } as unknown as SequenceData;
}

describe("mandala primitive reference", () => {
  it("keeps geometric identity independent from the representative sequence", () => {
    const first = createMandalaPrimitiveRef(sequence("ONE"), paths);
    const second = createMandalaPrimitiveRef(sequence("TWO"), paths);

    expect(first.shapeHash).toBe(second.shapeHash);
    expect(first.ultraHash).toBe(second.ultraHash);
    expect(first.representativeSequenceId).toBe("ONE");
    expect(second.representativeSequenceId).toBe("TWO");
    expect(first.identityKind).toBe("geometry-v1");
  });
});

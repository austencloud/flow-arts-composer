import { describe, it, expect } from "vitest";
import { buildCandidates } from "#lib/features/loop-labeler/services/detection/build-candidates.js";
import { LOOP_TYPE_DEFINITIONS } from "#lib/features/loop-labeler/domain/constants/loop-type-definitions.js";
import type { MergedMatch, RewoundResult } from "#lib/features/loop-labeler/services/detection/types.js";

const rotatedDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "rotated")!;
const mirSwapDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "mirrored_swapped")!;
const rotSwapInvDef = LOOP_TYPE_DEFINITIONS.find(d => d.id === "rotated_swapped_inverted")!;

const noRewound: RewoundResult = { isRewound: false };

describe("buildCandidates", () => {
  it("builds strict candidate for single match", () => {
    const matches: MergedMatch[] = [{
      definition: rotatedDef,
      interval: 4,
      matchedTarget: "rotated_90_cw",
      direction: "cw",
      isStrict: true,
    }];

    const candidates = buildCandidates(matches, noRewound);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.loopType).toBe("strict_rotated");
    expect(candidates[0]!.components).toEqual(["rotated"]);
    expect(candidates[0]!.rotationDirection).toBe("cw");
    expect(candidates[0]!.transformationIntervals.rotation).toBe(4);
    expect(candidates[0]!.description).toBe("Rotated 90° CW");
  });

  it("adds rewound candidate when rewound detected", () => {
    const matches: MergedMatch[] = [{
      definition: mirSwapDef,
      interval: 2,
      matchedTarget: "mirrored_swapped",
      direction: null,
      isStrict: false,
    }];

    const candidates = buildCandidates(matches, { isRewound: true });
    expect(candidates).toHaveLength(2);
    expect(candidates[1]!.loopType).toBe("rewound");
    expect(candidates[1]!.components).toEqual(["rewound"]);
  });

  it("builds triple compound candidate", () => {
    const matches: MergedMatch[] = [{
      definition: rotSwapInvDef,
      interval: 4,
      matchedTarget: "rotated_90_ccw_swapped_inverted",
      direction: "ccw",
      isStrict: true,
    }];

    const candidates = buildCandidates(matches, noRewound);
    expect(candidates[0]!.loopType).toBe("strict_rotated_swapped_inverted");
    expect(candidates[0]!.components).toEqual(["rotated", "swapped", "inverted"]);
    expect(candidates[0]!.description).toBe("Rotated 90° CCW + Swapped + Inverted");
  });

  it("returns empty for no matches and no rewound", () => {
    const candidates = buildCandidates([], noRewound);
    expect(candidates).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { SoloPropDataSchema } from "#lib/shared/foundation/domain/models/solo-prop-schemas.js";

describe("SoloPropDataSchema", () => {
  it("accepts the canonical start/end step shape persisted by the solo repository", () => {
    const result = SoloPropDataSchema.safeParse({
      id: "solo-1",
      steps: [
        {
          startLocation: "n",
          endLocation: "e",
          startOrientation: "in",
          endOrientation: "out",
          motionType: "pro",
          rotationDirection: "cw",
          turns: 1,
          duration: 1,
        },
      ],
      startLocation: "n",
      startOrientation: "in",
      contentHash: "solo-hash",
      handPath: {
        id: "hand-1",
        locations: ["n", "e"],
        contentHash: "hand-hash",
        startLocation: "n",
        endLocation: "e",
        length: 1,
        bigrams: ["n-e"],
        uniqueLocations: ["n", "e"],
        impliedGridMode: "diamond",
        isClosed: false,
      },
      length: 1,
      bigrams: ["n-e"],
      impliedGridMode: "diamond",
    });

    expect(result.success).toBe(true);
  });
});

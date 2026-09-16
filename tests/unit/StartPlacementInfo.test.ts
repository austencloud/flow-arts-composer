import { describe, it, expect } from "vitest";
import { deriveStartPlacementInfo } from "../../src/lib/features/choreo-card/components/card-back/card-back-data";

describe("deriveStartPlacementInfo", () => {
  it("returns diamond mode for cardinal hand locations", () => {
    const result = deriveStartPlacementInfo({
      leftLocation: "s",
      rightLocation: "n",
    });
    expect(result.gridMode).toBe("diamond");
    expect(result.group).toBe("alpha");
    expect(result.leftLocation).toBe("s");
    expect(result.rightLocation).toBe("n");
  });

  it("returns box mode for intercardinal hand locations", () => {
    const result = deriveStartPlacementInfo({
      leftLocation: "ne",
      rightLocation: "sw",
    });
    expect(result.gridMode).toBe("box");
    expect(result.group).toBe("alpha");
  });

  it("returns mixed mode when locations span cardinal and intercardinal", () => {
    const result = deriveStartPlacementInfo({
      leftLocation: "n",
      rightLocation: "ne",
    });
    expect(result.gridMode).toBe("mixed");
    expect(result.group).toBe("gamma");
  });

  it("returns beta for same locations", () => {
    const result = deriveStartPlacementInfo({
      leftLocation: "s",
      rightLocation: "s",
    });
    expect(result.group).toBe("beta");
    expect(result.gridMode).toBe("diamond");
  });

  it("returns null info when no locations provided", () => {
    const result = deriveStartPlacementInfo({
      leftLocation: null,
      rightLocation: null,
    });
    expect(result.group).toBeNull();
    expect(result.leftLocation).toBeNull();
    expect(result.rightLocation).toBeNull();
    expect(result.gridMode).toBe("diamond");
  });
});

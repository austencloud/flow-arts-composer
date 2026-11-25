import { describe, expect, it } from "vitest";
import { LOOPValidator } from "#lib/features/create/shared/services/loop-validator.js";
import {
  Period,
  LOOPType,
} from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { rowChange, variantFor, type LoopSeedCheck } from "./loop-families";

const validator = new LOOPValidator();
const check: LoopSeedCheck = (type, pair, period) =>
  validator.isLOOPValidForPlacementPair(type, pair, period);

const at = (
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) => ({ leftStart, leftEnd, rightStart, rightEnd });

describe("LOOP families", () => {
  it("offers a quarter turn and a half turn for the right endings", () => {
    expect(variantFor("rotated", "alpha1", "alpha3", check)?.period).toBe(
      Period.QUARTERED
    );
    expect(variantFor("rotated", "alpha1", "alpha5", check)?.period).toBe(
      Period.HALVED
    );
    expect(variantFor("rotated", "alpha1", "beta1", check)).toBeNull();
  });

  it("lets Rewound take any ending and Inverted only the start", () => {
    expect(variantFor("rewound", "alpha1", "gamma7", check)?.loopType).toBe(
      LOOPType.STRICT_REWOUND
    );
    expect(variantFor("inverted", "alpha1", "alpha1", check)).not.toBeNull();
    expect(variantFor("inverted", "alpha1", "alpha3", check)).toBeNull();
  });

  it("reads the turn or the mirror a row really makes", () => {
    const first = at("n", "e", "s", "w");
    expect(rowChange("rotated", first, at("e", "s", "w", "n"))).toBe("r90");
    expect(rowChange("rotated", first, at("s", "w", "n", "e"))).toBe("r180");
    expect(rowChange("rotated", first, at("w", "n", "e", "s"))).toBe("r270");
    expect(rowChange("reflected", first, at("n", "w", "s", "e"))).toBe("mx");
    expect(rowChange("reflected", first, at("s", "e", "n", "w"))).toBe("my");
    expect(rowChange("swapped", first, at("s", "w", "n", "e"))).toBe("same");
    expect(rowChange("rotated", first, null)).toBe("same");
  });
});

import { describe, expect, it } from "vitest";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { shapeMatrixTipPoint } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";

describe("Shape Matrix tracked prop source", () => {
  it("tracks the staff thumb end", () => {
    expect(shapeMatrixTipPoint(PropType.STAFF)).toEqual({ dx: 126.4, dy: 0 });
  });

  it("tracks the fan center rib instead of an arbitrary outer rib", () => {
    expect(shapeMatrixTipPoint(PropType.FAN)).toEqual({ dx: 130, dy: 0 });
  });

  it("excludes props without a tracked endpoint", () => {
    expect(shapeMatrixTipPoint(PropType.HAND)).toBeNull();
  });
});

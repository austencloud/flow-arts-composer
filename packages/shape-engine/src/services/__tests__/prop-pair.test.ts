import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getAllPropTypes } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { foldUntraceableProp, shapeMatrixPickerProps } from "../prop-pair";

describe("Shape Engine picker props", () => {
  it("leaves out the props with no tip point to trace", () => {
    const offered = shapeMatrixPickerProps();
    expect(offered).not.toContain(PropType.CONTACTBALL);
    expect(offered).not.toContain(PropType.BIGCONTACTBALL);
    expect(offered).not.toContain(PropType.HAND);
  });

  it("keeps staff and the double contact balls, which do trace", () => {
    const offered = shapeMatrixPickerProps();
    expect(offered).toContain(PropType.STAFF);
    expect(offered).toContain(PropType.DOUBLECONTACTBALL);
    expect(offered).toContain(PropType.BIGDOUBLECONTACTBALL);
  });

  it("offers exactly the props the engine draws as themselves", () => {
    const drawnAsThemselves = getAllPropTypes().filter(
      (prop) => foldUntraceableProp(prop) === prop
    );
    expect(new Set(shapeMatrixPickerProps())).toEqual(
      new Set(drawnAsThemselves)
    );
  });
});

/**
 * The Create tab now follows app settings for its prop pair. A settings
 * value of a prop the Shape Engine cannot trace a path for (a bare hand, a
 * single contact ball -- see build() in shape-matrix-flowers.ts, which
 * throws for exactly these) would otherwise leave the matrix permanently
 * stuck on "could not be built". foldUntraceableProp steers around that by
 * drawing staff instead, without touching the user's saved choice.
 */
import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  foldUntraceableProp,
  foldUntraceablePropPair,
} from "$lib/shared/shape-matrix/domain/prop-pair";
import { shapeMatrixTipPoint } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";

describe("foldUntraceableProp", () => {
  it("agrees with shapeMatrixTipPoint (the fact build() throws on) for every prop type", () => {
    for (const propType of Object.values(PropType)) {
      const traceable = shapeMatrixTipPoint(propType) !== null;
      const folded = foldUntraceableProp(propType);
      if (traceable) {
        expect(folded).toBe(propType);
      } else {
        expect(folded).toBe(PropType.STAFF);
      }
    }
  });

  it("leaves a traceable prop untouched", () => {
    expect(foldUntraceableProp(PropType.CLUB)).toBe(PropType.CLUB);
    expect(foldUntraceableProp(PropType.STAFF)).toBe(PropType.STAFF);
    expect(foldUntraceableProp(PropType.DOUBLECONTACTBALL)).toBe(
      PropType.DOUBLECONTACTBALL
    );
  });

  it("folds a bare hand and a single contact ball, which have no tracked tip", () => {
    expect(foldUntraceableProp(PropType.HAND)).toBe(PropType.STAFF);
    expect(foldUntraceableProp(PropType.CONTACTBALL)).toBe(PropType.STAFF);
    expect(foldUntraceableProp(PropType.BIGCONTACTBALL)).toBe(PropType.STAFF);
  });
});

describe("foldUntraceablePropPair", () => {
  it("folds each hand independently", () => {
    expect(
      foldUntraceablePropPair({ left: PropType.HAND, right: PropType.CLUB })
    ).toEqual({ left: PropType.STAFF, right: PropType.CLUB });
    expect(
      foldUntraceablePropPair({
        left: PropType.FAN,
        right: PropType.CONTACTBALL,
      })
    ).toEqual({ left: PropType.FAN, right: PropType.STAFF });
  });

  it("leaves an already-traceable pair untouched", () => {
    const pair = { left: PropType.STAFF, right: PropType.BIGSTAFF };
    expect(foldUntraceablePropPair(pair)).toEqual(pair);
  });
});

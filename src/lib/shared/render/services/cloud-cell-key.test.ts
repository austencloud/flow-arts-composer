import { describe, it, expect } from "vitest";
import { canonicalCellKeyString, CANONICAL_CELL_SIZE } from "./cloud-cell-key";
import type { PreviewCellRenderOptions } from "#lib/shared/sequence-viewer/services/preview-cell-renderer.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const data = {
  letter: "A",
  startPos: "alpha1",
  endPos: "alpha3",
  motions: {
    left: { motionType: "pro", startLocation: "n", endLocation: "e", turns: 0 },
    right: { motionType: "pro", startLocation: "s", endLocation: "w", turns: 0 },
  },
} as unknown as PictographData;

const base: PreviewCellRenderOptions = { size: 300, leftPropType: undefined };

describe("canonicalCellKeyString", () => {
  it("is independent of display size (size normalized to canonical)", () => {
    const a = canonicalCellKeyString(data, true, { ...base, size: 300 });
    const b = canonicalCellKeyString(data, true, { ...base, size: 640 });
    expect(a).toBe(b);
    expect(a).toContain(String(CANONICAL_CELL_SIZE));
  });

  it("is independent of step-number presence", () => {
    const a = canonicalCellKeyString(data, true, {
      ...base,
      showStepNumbers: true,
    });
    const b = canonicalCellKeyString(data, true, {
      ...base,
      showStepNumbers: false,
    });
    expect(a).toBe(b);
  });

  it("differs by dark mode and by prop type", () => {
    expect(canonicalCellKeyString(data, true, base)).not.toBe(
      canonicalCellKeyString(data, false, base)
    );
    expect(
      canonicalCellKeyString(data, true, {
        ...base,
        leftPropType: PropType.STAFF,
        rightPropType: PropType.POI,
        catDogModeEnabled: true,
      })
    ).not.toBe(
      canonicalCellKeyString(data, true, {
        ...base,
        leftPropType: PropType.FAN,
        rightPropType: PropType.POI,
        catDogModeEnabled: true,
      })
    );
  });

  it("carries the authored club-art revision into the cloud identity", () => {
    const club = canonicalCellKeyString(data, true, {
      ...base,
      leftPropType: PropType.CLUB,
    });
    const staff = canonicalCellKeyString(data, true, {
      ...base,
      leftPropType: PropType.STAFF,
    });

    expect(club).toContain('"propAppearanceRevision":"club-art-v2"');
    expect(staff).not.toContain("propAppearanceRevision");
  });

  it("keeps the triangle corpus on the corner glyph's key", () => {
    const triangle = { ...base, leftPropType: PropType.TRIANGLE };
    const corpus = canonicalCellKeyString(data, true, triangle);

    expect(
      canonicalCellKeyString(data, true, { ...triangle, triangleGrip: "corner" })
    ).toBe(corpus);
    expect(corpus).not.toContain("triangleGrip");
    // A stray side-grip render misses the cloud instead of being served, or
    // uploaded, under the corner glyph's hash.
    expect(
      canonicalCellKeyString(data, true, { ...triangle, triangleGrip: "side" })
    ).not.toBe(corpus);
  });

  it("normalizes per-device visibility: same hash regardless of showTKA/showTnD/showGrid", () => {
    const a = canonicalCellKeyString(data, true, {
      ...base,
      showTKA: true,
      showTnD: true,
      showGrid: true,
    });
    const b = canonicalCellKeyString(data, true, {
      ...base,
      showTKA: false,
      showTnD: false,
      showGrid: false,
    });
    expect(a).toBe(b);
  });
});

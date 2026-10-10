import { describe, expect, it } from "vitest";

import {
  filterSpinnerPropCategories,
  isSpinnerViewerProp,
  resolvePropMotionDiscipline,
  sceneNeedsContactViewer,
} from "#lib/shared/3d/domain/prop-motion-discipline.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getBasePropsByCategory } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

describe("prop motion discipline", () => {
  it("routes the entire contact-ball family away from the spinner stage", () => {
    for (const propType of [
      PropType.CONTACTBALL,
      PropType.BIGCONTACTBALL,
      PropType.DOUBLECONTACTBALL,
      PropType.BIGDOUBLECONTACTBALL,
    ]) {
      expect(resolvePropMotionDiscipline(propType)).toBe("contact");
      expect(isSpinnerViewerProp(propType)).toBe(false);
    }
  });

  it("keeps ordinary active props in the spinner discipline", () => {
    expect(resolvePropMotionDiscipline(PropType.STAFF)).toBe("spinner");
    expect(resolvePropMotionDiscipline(PropType.POI)).toBe("spinner");
    expect(resolvePropMotionDiscipline(null)).toBe("spinner");
  });

  it("gates a scene when either hand carries a contact prop", () => {
    expect(
      sceneNeedsContactViewer(PropType.DOUBLECONTACTBALL, PropType.STAFF)
    ).toBe(true);
    expect(
      sceneNeedsContactViewer(PropType.STAFF, PropType.DOUBLECONTACTBALL)
    ).toBe(true);
    expect(sceneNeedsContactViewer(PropType.CLUB, PropType.STAFF)).toBe(false);
  });

  it("removes contact props from the 3D picker without mutating the global registry map", () => {
    const globalCategories = getBasePropsByCategory();
    const before = [...globalCategories.values()].flat();
    const spinnerCategories = filterSpinnerPropCategories(globalCategories);
    const filtered = [...spinnerCategories.values()].flat();

    expect(before).toContain(PropType.DOUBLECONTACTBALL);
    expect(filtered).not.toContain(PropType.DOUBLECONTACTBALL);
    expect([...globalCategories.values()].flat()).toEqual(before);
    expect(filtered).toContain(PropType.STAFF);
  });
});

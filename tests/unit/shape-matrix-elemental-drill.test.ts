import { describe, it, expect } from "vitest";
import { FAMILY_BY_MODE } from "#lib/shared/shape-matrix/services/build-mode-realizations.js";
import { MODE_ORDER } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
import { TND_BY_FAMILY } from "#lib/features/choreo-card/domain/tnd-element.js";

describe("elemental drill mode mapping", () => {
  it("maps every VTG mode to a distinct TnD element", () => {
    const elements = MODE_ORDER.map((m) => {
      const family = FAMILY_BY_MODE[m];
      const el = TND_BY_FAMILY[family];
      expect(el, `mode ${m} → family ${family}`).toBeDefined();
      return el.element;
    });
    expect(new Set(elements).size).toBe(6);
    expect(elements).toEqual(["water", "earth", "sun", "fire", "air", "moon"]);
  });
});

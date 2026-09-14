import { describe, expect, it } from "vitest";
import { PropType } from "../enums/prop-type";
import {
  DEACTIVATED_PROP_TYPES,
  PROP_PICKER_SECTIONS,
  getAllVariations,
  getBasePropType,
  hasBigVariant,
  isBigVariant,
  isPropActive,
  toggleBigVariant,
} from "../prop-type-display-registry";

describe("prop picker catalog", () => {
  it("hides nothing", () => {
    expect(DEACTIVATED_PROP_TYPES.size).toBe(0);
    for (const prop of Object.values(PropType)) {
      expect(isPropActive(prop), prop).toBe(true);
    }
  });

  it("lists every prop with artwork, bare hands included", () => {
    const listed = new Set(PROP_PICKER_SECTIONS.flatMap((s) => s.props));
    const expected = Object.values(PropType) as PropType[];
    const missing = expected.filter((prop) => !listed.has(prop));
    expect(missing).toEqual([]);
  });
});

describe("size is a dial, not a variant", () => {
  const bigProps = (Object.values(PropType) as PropType[]).filter((prop) =>
    prop.startsWith("big")
  );

  it("reaches every big prop from its standard counterpart", () => {
    // The grid folds big props away, so the size dock is the only way in. A
    // big prop with no standard pair would be unreachable rather than merely
    // hidden.
    const stranded = bigProps.filter((prop) => !hasBigVariant(prop));
    expect(stranded).toEqual([]);

    for (const prop of bigProps) {
      const standard = toggleBigVariant(prop);
      expect(standard, prop).not.toBe(prop);
      expect(toggleBigVariant(standard), prop).toBe(prop);
    }
  });

  it("keeps big props out of every family drill-down", () => {
    // A family lists styles only. Big Staff padding the Double Staff family
    // is the exact conflation the size dial replaced.
    for (const prop of Object.values(PropType) as PropType[]) {
      const base = getBasePropType(prop);
      const styleChoices = getAllVariations(base).filter(
        (choice) => !isBigVariant(choice)
      );
      expect(styleChoices.some((choice) => isBigVariant(choice)), base).toBe(
        false
      );
    }
  });

  it("folds Big Fan into the Fan tile like every other big", () => {
    expect(getBasePropType(PropType.BIGFAN)).toBe(PropType.FAN);
    expect(isBigVariant(PropType.BIGFAN)).toBe(true);
    expect(toggleBigVariant(PropType.FAN)).toBe(PropType.BIGFAN);
  });
});

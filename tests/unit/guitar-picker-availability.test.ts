import { describe, expect, it } from "vitest";

import { UNLOCKABLE_POOL } from "#lib/shared/gamification/domain/prop-pool.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  PROP_PICKER_SECTIONS,
  getBasePropsByCategory,
  isPropActive,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

describe("Guitar picker availability", () => {
  it("keeps Guitar active and reachable from the production prop picker", () => {
    const noveltySection = PROP_PICKER_SECTIONS.find(
      (section) => section.label === "Novelty"
    );

    expect(isPropActive(PropType.GUITAR)).toBe(true);
    expect(noveltySection?.props).toContain(PropType.GUITAR);
    expect(getBasePropsByCategory().get("novelty")).toContain(PropType.GUITAR);
  });

  it("keeps Guitar claimable if play-earned prop locking returns", () => {
    expect(UNLOCKABLE_POOL).toContain(PropType.GUITAR);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildCustomizeSummary,
  capSummaryFacts,
  summaryRowBudget,
  PRODUCTION_STYLE_BASELINE,
  type CustomizeStyleBaseline,
  type CustomizeSummaryInput,
} from "../customize-summary";
import {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import {
  ALL_DIAMOND_PLACEMENTS,
  CLASSIC_DIAMOND_PLACEMENTS,
} from "../../../shared/domain/start-placement-presets";

const NO_CONSTRAINTS: StartEndOptions = {
  blockedStartPlacements: [],
  startPlacement: null,
  endPlacement: null,
  endPlacements: [],
  mustContainLetters: [],
  mustNotContainLetters: [],
  leftStartOrientation: Orientation.IN,
  rightStartOrientation: Orientation.IN,
};

/** What the public Composer toy opens on — deliberately not the production defaults. */
const DEMO_BASELINE: CustomizeStyleBaseline = {
  constraintPreset: "smooth",
  handPathMode: "smooth",
  motionTypeFilter: "no-dash",
};

function inputFrom(
  baseline: CustomizeStyleBaseline,
  startEndOptions: StartEndOptions = NO_CONSTRAINTS
): CustomizeSummaryInput {
  return {
    constraintPreset: baseline.constraintPreset,
    handPathMode: baseline.handPathMode,
    motionTypeFilter: baseline.motionTypeFilter,
    startEndOptions,
    gridMode: GridMode.DIAMOND,
  };
}

function blockAllExcept(allowed: GridPlacement[]): GridPlacement[] {
  return ALL_DIAMOND_PLACEMENTS.filter((p) => !allowed.includes(p));
}

function pictograph(fields: Partial<PictographData>): PictographData {
  return fields as PictographData;
}

describe("buildCustomizeSummary — defaults", () => {
  it("reports Default for untouched production settings", () => {
    const summary = buildCustomizeSummary(inputFrom(PRODUCTION_STYLE_BASELINE));
    expect(summary.facts).toEqual([]);
    expect(summary.isDefault).toBe(true);
    expect(summary.accessibleSummary).toBe("Default");
  });

  it("reports Default for the public-demo baseline when it is injected", () => {
    const summary = buildCustomizeSummary(
      inputFrom(DEMO_BASELINE),
      DEMO_BASELINE
    );
    expect(summary.isDefault).toBe(true);
    expect(summary.facts).toEqual([]);
  });

  it("would call the untouched demo recipe non-default against production defaults", () => {
    // The reason the baseline seam exists: the demo's own starting recipe
    // differs from production on two axes.
    const summary = buildCustomizeSummary(inputFrom(DEMO_BASELINE));
    expect(summary.isDefault).toBe(false);
    expect(summary.facts).toEqual(["Hands: Smooth", "Dashes: Low"]);
  });

  it("treats a null and a 'mixed' dash filter as the same value", () => {
    const summary = buildCustomizeSummary(
      { ...inputFrom(PRODUCTION_STYLE_BASELINE), motionTypeFilter: null },
      { ...PRODUCTION_STYLE_BASELINE, motionTypeFilter: null }
    );
    expect(summary.facts).toEqual([]);
  });

  it("reports Default when there are no start/end options at all", () => {
    const summary = buildCustomizeSummary({
      constraintPreset: PRODUCTION_STYLE_BASELINE.constraintPreset,
      handPathMode: PRODUCTION_STYLE_BASELINE.handPathMode,
      motionTypeFilter: PRODUCTION_STYLE_BASELINE.motionTypeFilter,
      startEndOptions: null,
    });
    expect(summary.isDefault).toBe(true);
  });
});

describe("buildCustomizeSummary — style axes", () => {
  it("emits one fact per changed axis", () => {
    const summary = buildCustomizeSummary({
      ...inputFrom(PRODUCTION_STYLE_BASELINE),
      constraintPreset: "choppy",
      handPathMode: "smooth",
      motionTypeFilter: "prefer-dash",
    });
    expect(summary.facts).toEqual([
      "Props: Choppy",
      "Hands: Smooth",
      "Dashes: High",
    ]);
  });

  it("names the dash values Low and High, matching the style panel", () => {
    const low = buildCustomizeSummary({
      ...inputFrom(PRODUCTION_STYLE_BASELINE),
      motionTypeFilter: "no-dash",
    });
    expect(low.facts).toEqual(["Dashes: Low"]);
  });
});

describe("buildCustomizeSummary — start and end placements", () => {
  it("names the Classic 3 preset", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        blockedStartPlacements: blockAllExcept(CLASSIC_DIAMOND_PLACEMENTS),
      })
    );
    expect(summary.facts).toEqual(["Classic 3"]);
  });

  it("names the placement when exactly one is allowed", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        blockedStartPlacements: blockAllExcept([GridPlacement.BETA5]),
      })
    );
    expect(summary.facts).toEqual([`Start: ${GridPlacement.BETA5}`]);
  });

  it("counts a custom set instead of collapsing it to Custom", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        blockedStartPlacements: blockAllExcept([
          GridPlacement.ALPHA1,
          GridPlacement.ALPHA3,
          GridPlacement.BETA5,
          GridPlacement.GAMMA11,
        ]),
      })
    );
    expect(summary.facts).toEqual(["4 pos"]);
    expect(summary.isDefault).toBe(false);
  });

  it("keeps the deprecated exact start placement", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        startPlacement: pictograph({ startPlacement: GridPlacement.ALPHA3 }),
      })
    );
    expect(summary.facts).toEqual([`Start: ${GridPlacement.ALPHA3}`]);
  });

  it("keeps the end placement and falls back to its letter", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        endPlacement: pictograph({
          letter: "A" as unknown as PictographData["letter"],
        }),
      })
    );
    expect(summary.facts).toEqual(["End: A"]);
  });

  it("does not repeat an identical start fact from two sources", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        blockedStartPlacements: blockAllExcept([GridPlacement.BETA5]),
        startPlacement: pictograph({ startPlacement: GridPlacement.BETA5 }),
      })
    );
    expect(summary.facts).toEqual([`Start: ${GridPlacement.BETA5}`]);
  });
});

describe("buildCustomizeSummary — orientation and letters", () => {
  it("abbreviates non-default orientations", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        leftStartOrientation: Orientation.CLOCK,
        rightStartOrientation: Orientation.COUNTER,
      })
    );
    expect(summary.facts).toEqual(["Ori: CW/CCW"]);
  });

  it("stays silent on In/In", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        leftStartOrientation: Orientation.IN,
        rightStartOrientation: Orientation.IN,
      })
    );
    expect(summary.facts).toEqual([]);
  });

  it("never reports Default while letter constraints are active", () => {
    const summary = buildCustomizeSummary(
      inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        mustContainLetters: [
          "A",
          "B",
        ] as unknown as StartEndOptions["mustContainLetters"],
        mustNotContainLetters: [
          "C",
        ] as unknown as StartEndOptions["mustNotContainLetters"],
      })
    );
    expect(summary.isDefault).toBe(false);
    expect(summary.facts).toEqual(["Letters: +2 -1"]);
  });
});

describe("capSummaryFacts", () => {
  it("passes through when the facts fit", () => {
    expect(capSummaryFacts(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("spends the last row on the remainder count", () => {
    expect(capSummaryFacts(["a", "b", "c", "d", "e"])).toEqual([
      "a",
      "b",
      "+3 more",
    ]);
  });

  it("keeps a real fact visible at a one-row budget", () => {
    // A lone "+5 more" would be exactly the uninformative label this card
    // replaced.
    expect(capSummaryFacts(["a", "b", "c", "d", "e", "f"], 1)).toEqual([
      "a +5",
    ]);
    expect(capSummaryFacts(["a"], 1)).toEqual(["a"]);
  });

  it("returns nothing for an empty fact list", () => {
    expect(capSummaryFacts([], 1)).toEqual([]);
    expect(capSummaryFacts([])).toEqual([]);
  });
});

describe("summaryRowBudget", () => {
  it("matches the card heights measured at each viewport", () => {
    // 375x667 -> 64px card, 28px summary band.
    expect(summaryRowBudget(64)).toBe(1);
    // 960x412 -> 96px, 1440x900 -> 139px, 1920x1080 -> 141px.
    expect(summaryRowBudget(96)).toBe(3);
    expect(summaryRowBudget(139)).toBe(3);
    // The two-row rung between them.
    expect(summaryRowBudget(80)).toBe(2);
  });

  it("keeps the accessible summary complete while the card truncates", () => {
    const summary = buildCustomizeSummary({
      ...inputFrom(PRODUCTION_STYLE_BASELINE, {
        ...NO_CONSTRAINTS,
        blockedStartPlacements: blockAllExcept(CLASSIC_DIAMOND_PLACEMENTS),
        leftStartOrientation: Orientation.CLOCK,
      }),
      constraintPreset: "choppy",
      handPathMode: "smooth",
      motionTypeFilter: "prefer-dash",
    });
    expect(summary.facts).toEqual([
      "Props: Choppy",
      "Hands: Smooth",
      "Dashes: High",
      "Classic 3",
      "Ori: CW/In",
    ]);
    expect(capSummaryFacts(summary.facts)).toEqual([
      "Props: Choppy",
      "Hands: Smooth",
      "+3 more",
    ]);
    expect(summary.accessibleSummary).toBe(
      "Props: Choppy, Hands: Smooth, Dashes: High, Classic 3, Ori: CW/In"
    );
  });
});

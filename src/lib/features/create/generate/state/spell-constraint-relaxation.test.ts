import { describe, expect, it } from "vitest";
import {
  planSpellRelaxations,
  spellSettingsConstrain,
} from "./spell-constraint-relaxation";

describe("planSpellRelaxations", () => {
  it("makes no retries when everything is free", () => {
    expect(planSpellRelaxations(undefined)).toEqual([]);
    expect(
      planSpellRelaxations({
        handRelationship: "free",
        propRelationship: "free",
        matchHandTurns: false,
      })
    ).toEqual([]);
    expect(spellSettingsConstrain({ handRelationship: "free" })).toBe(false);
  });

  it("frees Hands only when Hands is the only pinned setting", () => {
    const plan = planSpellRelaxations({ handRelationship: "QS" });
    expect(plan.map((a) => a.relaxed)).toEqual(["hands"]);
    expect(plan[0]!.overrides).toEqual({ handRelationship: "free" });
  });

  it("keeps Props and match turns on the first retry, then frees both", () => {
    const plan = planSpellRelaxations({
      handRelationship: "QS",
      propRelationship: "SO",
      matchHandTurns: true,
    });
    expect(plan.map((a) => a.relaxed)).toEqual(["hands", "handsAndProps"]);
    expect(plan[0]!.overrides.propRelationship).toBeUndefined();
    expect(plan[1]!.overrides).toEqual({
      handRelationship: "free",
      propRelationship: "free",
      matchHandTurns: false,
    });
  });

  it("skips the Hands step when Hands is already free and Props is set", () => {
    const plan = planSpellRelaxations({
      handRelationship: "free",
      propRelationship: "SO",
    });
    expect(plan.map((a) => a.relaxed)).toEqual(["props"]);
  });

  it("names match-hand-turns when it is the only restriction", () => {
    const plan = planSpellRelaxations({ matchHandTurns: true });
    expect(plan.map((a) => a.relaxed)).toEqual(["matchHandTurns"]);
  });
});

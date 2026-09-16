import { describe, it, expect } from "vitest";
import { groupRuleFilters } from "$lib/shared/browse/services/filter-rule-groups";

function chip(key: string, type: string, label: string) {
  return { key, type, label, chipColor: "#fff" };
}

describe("groupRuleFilters", () => {
  it("groups by category in first-appearance order with category labels", () => {
    const groups = groupRuleFilters([
      chip("startPlacement:alpha", "startPlacement", "Alpha"),
      chip("difficulty:1", "difficulty", "Level 1"),
      chip("startPlacement:beta", "startPlacement", "Beta"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Start", "Level"]);
    expect(groups[0]!.chips.map((c) => c.label)).toEqual(["Alpha", "Beta"]);
  });

  it("trims the category word off chip display labels that repeat it", () => {
    const groups = groupRuleFilters([
      chip("difficulty:2", "difficulty", "Level 2"),
      chip("startPlacement:alpha", "startPlacement", "Alpha"),
    ]);
    expect(groups[0]!.chips[0]!.displayLabel).toBe("2");
    expect(groups[0]!.chips[0]!.label).toBe("Level 2");
    expect(groups[1]!.chips[0]!.displayLabel).toBe("Alpha");
  });

  it('OR-stacking categories read "or"; single-value groups carry no word', () => {
    const groups = groupRuleFilters([
      chip("startPlacement:alpha", "startPlacement", "Alpha"),
      chip("startPlacement:beta", "startPlacement", "Beta"),
      chip("difficulty:1", "difficulty", "Level 1"),
    ]);
    expect(groups[0]!.connectiveWord).toBe("or");
    expect(groups[1]!.connectiveWord).toBeNull();
  });

  it("connective-bearing categories follow the passed connective, defaulting to any/or", () => {
    const filters = [
      chip("cap_type:component:mirrored", "cap_type", "Mirrored"),
      chip("cap_type:component:swapped", "cap_type", "Swapped"),
    ];
    expect(groupRuleFilters(filters)[0]!.connectiveWord).toBe("or");
    expect(
      groupRuleFilters(filters, { cap_type: "all" })[0]!.connectiveWord
    ).toBe("and");
  });
});

import { describe, expect, it } from "vitest";
import { insertCodexGroup } from "./codex-navigation";

describe("Atlas codex navigation", () => {
  const codex = { key: "codex" };
  it("inserts the codex after the placement category without mutating the glossary", () => {
    const groups = [
      { key: "motion" },
      { key: "placement" },
      { key: "orientation" },
    ];
    expect(insertCodexGroup(groups, codex).map((group) => group.key)).toEqual([
      "motion",
      "placement",
      "codex",
      "orientation",
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "motion",
      "placement",
      "orientation",
    ]);
  });
  it("puts the codex first when filtered results have no placements", () => {
    expect(insertCodexGroup([{ key: "motion" }], codex)).toEqual([
      codex,
      { key: "motion" },
    ]);
    expect(insertCodexGroup([], codex)).toEqual([codex]);
  });
});

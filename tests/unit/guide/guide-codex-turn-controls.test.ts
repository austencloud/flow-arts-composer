import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    "src/routes/(public)/guide/level-1/_components/GuideCodexControls.svelte"
  ),
  "utf8"
);
const controls = [...source.matchAll(/<PropTurnsControl\b[\s\S]*?\/>/g)].map(
  (match) => match[0]
);

describe("Guide Codex turn control hand wiring", () => {
  // A missing hand makes both controls announce "right" and drops their tones,
  // even though their separate turn callbacks still change the correct values.
  it.each([
    { index: 0, hand: "left", side: "LEFT" },
    { index: 1, hand: "right", side: "RIGHT" },
  ])(
    "labels the $hand control for the hand its buttons change",
    ({ index, hand, side }) => {
      expect(controls).toHaveLength(2);
      const control = controls[index];
      expect(control).toContain(`hand="${hand}"`);
      expect(control).toContain(`turns={codex.${hand}Turns}`);
      expect(control).toContain(`codex.adjustTurns(HandSide.${side}, delta)`);
    }
  );
});

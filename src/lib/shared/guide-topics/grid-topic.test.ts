import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import {
  GRID_OVERVIEW_CALLOUTS,
  GRID_TOPIC_UNITS,
  calloutLabel,
  calloutLineStart,
  gridTopicText,
} from "./grid-topic";

const english = en as Record<string, string>;

describe("Grid topic record", () => {
  it("resolves every unit to an English message", () => {
    for (const [unit, key] of Object.entries(GRID_TOPIC_UNITS)) {
      expect(english[key], `${unit} -> ${key}`).toBeTruthy();
    }
  });

  it("carries Austen's verbatim point definitions", () => {
    expect(gridTopicText("centerPoint")).toBe(
      "The <strong>center point</strong> is the hub that everything revolves around."
    );
    expect(gridTopicText("handPoints")).toBe(
      "The four <strong>hand points</strong> are halfway between the center point and the outer points."
    );
    expect(gridTopicText("outerPoints")).toBe(
      "The <strong>outer points</strong> depict the outer edges of the grid."
    );
  });

  it("splits the guide's point paragraph without changing a word", () => {
    const paragraph = english.verified_level1_grid_points
      .replace(/<br\s*\/?>/g, " ")
      .replace(/\s+/g, " ");
    for (const unit of ["centerPoint", "handPoints", "outerPoints"] as const) {
      expect(paragraph).toContain(gridTopicText(unit));
    }
  });

  it("labels each callout with the sheet's own words", () => {
    expect(GRID_OVERVIEW_CALLOUTS.map(calloutLabel)).toEqual([
      "center point",
      "hand points",
      "outer points",
    ]);
  });

  it("starts each callout line just off its grid point, toward the label", () => {
    for (const callout of GRID_OVERVIEW_CALLOUTS) {
      const start = calloutLineStart(callout);
      expect(
        Math.hypot(start.x - callout.anchor.x, start.y - callout.anchor.y)
      ).toBeCloseTo(26, 5);
      expect(
        Math.hypot(callout.lineEnd.x - start.x, callout.lineEnd.y - start.y)
      ).toBeLessThan(
        Math.hypot(
          callout.lineEnd.x - callout.anchor.x,
          callout.lineEnd.y - callout.anchor.y
        )
      );
    }
  });
});

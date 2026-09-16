import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { buildDoubleFloatOptionRows } from "../services/double-float-option-groups";

vi.mock("./OptionCard.svelte", async () => ({
  default: (await import("./DoubleFloatOptionRowsPreviewTestStub.svelte"))
    .default,
}));

import DoubleFloatOptionRows from "./DoubleFloatOptionRows.svelte";

function floatMotion(start: string, end: string): MotionData {
  return {
    motionType: MotionType.FLOAT,
    turns: "fl",
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: start,
    endLocation: end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.CLOCK,
  } as MotionData;
}

function option(
  letter: string,
  endPlacement: string,
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
  id = `${letter}-${endPlacement}`
): PictographData {
  return {
    id,
    letter: letter as PictographData["letter"],
    startPlacement: "gamma3" as PictographData["startPlacement"],
    endPlacement: endPlacement as PictographData["endPlacement"],
    motions: {
      left: floatMotion(leftStart, leftEnd),
      right: floatMotion(rightStart, rightEnd),
    },
  };
}

const options = [
  option("M", "gamma13", "n", "e", "e", "n"),
  option("P", "gamma5", "s", "w", "w", "s"),
  option("S", "gamma5", "n", "e", "e", "s", "S-upper"),
  option("S", "gamma13", "s", "w", "w", "n", "S-lower"),
];

describe("DoubleFloatOptionRows", () => {
  it.each([
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
    [1440, 900],
    [820, 1180],
    [960, 412],
    [375, 667],
  ])(
    "keeps four equal pictographs in one row when the container fits at %ix%i",
    async (width, height) => {
      await page.viewport(width, height);
      const rows = buildDoubleFloatOptionRows(options);
      expect(rows).not.toBeNull();
      const onSelect = vi.fn();
      document.body.style.backgroundColor = "#07111f";

      render(DoubleFloatOptionRows, {
        rows: rows!,
        previewSize: 80,
        onSelect,
      });

      const cards = document.querySelectorAll<HTMLElement>(".float-path-slot");
      expect(cards).toHaveLength(4);
      for (const card of cards) {
        expect(card.clientWidth).toBe(80);
        expect(card.clientHeight).toBe(80);
      }
      if (width >= 520) {
        expect(new Set([...cards].map((card) => card.offsetTop)).size).toBe(1);
      }

      expect(document.body.textContent).toContain("QO");
      expect(document.body.textContent).toContain("QS");
      expect(document.body.textContent).not.toContain("Quarter-Opposite");
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);

      await page
        .getByRole("button", { name: "Add M. Hold to preview." })
        .click();
      expect(onSelect).toHaveBeenCalledWith(options[0], 0);
      await expectNoA11yViolations();
    }
  );
});

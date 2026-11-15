import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import HandsStartDrawing from "./HandsStartDrawing.svelte";

const HAND_CENTRES = {
  apart: { blue: [11.9, 20], red: [28.1, 20] },
  together: { blue: [17.3, 11.9], red: [22.7, 11.9] },
  adjacent: { blue: [11.9, 20], red: [20, 11.9] },
} as const;

function hand(container: HTMLElement, colour: "blue" | "red") {
  const circle = container.querySelector(`[data-hand="${colour}"]`);
  return [
    Number(circle?.getAttribute("cx")),
    Number(circle?.getAttribute("cy")),
  ];
}

describe("HandsStartDrawing", () => {
  for (const kind of ["apart", "together", "adjacent"] as const) {
    it(`draws two hands for ${kind} at their start points`, () => {
      const { container } = render(HandsStartDrawing, {
        kind,
        gridMode: GridMode.DIAMOND,
      });
      expect(container.querySelectorAll(".hand")).toHaveLength(2);
      expect(hand(container, "blue")).toEqual(HAND_CENTRES[kind].blue);
      expect(hand(container, "red")).toEqual(HAND_CENTRES[kind].red);
      expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true"
      );
      expect(container.querySelector("g")?.hasAttribute("transform")).toBe(
        false
      );
    });
  }

  it("turns the drawing 45 degrees in box mode", () => {
    const { container } = render(HandsStartDrawing, {
      kind: "apart",
      gridMode: GridMode.BOX,
    });
    expect(container.querySelector("g")?.getAttribute("transform")).toBe(
      "rotate(45 20 20)"
    );
  });
});

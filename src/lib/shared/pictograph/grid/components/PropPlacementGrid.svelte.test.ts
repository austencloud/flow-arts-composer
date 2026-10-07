import { commands, page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
// Type-only: pulls in the BrowserCommands augmentation without bundling the
// node-side command implementation into the browser.
import type {} from "$test-helpers/browser-commands/real-touch";

vi.mock(
  "$lib/shared/pictograph/shared/components/PictographContainer.svelte",
  async () => ({
    default: (await import("./PropPlacementGridTestRenderer.svelte")).default,
  })
);

import PropPlacementGrid from "./PropPlacementGrid.svelte";
import { getGridJoinLayout, toJoinedHandPoint } from "@tka/render-core";
import { getPlacementGridPoints } from "$lib/shared/pictograph/grid/services/placement-grid-points";
import {
  calculateBetaOffset,
  type BetaMotionInput,
} from "$lib/shared/render/core/calculations/beta-offset";

/** A staff parked at east, which is what the beta test renders. */
function betaMotion(color: HandSide): BetaMotionInput {
  return {
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.EAST,
    endOrientation: Orientation.IN,
    motionType: "static",
    hand: color,
    propType: PropType.STAFF,
  };
}

describe("PropPlacementGrid", () => {
  it("keeps the source notation while placement owns the live locations", async () => {
    const previewPictographData = createStepData({
      id: "start-preview",
      stepNumber: 0,
      letter: "A",
      gridMode: GridMode.SKEWED,
      motions: {
        left: createMotionData({
          hand: HandSide.LEFT,
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: GridLocation.SOUTH,
          endLocation: GridLocation.SOUTH,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
          isVisible: true,
        }),
        right: createMotionData({
          hand: HandSide.RIGHT,
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: GridLocation.SOUTHWEST,
          endLocation: GridLocation.SOUTHWEST,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          turns: 0,
          propType: PropType.STAFF,
          isVisible: true,
        }),
      },
    });

    render(PropPlacementGrid, {
      gridMode: GridMode.SKEWED,
      initialLeftLocation: GridLocation.SOUTH,
      initialRightLocation: GridLocation.SOUTHWEST,
      previewPictographData,
      editAfterCompletion: true,
    });

    const preview = page.getByTestId("placement-pictograph");
    await expect.element(preview).toHaveAttribute("data-letter", "A");
    await expect.element(preview).toHaveAttribute("data-step-number", "0");
    await expect
      .element(preview)
      .toHaveAttribute("data-grid-mode", GridMode.SKEWED);

    await page.getByRole("button", { name: "Move left prop" }).click();
    await page.getByRole("button", { name: "West point", exact: true }).click();

    await expect
      .element(preview)
      .toHaveAttribute("data-blue-location", GridLocation.WEST);
    await expect.element(preview).toHaveAttribute("data-letter", "A");
    await expect.element(preview).toHaveAttribute("data-step-number", "0");
  });

  it("places blue then red and permits a shared point", async () => {
    const onChange = vi.fn();
    const onPlacementComplete = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      leftPropType: PropType.TORCH,
      rightPropType: PropType.BIGTORCH,
      onChange,
      onPlacementComplete,
    });

    await expect
      .element(page.getByTestId("placement-prompt"))
      .toHaveTextContent("Place the left prop");

    await page.getByRole("button", { name: "East point" }).click();
    expect(onChange).toHaveBeenLastCalledWith({
      leftLocation: GridLocation.EAST,
      rightLocation: null,
      activeHand: "red",
      complete: false,
      canUndo: true,
    });
    await expect
      .element(page.getByTestId("placement-prompt"))
      .toHaveTextContent("Place the right prop");

    await page.getByRole("button", { name: "East point (left prop)" }).click();
    expect(onPlacementComplete).toHaveBeenCalledWith(
      GridLocation.EAST,
      GridLocation.EAST
    );
    await expect
      .element(page.getByTestId("placement-prompt"))
      .toHaveTextContent("Position ready");
  });

  it("edits either prop after completion and restores one placement with Undo", async () => {
    const onChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      initialLeftLocation: GridLocation.EAST,
      initialRightLocation: GridLocation.WEST,
      editAfterCompletion: true,
      onChange,
    });

    await page.getByRole("button", { name: "Move right prop" }).click();
    await page.getByRole("button", { name: "North point" }).click();
    expect(onChange).toHaveBeenLastCalledWith({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.NORTH,
      activeHand: null,
      complete: true,
      canUndo: true,
    });

    await page.getByRole("button", { name: "Undo placement" }).click();
    expect(onChange).toHaveBeenLastCalledWith({
      leftLocation: GridLocation.EAST,
      rightLocation: GridLocation.WEST,
      activeHand: "red",
      complete: true,
      // The undo just consumed the only entry in the history.
      canUndo: false,
    });
  });

  it("commits a dragged aim under REAL touch input (regression: gesture-arbitration pointercancel)", async () => {
    // Real CDP touch, not dispatchEvent: the 2026-07-29 bug was Chromium
    // stealing the drag with a `pointercancel` (touch-action: none on the SVG
    // circle is not honoured; it must sit on the HTML .grid-wrapper). A
    // synthetic-event version of this test passes even with the bug present.
    const onOrientationChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      onOrientationChange,
    });

    const north = page.getByRole("button", { name: "North point" });
    const rect = (north.element() as SVGCircleElement).getBoundingClientRect();
    const from = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    // Drag away from center (north) — for the North point that renders as OUT,
    // which differs from the default IN, so a commit is observable.
    await commands.dispatchRealTouchDrag(from, { x: from.x, y: from.y - 80 });

    expect(onOrientationChange).toHaveBeenCalledWith(
      HandSide.LEFT,
      Orientation.OUT
    );
  });

  it("re-aims a prop from an already-complete position", async () => {
    const onOrientationChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      initialLeftLocation: GridLocation.EAST,
      initialRightLocation: GridLocation.WEST,
      betaSwapped: true,
      editAfterCompletion: true,
      renderTray: false,
      hitTargetRadius: 160,
      onOrientationChange,
    });

    await expect
      .element(page.getByTestId("placement-prompt"))
      .toHaveTextContent("Drag a prop to aim it");
    await expect
      .element(page.getByTestId("placement-pictograph"))
      .toHaveAttribute("data-beta-swapped", "true");

    const east = page.getByRole("button", {
      name: "East point (left prop)",
    });
    expect((east.element() as SVGCircleElement).getAttribute("r")).toBe("160");
    const rect = (east.element() as SVGCircleElement).getBoundingClientRect();
    const from = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    await commands.dispatchRealTouchDrag(from, {
      x: from.x + 80,
      y: from.y,
    });

    expect(onOrientationChange).toHaveBeenCalledWith(
      HandSide.LEFT,
      Orientation.OUT
    );
  });

  it("grabs the red prop when beta puts both props on one point", async () => {
    // Regression: the press used to resolve by grid point, and blue always
    // matched first — so in beta the red prop could not be grabbed at all.
    const onOrientationChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      initialLeftLocation: GridLocation.EAST,
      initialRightLocation: GridLocation.EAST,
      editAfterCompletion: true,
      renderTray: false,
      hitTargetRadius: 160,
      onOrientationChange,
    });

    const east = page.getByRole("button", {
      name: "East point (left prop) (right prop)",
    });
    const target = east.element() as SVGCircleElement;
    const rect = target.getBoundingClientRect();
    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    // The same beta offset the renderer uses, converted to screen pixels via
    // the overlay's 950-unit viewBox. Pressing on the red prop's side of the
    // shared point must reach red.
    const overlay = target.ownerSVGElement as SVGSVGElement;
    const scale = overlay.getBoundingClientRect().width / 950;
    const redOffset = calculateBetaOffset(
      {
        leftMotion: betaMotion(HandSide.LEFT),
        rightMotion: betaMotion(HandSide.RIGHT),
        letter: "",
        gridMode: "diamond",
      },
      betaMotion(HandSide.RIGHT)
    );
    expect(redOffset.x !== 0 || redOffset.y !== 0).toBe(true);

    const from = {
      x: center.x + redOffset.x * scale,
      y: center.y + redOffset.y * scale,
    };
    await commands.dispatchRealTouchDrag(from, { x: from.x + 90, y: from.y });

    expect(onOrientationChange).toHaveBeenCalledWith(
      HandSide.RIGHT,
      expect.any(String)
    );
    expect(onOrientationChange).not.toHaveBeenCalledWith(
      HandSide.LEFT,
      expect.any(String)
    );
  });

  it("supports keyboard placement on the Box grid", async () => {
    const onChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.BOX,
      onChange,
    });

    const northeast = page.getByRole("button", {
      name: "Northeast point",
    });
    const element = northeast.element() as SVGCircleElement;
    element.focus();
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    expect(onChange).toHaveBeenLastCalledWith({
      leftLocation: GridLocation.NORTHEAST,
      rightLocation: null,
      activeHand: "red",
      complete: false,
      canUndo: true,
    });
  });

  it("offers merged and center placement with center-safe aiming", async () => {
    const onOrientationChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.SKEWED,
      showCenter: true,
      onOrientationChange,
    });

    expect(document.querySelectorAll(".click-target")).toHaveLength(9);
    await page.getByRole("button", { name: "Center point" }).click();

    expect(onOrientationChange).toHaveBeenCalledWith(
      HandSide.LEFT,
      Orientation.CENTER_N
    );
  });

  it("places and aims each hand on its own grid when the sequence is joined", async () => {
    const join = { toward: "e", steps: 1 } as const;
    const layout = getGridJoinLayout(join, GridMode.DIAMOND);
    const points = getPlacementGridPoints(GridMode.DIAMOND);
    const onGrid = (hand: HandSide, location: GridLocation) =>
      toJoinedHandPoint(
        layout,
        hand,
        points.find((point) => point.location === location)!
      );
    const onChange = vi.fn();
    const onOrientationChange = vi.fn();
    render(PropPlacementGrid, {
      gridMode: GridMode.DIAMOND,
      initialLeftLocation: GridLocation.NORTH,
      initialRightLocation: GridLocation.NORTH,
      editAfterCompletion: true,
      hitTargetRadius: 60,
      gridJoin: join,
      onChange,
      onOrientationChange,
    });

    await expect
      .element(page.getByTestId("placement-pictograph"))
      .toHaveAttribute("data-join", "e1");

    // A finished position offers each prop on its own grid: two north points,
    // not one shared beta point.
    expect(document.querySelectorAll(".click-target")).toHaveLength(2);
    for (const [hand, noun] of [
      [HandSide.LEFT, "left prop"],
      [HandSide.RIGHT, "right prop"],
    ] as const) {
      const target = page
        .getByRole("button", { name: `North point (${noun})`, exact: true })
        .element() as SVGCircleElement;
      const expected = onGrid(hand, GridLocation.NORTH);
      expect(Number(target.getAttribute("cx"))).toBeCloseTo(expected.x, 6);
      expect(Number(target.getAttribute("cy"))).toBeCloseTo(expected.y, 6);
      expect(Number(target.getAttribute("r"))).toBeCloseTo(
        60 * layout.scale,
        6
      );
    }

    // Dragging red's target aims red, read from red's own point.
    const red = page.getByRole("button", {
      name: "North point (right prop)",
      exact: true,
    });
    const rect = (red.element() as SVGCircleElement).getBoundingClientRect();
    const from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await commands.dispatchRealTouchDrag(from, { x: from.x, y: from.y - 80 });
    expect(onOrientationChange).toHaveBeenCalledWith(
      HandSide.RIGHT,
      Orientation.OUT
    );
    expect(onOrientationChange).not.toHaveBeenCalledWith(
      HandSide.LEFT,
      expect.any(String)
    );

    // Moving blue offers blue's grid only, and the tap lands blue there.
    await page.getByRole("button", { name: "Move left prop" }).click();
    expect(document.querySelectorAll(".click-target")).toHaveLength(4);
    const east = page
      .getByRole("button", { name: "East point", exact: true })
      .element() as SVGCircleElement;
    const blueEast = onGrid(HandSide.LEFT, GridLocation.EAST);
    expect(Number(east.getAttribute("cx"))).toBeCloseTo(blueEast.x, 6);
    expect(Number(east.getAttribute("cy"))).toBeCloseTo(blueEast.y, 6);
    await page.getByRole("button", { name: "East point", exact: true }).click();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        leftLocation: GridLocation.EAST,
        rightLocation: GridLocation.NORTH,
        complete: true,
      })
    );
  });
});

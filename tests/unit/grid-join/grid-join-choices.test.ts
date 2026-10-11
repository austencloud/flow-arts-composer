/**
 * The join choices both grid-join controls offer (the right-click submenu and
 * the viewer's Grids section): which directions a grid mode offers, and what
 * reads as chosen.
 */

import { describe, expect, it } from "vitest";
import {
  gridJoinSelection,
  offeredGridJoinDirections,
} from "#lib/shared/grid-join/grid-join-choices.js";

const towards = (gridMode: string | null | undefined) =>
  offeredGridJoinDirections(gridMode).map((choice) => choice.toward);

describe("offeredGridJoinDirections", () => {
  it("offers the straight directions on a diamond grid", () => {
    expect(towards("diamond")).toEqual(["e", "w", "n", "s"]);
  });

  it("offers the diagonals on a box grid", () => {
    expect(towards("box")).toEqual(["ne", "se", "sw", "nw"]);
  });

  it("treats an unknown grid mode as diamond", () => {
    expect(towards(undefined)).toEqual(["e", "w", "n", "s"]);
  });
});

describe("gridJoinSelection", () => {
  it("reads one grid as no current join, keeping the default for a later pick", () => {
    expect(gridJoinSelection(null, "diamond")).toEqual({
      current: null,
      toward: "e",
      steps: 1,
    });
  });

  it("keeps a join that lies on the grid's lines", () => {
    const selection = gridJoinSelection({ toward: "s", steps: 2 }, "diamond");
    expect(selection.current).toEqual({ toward: "s", steps: 2 });
    expect(selection).toMatchObject({ toward: "s", steps: 2 });
  });

  it("reads a join off the grid's lines as drawn: turned onto them", () => {
    const selection = gridJoinSelection({ toward: "ne", steps: 1 }, "diamond");
    expect(offeredGridJoinDirections("diamond").map((d) => d.toward)).toContain(
      selection.current!.toward
    );
    expect(selection.current!.steps).toBe(1);
  });

  it("starts a box grid's later pick from a diagonal", () => {
    const { current, toward } = gridJoinSelection(null, "box");
    expect(current).toBeNull();
    expect(towards("box")).toContain(toward);
  });
});

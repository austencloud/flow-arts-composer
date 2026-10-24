import { describe, expect, it } from "vitest";
import {
  codexLayoutMode,
  fullBoardCell,
  typeTileGrid,
  typeCellGrid,
  MIN_FULL_BOARD_CELL,
} from "./codex-fit";

const at = (viewportWidth: number, viewportHeight: number) => ({
  viewportWidth,
  viewportHeight,
  siteHeaderHeight: 64,
  remPx: 16,
});

describe("codexLayoutMode", () => {
  it.each([
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ])("shows the full board at %i by %i", (w, h) => {
    expect(fullBoardCell(at(w, h))).toBeGreaterThanOrEqual(MIN_FULL_BOARD_CELL);
    expect(codexLayoutMode(at(w, h))).toBe("full-board");
  });

  it.each([
    [1366, 768],
    [1280, 720],
    [1536, 864],
    [823, 600],
    [707, 772],
    [412, 915],
    [360, 640],
  ])("drills down at %i by %i", (w, h) => {
    expect(codexLayoutMode(at(w, h))).toBe("drill-down");
  });

  it("gives 1080p a cell near 96 px", () => {
    expect(fullBoardCell(at(1920, 1080))).toBeGreaterThanOrEqual(90);
  });
});

describe("typeTileGrid", () => {
  it("stacks two across on a portrait phone", () => {
    expect(typeTileGrid(344, 408, 12)).toEqual({ columns: 2, rows: 3 });
  });
  it("lays three across on the Fold's landscape inner screen", () => {
    expect(typeTileGrid(791, 360, 12)).toEqual({ columns: 3, rows: 2 });
  });
});

describe("typeCellGrid", () => {
  it("lays Type 1's 22 letters five across on a 360 by 640 phone", () => {
    const grid = typeCellGrid(22, 336, 470, 10, 16);
    expect(grid?.columns).toBe(5);
    expect(grid?.rows).toBe(5);
    expect(grid?.cell).toBe(59);
  });
  it("lays a three-letter type in one row when the area is wide", () => {
    expect(typeCellGrid(3, 1200, 500, 10, 16)?.columns).toBe(3);
  });
  it("stops at the cap", () => {
    expect(typeCellGrid(3, 3000, 3000, 10, 16, 320)?.cell).toBe(320);
  });
  it("gives nothing for an unmeasured area", () => {
    expect(typeCellGrid(8, 0, 400, 10, 16)).toBeNull();
  });
});

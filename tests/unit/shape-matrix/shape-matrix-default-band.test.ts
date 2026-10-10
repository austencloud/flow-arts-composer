/**
 * The Matrix opens on one level and turn band. The Create front door's Shape
 * preview shows that same corner, so both read the band from one place.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  matrixTurnsForLevel,
  SHAPE_MATRIX_DEFAULT_LEVEL,
  SHAPE_MATRIX_DEFAULT_TURN,
} from "#lib/shared/shape-matrix/domain/matrix-turn-band.js";
import { readShapeMatrixRouteState } from "../../../src/routes/(public)/shape-engine/_state/shape-matrix-url";

describe("Shape Matrix default band", () => {
  it("is a turn the default level offers", () => {
    expect(matrixTurnsForLevel(SHAPE_MATRIX_DEFAULT_LEVEL)).toContain(
      SHAPE_MATRIX_DEFAULT_TURN
    );
  });

  it("is what the Matrix app opens on", () => {
    const app = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/shape-matrix/app/ShapeMatrixApp.svelte"
      ),
      "utf8"
    );
    expect(app).toMatch(/level: SHAPE_MATRIX_DEFAULT_LEVEL,/);
    expect(app).toMatch(/leftTurn: SHAPE_MATRIX_DEFAULT_TURN,/);
    expect(app).toMatch(/rightTurn: SHAPE_MATRIX_DEFAULT_TURN,/);
  });

  it("is what a share link falls back to when it names no level or turn", () => {
    const state = readShapeMatrixRouteState("?labels=ratios");
    expect(state.level).toBe(SHAPE_MATRIX_DEFAULT_LEVEL);
    expect(state.leftTurn).toBe(SHAPE_MATRIX_DEFAULT_TURN);
    expect(state.rightTurn).toBe(SHAPE_MATRIX_DEFAULT_TURN);
  });

  it("is read by the URL reader instead of a second literal", () => {
    const reader = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/(public)/shape-engine/_state/shape-matrix-url.ts"
      ),
      "utf8"
    );
    expect(reader).toMatch(/: SHAPE_MATRIX_DEFAULT_LEVEL;/);
    expect(reader).toMatch(/: SHAPE_MATRIX_DEFAULT_TURN;/);
  });
});

import { describe, expect, it } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { codexData } from "./codex-groups";
import {
  defaultCodexVisibility,
  formatCodexTransforms,
  parseCodexTransforms,
  restoreCodexVisibility,
  transformCodexPictograph,
} from "./codex-view";

describe("codex board view", () => {
  it("round-trips transforms through the URL in press order", () => {
    const ops = parseCodexTransforms("rmsx");
    expect(ops).toEqual(["rotate", "mirror", "swap"]);
    expect(formatCodexTransforms(ops)).toBe("rms");
    expect(formatCodexTransforms([])).toBeNull();
    expect(parseCodexTransforms("r".repeat(40))).toHaveLength(16);
  });

  it("restores saved layers and ignores damaged entries", () => {
    expect(restoreCodexVisibility(null)).toEqual(defaultCodexVisibility());
    expect(restoreCodexVisibility("{nope")).toEqual(defaultCodexVisibility());
    expect(
      restoreCodexVisibility(JSON.stringify({ showGlyph: true, showGrid: 3 }))
    ).toEqual({ ...defaultCodexVisibility(), showGlyph: true });
  });

  it("rotates a cell into the other grid and back after eight presses", () => {
    const a = codexData("A-0")!;
    const once = transformCodexPictograph(a, ["rotate"]);
    expect(once.motions[HandSide.LEFT]?.gridMode).toBe(GridMode.BOX);

    const full = transformCodexPictograph(a, Array(8).fill("rotate"));
    expect(full.motions[HandSide.LEFT]?.startLocation).toBe(
      a.motions[HandSide.LEFT]?.startLocation
    );
    expect(full.motions[HandSide.LEFT]?.gridMode).toBe(GridMode.DIAMOND);
  });
});

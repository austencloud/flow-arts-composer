import { describe, expect, it } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { TnDMode } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { PictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { propPlacer } from "#lib/shared/pictograph/prop/services/prop-placer.js";
import { editGridTurn } from "#lib/shared/pictograph/shared/services/pictograph-edit-travel.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import { calculateTnD } from "#lib/shared/pictograph/shared/domain/utils/tnd-calculator.js";
import { codexData } from "./codex-groups";
import { transformCodexPictograph } from "./codex-view";

// A Codex rotate moves the hands to the other grid's points, so the
// pictograph's own grid mode has to move with them: the preparer draws the
// grid from it and the grid's turn is read from it.

const stubArrowManager = {
  coordinateArrowLifecycle: async () => ({
    positions: {},
    assets: {},
    mirroring: {},
  }),
} as never;

const stubPropLoader = {
  loadPropSvg: async () => ({
    svgData: {
      svgContent: "<svg />",
      viewBox: { width: 100, height: 100 },
      center: { x: 50, y: 50 },
    },
  }),
} as never;

function preparer() {
  return new PictographPreparer(stubArrowManager, stubPropLoader, propPlacer);
}

describe("Codex rotate and the grid", () => {
  it("prepares a rotated cell on the box grid and back on diamond", async () => {
    const a = codexData("A-0")!;
    const once = await preparer().prepareSingle(
      transformCodexPictograph(a, ["rotate"])
    );
    expect(once._prepared!.gridMode).toBe(GridMode.BOX);

    const twice = await preparer().prepareSingle(
      transformCodexPictograph(a, ["rotate", "rotate"])
    );
    expect(twice._prepared!.gridMode).toBe(GridMode.DIAMOND);
  });

  it("never reuses a drawing prepared for the same hands on another grid", async () => {
    // The explorer's box tile shares its hands with the rotated board cell;
    // a cell carrying a stale diamond mode must not hand it a diamond grid.
    const shared = preparer();
    const rotated = transformCodexPictograph(codexData("A-0")!, ["rotate"]);
    const stale = await shared.prepareSingle({
      ...rotated,
      gridMode: GridMode.DIAMOND,
    });
    const box = await shared.prepareSingle(rotated);
    expect(stale._prepared!.gridMode).toBe(GridMode.DIAMOND);
    expect(box._prepared!.gridMode).toBe(GridMode.BOX);
  });

  it("turns the grid 45 degrees the way the press turns the hands", () => {
    const a = codexData("A-0")!;
    expect(
      editGridTurn(a, transformCodexPictograph(a, ["rotate"]), {
        kind: "rotate",
        direction: "clockwise",
        steps: 1,
      })
    ).toEqual({ from: 0, to: 45 });
    expect(
      editGridTurn(a, transformCodexPictograph(a, ["rotate-ccw"]), {
        kind: "rotate",
        direction: "counterclockwise",
        steps: 1,
      })
    ).toEqual({ from: 0, to: -45 });
  });

  it("names a rotated letter's timing from its own grid's table", () => {
    // Box D is Quarter-Opposite in the canonical table (tnd-calculator's
    // BOX_MODE_MAP); diamond D at beta3 is Split-Opposite. The timing comes
    // from the hands' geometry, so it changes with the grid on purpose and
    // does not depend on the pictograph's gridMode field.
    const d = codexData("D-0")!;
    expect(deriveTnDFromPictograph(d).tndMode).toBe(TnDMode.SPLIT_OPP);

    const rotated = transformCodexPictograph(d, ["rotate"]);
    const boxTable = calculateTnD(
      "D" as Letter,
      GridMode.BOX,
      rotated.startPlacement!
    ).tndMode;
    expect(boxTable).toBe(TnDMode.QUARTER_OPP);
    expect(deriveTnDFromPictograph(rotated).tndMode).toBe(boxTable);
    expect(
      deriveTnDFromPictograph({ ...rotated, gridMode: GridMode.DIAMOND })
        .tndMode
    ).toBe(boxTable);

    const back = transformCodexPictograph(d, ["rotate", "rotate-ccw"]);
    expect(deriveTnDFromPictograph(back).tndMode).toBe(TnDMode.SPLIT_OPP);
  });
});

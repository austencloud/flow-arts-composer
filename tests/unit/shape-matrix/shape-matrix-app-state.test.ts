import { describe, expect, it, vi } from "vitest";

const { requestShapeMatrixTransition } = vi.hoisted(() => ({
  requestShapeMatrixTransition: vi.fn(),
}));

vi.mock(
  "$lib/shared/shape-matrix/debug/shape-matrix-transition-recorder",
  () => ({ requestShapeMatrixTransition })
);

import { buildFlowerAxis } from "$lib/shared/shape-matrix/domain/flower-signature";
import { createShapeMatrixAppState } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";

const LEVEL_FOUR_TURNS = [
  "fl",
  -0.25,
  0,
  0.25,
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2,
  2.25,
  2.5,
  2.75,
  3,
] as const;

function semanticVariant(flower: Flower): number {
  if (flower.style === "float")
    return ["in", "out", "clock", "counter"].indexOf(flower.ori);
  return (flower.style === "anti" ? 2 : 0) + (flower.ori === "out" ? 1 : 0);
}

function createState(compact: boolean) {
  const syncState = vi.fn();
  const axis = buildFlowerAxis();
  const state = createShapeMatrixAppState(
    {
      loadMatrix: vi.fn().mockResolvedValue({
        axis,
        left: new Map(),
        right: new Map(),
        clubTipDx: 100,
      }),
      syncState,
    },
    {
      surface: "matrix",
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS",
      theoryPair: null,
      level: 2,
      leftTurn: 0,
      rightTurn: 0,
      activeAxis: "both",
      labelMode: "turns",
      propType: PropType.STAFF,
      pair: null,
      mode: null,
      propMode: null,
    },
    compact
  );
  return { state, syncState };
}

describe("shape matrix app state", () => {
  it("lands each level on the turn band it introduces", () => {
    const { state } = createState(false);

    state.setLevel(3);
    expect(state.leftTurn).toBe(0.5);
    expect(state.rightTurn).toBe(0.5);
    expect(state.availableTurns).toEqual(["fl", 0, 0.5, 1, 1.5, 2, 2.5, 3]);

    state.setLevel(4);
    expect(state.leftTurn).toBe(0.25);
    expect(state.rightTurn).toBe(0.25);
    expect(state.availableTurns).toEqual(LEVEL_FOUR_TURNS);

    state.setLevel(1);
    expect(state.leftTurn).toBe(0);
    expect(state.rightTurn).toBe(0);

    state.setLevel(2);
    expect(state.leftTurn).toBe(1);
    expect(state.rightTurn).toBe(1);
  });

  it("applies the level landing to the edited axis and clamps the other", () => {
    const { state } = createState(false);

    state.setActiveAxis("left");
    state.setLevel(3);
    expect(state.leftTurn).toBe(0.5);
    expect(state.rightTurn).toBe(0);

    state.setTurn(2.5);
    state.setActiveAxis("right");
    state.setLevel(4);
    expect(state.leftTurn).toBe(2.5);
    expect(state.rightTurn).toBe(0.25);

    state.setLevel(2);
    expect(state.leftTurn).toBe(2);
    expect(state.rightTurn).toBe(1);
  });

  it("changes an empty matrix turn without inventing a transition", () => {
    requestShapeMatrixTransition.mockClear();
    const { state, syncState } = createState(false);

    state.setLevel(4);
    state.setTurn(0.75);

    expect(state.selectedPair).toBeNull();
    expect(state.leftTurn).toBe(0.75);
    expect(state.rightTurn).toBe(0.75);
    expect(requestShapeMatrixTransition).not.toHaveBeenCalled();
    expect(syncState).toHaveBeenLastCalledWith(
      expect.objectContaining({ leftTurn: 0.75, rightTurn: 0.75, pair: null })
    );
  });

  it("opens a selected cell in the compact detail view with an active mode", () => {
    const { state, syncState } = createState(true);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");

    state.selectPair({ left, right });

    expect(state.activeView).toBe("detail");
    expect(state.compactFocusRequest).toEqual({ id: 1, target: "detail" });
    expect(state.selectedMode).not.toBeNull();
    expect(syncState).toHaveBeenCalledWith(
      expect.objectContaining({ pair: { left, right } })
    );
  });

  it("returns to the matrix without clearing the selected cell", () => {
    const { state } = createState(true);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    state.selectPair({ left, right });

    state.showMatrix();

    expect(state.activeView).toBe("matrix");
    expect(state.compactFocusRequest).toEqual({ id: 2, target: "matrix" });
    expect(state.selectedPair).toEqual({ left, right });
  });

  it("does not request compact focus for desktop selection or responsive changes", () => {
    const { state } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");

    state.selectPair({ left, right });
    expect(state.compactFocusRequest).toBeNull();

    state.setCompact(true);
    expect(state.compactFocusRequest).toBeNull();
  });

  it("keeps both-pane selection state when responsive mode changes", () => {
    const { state } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    state.selectPair({ left, right });

    state.setCompact(true);
    state.showDetail();
    state.setCompact(false);

    expect(state.selectedPair).toEqual({ left, right });
    expect(state.activeView).toBe("detail");
  });

  it("returns to the matrix when a compact visitor changes its turn band", () => {
    const { state } = createState(true);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    state.selectPair({ left, right });

    state.setTurn(1);

    expect(state.activeView).toBe("matrix");
    expect(state.selectedPair?.left.turns).toBe(1);
    expect(state.selectedPair?.right.turns).toBe(1);
    expect(state.selectedPair?.left.style).toBe(left.style);
    expect(state.selectedPair?.right.style).toBe(right.style);
  });

  it("keeps one realization active after a cell is selected", () => {
    const { state, syncState } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    state.selectPair({ left, right });
    const activeMode = state.selectedMode;

    state.setMode(null);

    expect(state.selectedMode).toBe(activeMode);
    expect(syncState).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: activeMode })
    );
  });

  it("solos one hand from its header, over a whole pair", () => {
    // A header is one hand's flower. Soloing it keeps a solvable pair
    // underneath, because a realization needs both hands; only the other
    // hand's prop goes quiet. Choosing a cell is both hands again.
    const { state } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");

    state.selectSolo("right", right);

    expect(state.soloHand).toBe("right");
    expect(state.selectedPair?.right.style).toBe(right.style);
    expect(state.selectedPair?.left).toBeTruthy();
    expect(state.selectedMode).toBeTruthy();

    state.selectSolo("left", left);
    expect(state.soloHand).toBe("left");

    state.selectPair({ left, right });
    expect(state.soloHand).toBeNull();
  });

  it("restores a shared route without writing it back", () => {
    const { state, syncState } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");

    state.restoreState({
      surface: "matrix",
      theoryLeftRatio: { propRotations: 2, handCycles: 5 },
      theoryRightRatio: { propRotations: 1, handCycles: 2 },
      theoryMode: "QO",
      theoryPair: null,
      level: 3,
      leftTurn: 0.5,
      rightTurn: 0.5,
      activeAxis: "both",
      labelMode: "ratios",
      propType: PropType.STAFF,
      pair: { left, right },
      mode: "QS",
      propMode: "SO",
    });

    expect(state.level).toBe(3);
    expect(state.leftTurn).toBe(0.5);
    expect(state.rightTurn).toBe(0.5);
    expect(state.labelMode).toBe("ratios");
    expect(state.selectedPair?.left.turns).toBe(0.5);
    expect(state.selectedPair?.right.turns).toBe(0.5);
    expect(state.selectedPair?.left.style).toBe(left.style);
    expect(state.selectedPair?.right.style).toBe(right.style);
    expect(state.selectedMode).toBe("QS");
    expect(state.selectedPropMode).toBe("SO");
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 5 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 1, handCycles: 2 });
    expect(state.theoryMode).toBe("QO");
    expect(syncState).not.toHaveBeenCalled();
  });

  it("edits either theory axis directly", () => {
    const { state, syncState } = createState(false);

    state.setSurface("theory");
    state.setTheoryRatios(
      { propRotations: 2, handCycles: 9 },
      { propRotations: 2, handCycles: 9 }
    );

    expect(state.surface).toBe("theory");
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 2, handCycles: 9 });

    state.setTheoryRatioFor("right", {
      propRotations: 1,
      handCycles: 2,
    });
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 1, handCycles: 2 });

    state.setTheoryMode("TO");
    expect(syncState).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: "theory", theoryMode: "TO" })
    );
  });

  it("accepts independent ratios through 15 and keeps a 4x4 matrix", () => {
    const { state } = createState(false);

    state.setSurface("theory");
    state.setTheoryRatioFor("left", {
      propRotations: 15,
      handCycles: 4,
    });
    state.setTheoryRatioFor("right", {
      propRotations: 4,
      handCycles: 15,
    });

    expect(state.theoryLeftRatio).toEqual({
      propRotations: 15,
      handCycles: 4,
    });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 4,
      handCycles: 15,
    });
    expect(state.theoryRowAxis).toHaveLength(4);
    expect(state.theoryColAxis).toHaveLength(4);
  });

  it("commits both visible theory ratios in one state update", () => {
    const { state, syncState } = createState(false);

    state.setTheoryRatios(
      { propRotations: 15, handCycles: 14 },
      { propRotations: 14, handCycles: 15 }
    );

    expect(state.theoryLeftRatio).toEqual({
      propRotations: 15,
      handCycles: 14,
    });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 14,
      handCycles: 15,
    });
    expect(syncState).toHaveBeenCalledTimes(1);
  });

  it("links both ratios until the user unlinks them", () => {
    const { state, syncState } = createState(false);

    state.setTheoryRatios(
      { propRotations: 2, handCycles: 5 },
      { propRotations: 1, handCycles: 2 }
    );
    state.linkTheoryRatios("left");

    expect(state.theoryRatiosLinked).toBe(true);
    expect(state.theoryLeftRatio).toEqual({
      propRotations: 2,
      handCycles: 5,
    });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 2,
      handCycles: 5,
    });

    state.setTheoryRatioFor("right", {
      propRotations: 3,
      handCycles: 7,
    });
    expect(state.theoryLeftRatio).toEqual({
      propRotations: 3,
      handCycles: 7,
    });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 3,
      handCycles: 7,
    });
    expect(syncState).toHaveBeenLastCalledWith(
      expect.objectContaining({ theoryRatiosLinked: true })
    );

    state.unlinkTheoryRatios();
    state.setTheoryRatioFor("right", {
      propRotations: 4,
      handCycles: 9,
    });
    expect(state.theoryLeftRatio).toEqual({
      propRotations: 3,
      handCycles: 7,
    });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 4,
      handCycles: 9,
    });
  });

  it("rolls a new Ratio Playground grid, crossing, and hand relationship", () => {
    const { state } = createState(false);
    state.setSurface("theory");
    const rolls = [0, 0, 0, 0.999999];

    state.surpriseMe(() => rolls.shift() ?? 0);

    expect(state.theoryLeftRatio).toEqual({ propRotations: 0, handCycles: 1 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 0, handCycles: 1 });
    expect(state.theoryRowAxis).toHaveLength(4);
    expect(state.theoryColAxis).toHaveLength(4);
    expect(state.theoryPair).toEqual({
      left: state.theoryRowAxis[0],
      right: state.theoryColAxis[0],
    });
    expect(state.theoryMode).toBe("QO");
  });

  it("rolls a new Level Matrix within the current difficulty", async () => {
    const { state } = createState(false);
    await state.load();
    const rolls = [0, 0, 0.999999];

    state.surpriseMe(() => rolls.shift() ?? 0);

    expect(state.rowAxis).toHaveLength(4);
    expect(state.colAxis).toHaveLength(4);
    expect(state.level).toBe(2);
    expect(state.leftTurn).toBe(0);
    expect(state.rightTurn).toBe(1);
    expect(state.selectedPair).toEqual({
      left: state.rowAxis[0],
      right: state.colAxis[0],
    });
    expect(state.selectedMode).toBe("QO");
    expect(state.selectedPropMode).toBeNull();
  });

  it("opens the rolled result on compact layouts unless navigation is deferred", async () => {
    const { state } = createState(true);
    await state.load();

    state.surpriseMe(() => 0, { navigate: false });
    expect(state.activeView).toBe("matrix");

    state.surpriseMe(() => 0);
    expect(state.activeView).toBe("detail");
    expect(state.compactFocusRequest?.target).toBe("detail");
  });

  it("rejects an invalid two-ratio update without moving either axis", () => {
    const { state, syncState } = createState(false);

    state.setTheoryRatios(
      { propRotations: 16, handCycles: 15 },
      { propRotations: 14, handCycles: 15 }
    );

    expect(state.theoryLeftRatio).toEqual({ propRotations: 1, handCycles: 3 });
    expect(state.theoryRightRatio).toEqual({
      propRotations: 1,
      handCycles: 3,
    });
    expect(syncState).not.toHaveBeenCalled();
  });

  it("rejects theory values outside the 0–15 field", () => {
    const { state } = createState(false);

    state.setSurface("theory");
    state.setTheoryRatioFor("left", {
      propRotations: 16,
      handCycles: 15,
    });

    expect(state.theoryLeftRatio).toEqual({ propRotations: 1, handCycles: 3 });
    expect(state.theoryRightRatio).toEqual({ propRotations: 1, handCycles: 3 });
  });

  it("moves the Kinetic Alphabet level without touching theory ratios", () => {
    const { state } = createState(false);

    state.setSurface("theory");
    state.setTheoryRatios(
      { propRotations: 2, handCycles: 9 },
      { propRotations: 2, handCycles: 9 }
    );

    // The Matrix's turn vocabulary remains independent from Theory's ratios.
    state.setLevel(1);
    expect(state.theoryLeftRatio).toEqual({ propRotations: 2, handCycles: 9 });
  });

  it("keeps an exact prop target only while the pair has equal rotating turns", () => {
    const { state } = createState(false);
    const flowers = buildFlowerAxis([0]).filter(
      (flower) => flower.grid === "diamond"
    );
    const left = flowers[0];
    const right = flowers[1];
    if (!left || !right) throw new Error("Expected numeric flowers");
    state.selectPair({ left, right });
    state.setPropMode("SS");
    expect(state.selectedPropMode).toBe("SS");

    state.setLevel(4);
    state.setActiveAxis("left");
    state.setTurn(0.75);
    expect(state.selectedPropMode).toBeNull();
  });

  it("treats float as a four-orientation matrix and restores rotating styles", () => {
    const { state } = createState(false);
    const left = buildFlowerAxis().find(
      (flower) => flower.style === "anti" && flower.ori === "in"
    )!;
    const right = buildFlowerAxis().find(
      (flower) => flower.style === "pro" && flower.ori === "out"
    )!;
    state.selectPair({ left, right });

    state.setLevel(3);
    state.setTurn("fl");
    expect(state.selectedPair?.left.style).toBe("float");
    expect(state.selectedPair?.right.style).toBe("float");

    state.setTurn(0.5);
    expect(state.selectedPair?.left.style).toBe("anti");
    expect(state.selectedPair?.right.style).toBe("pro");
  });

  it("edits one axis without changing the other", () => {
    const { state } = createState(false);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");
    state.selectPair({ left, right });
    state.setLevel(4);
    state.setActiveAxis("left");
    state.setTurn(0.75);

    expect(state.leftTurn).toBe(0.75);
    expect(state.rightTurn).toBe(0.25);
    expect(state.selectedPair?.left.turns).toBe(0.75);
    expect(state.selectedPair?.right.turns).toBe(0.25);
  });

  it("preserves each semantic row and column through every L4 turn", () => {
    const axis = buildFlowerAxis([0.25]).filter(
      (flower) => flower.grid === "diamond"
    );

    for (let variant = 0; variant < 4; variant += 1) {
      const left = axis[variant];
      const right = axis[3 - variant];
      if (!left || !right) throw new Error("Expected four semantic variants");
      const { state, syncState } = createState(false);
      state.setLevel(4);
      state.setLabelMode("ratios");
      state.selectPair({ left, right });

      state.setActiveAxis("left");
      for (const turn of LEVEL_FOUR_TURNS) {
        state.setTurn(turn);
        expect(semanticVariant(state.selectedPair!.left)).toBe(variant);
        expect(semanticVariant(state.selectedPair!.right)).toBe(3 - variant);
        expect(state.rightTurn).toBe(0.25);
      }

      state.setActiveAxis("right");
      for (const turn of LEVEL_FOUR_TURNS) {
        state.setTurn(turn);
        expect(semanticVariant(state.selectedPair!.left)).toBe(variant);
        expect(semanticVariant(state.selectedPair!.right)).toBe(3 - variant);
      }

      expect(syncState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          leftTurn: 3,
          rightTurn: 3,
          pair: state.selectedPair,
        })
      );
    }
  });
  it("keeps a compact visitor on the detail pane for a stay-on-detail level edit", () => {
    const axis = buildFlowerAxis([0]).filter(
      (flower) => flower.grid === "diamond"
    );
    const left = axis[0];
    const right = axis[1];
    if (!left || !right) throw new Error("Expected two flowers");
    const { state } = createState(true);
    state.selectPair({ left, right });
    expect(state.activeView).toBe("detail");

    state.setLevel(3, { stayOnDetail: true });
    expect(state.level).toBe(3);
    expect(state.activeView).toBe("detail");
    expect(state.selectedPair).not.toBeNull();

    // The ribbon's plain call still returns to the matrix.
    state.setLevel(2);
    expect(state.activeView).toBe("matrix");
  });

  it("keeps a compact visitor on the detail pane for a stay-on-detail turn edit", () => {
    const axis = buildFlowerAxis([0]).filter(
      (flower) => flower.grid === "diamond"
    );
    for (let variant = 0; variant < 4; variant += 1) {
      const left = axis[variant];
      const right = axis[3 - variant];
      if (!left || !right) throw new Error("Expected four semantic variants");
      const { state } = createState(true);
      state.setLevel(3);
      state.selectPair({ left, right });
      expect(state.activeView).toBe("detail");

      state.setActiveAxis("both");
      for (const turn of ["fl", 0, 1.5, 3] as const) {
        state.setTurn(turn, { stayOnDetail: true });
        expect(state.activeView).toBe("detail");
        expect(state.leftTurn).toBe(turn);
        expect(state.rightTurn).toBe(turn);
        expect(semanticVariant(state.selectedPair!.left)).toBe(variant);
        expect(semanticVariant(state.selectedPair!.right)).toBe(3 - variant);
      }

      state.setActiveAxis("left");
      state.setTurn(0.5, { stayOnDetail: true });
      expect(state.activeView).toBe("detail");
      expect(state.leftTurn).toBe(0.5);
      expect(state.rightTurn).toBe(3);
      expect(semanticVariant(state.selectedPair!.left)).toBe(variant);
      expect(semanticVariant(state.selectedPair!.right)).toBe(3 - variant);

      // The matrix-side editor keeps its existing navigation.
      state.setTurn(1);
      expect(state.activeView).toBe("matrix");
    }
  });

  it("records a compact selection without navigating when the host asks", () => {
    const { state } = createState(true);
    const [left, right] = buildFlowerAxis();
    if (!left || !right) throw new Error("Shape Matrix axis is empty");

    state.selectPair({ left, right }, { navigate: false });

    expect(state.selectedPair).toEqual({ left, right });
    expect(state.activeView).toBe("matrix");
    expect(state.compactFocusRequest).toBeNull();

    state.showDetail();
    expect(state.activeView).toBe("detail");
  });

  it("edits a named axis directly, without an Apply-to target", () => {
    const { state } = createState(false);
    // The state boots at Level 2 with both axes at zero. The Apply-to target
    // is a restored-link detail the direct edit must ignore.
    state.setActiveAxis("right");

    state.setTurnFor("left", 2);
    expect(state.leftTurn).toBe(2);
    expect(state.rightTurn).toBe(0);

    state.setTurnFor("right", 3);
    expect(state.leftTurn).toBe(2);
    expect(state.rightTurn).toBe(3);

    // Outside the level's band the edit is refused, not clamped.
    state.setTurnFor("left", 0.5);
    expect(state.leftTurn).toBe(2);
  });

  it("marks each Surprise roll for the reveal, and nothing else", async () => {
    const { state } = createState(false);
    await state.load();
    expect(state.revealToken).toBe(0);

    state.setTurnFor("left", 1);
    state.setLevel(3);
    expect(state.revealToken).toBe(0);

    state.surpriseMe(() => 0.4);
    expect(state.revealToken).toBe(1);
    state.setSurface("theory");
    state.surpriseMe(() => 0.6);
    expect(state.revealToken).toBe(2);
  });

  it("tracks the mandala handoff window", () => {
    const { state } = createState(true);
    expect(state.mandalaHandoff).toBe(false);
    state.beginMandalaHandoff();
    expect(state.mandalaHandoff).toBe(true);
    state.endMandalaHandoff();
    expect(state.mandalaHandoff).toBe(false);
  });
});

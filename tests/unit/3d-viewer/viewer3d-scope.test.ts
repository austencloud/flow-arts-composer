import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";
import { __resetWebGL2CapabilityForTests } from "$lib/shared/3d/capabilities/webgl-capabilities";
import { Plane } from "@austencloud/scene-3d";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { tick } from "svelte";
import { FALG } from "$lib/shared/combination/domain/demo-fixtures";

// The global test setup replaces document.createElement with a generic stub
// that returns plain objects lacking getContext. The viewer3d factory's
// WebGL2 detection calls document.createElement("canvas").getContext("webgl2"),
// so we extend the stub to return a canvas-like object for that specific tag.
// getContext returns null so the capability probe reports "not supported",
// which is fine — these scope tests never actually enter 3D mode.
beforeAll(() => {
  const originalCreateElement = document.createElement.bind(
    document
  ) as unknown as (tag: string) => unknown;
  (
    document as unknown as { createElement: (tag: string) => unknown }
  ).createElement = (tag: string) => {
    const base = originalCreateElement(tag) as Record<string, unknown>;
    if (tag === "canvas") {
      base.getContext = () => null;
    }
    return base;
  };
  // Clear the module-level cache so the first factory call re-probes against
  // the stub we just installed, not a stale result from some earlier test file.
  __resetWebGL2CapabilityForTests();
});

function stubDeps() {
  return {};
}

// createViewer3DState sets up $effect internally, which requires an effect
// root. The helper wraps the factory in $effect.root and returns a teardown.
const cleanups: Array<() => void> = [];
function makeState() {
  const { state, dispose } = createViewer3DStateForTest(stubDeps());
  cleanups.push(dispose);
  return state;
}

function makeSeeded3DState() {
  const { state, dispose } = createViewer3DStateForTest({ renderMode: "3d" });
  cleanups.push(dispose);
  return state;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("viewer-3d-state: selection scope", () => {
  it("defaults selection to null (All)", () => {
    const state = makeState();
    expect(state.selectedPerformerIndex).toBeNull();
  });

  it("scopedPerformers returns all performers when selection is null", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    expect(state.scopedPerformers().length).toBe(3);
  });

  it("scopedPerformers returns one performer when selection is a valid index", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.selectPerformerScope(1);
    expect(state.scopedPerformers().length).toBe(1);
    expect(state.scopedPerformers()[0]).toBe(
      state.performerManager.performers[1]
    );
  });

  it("keeps an ordered arbitrary selection with a primary performer", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();

    state.setPerformerSelection([0, 2], 2);
    expect(state.selectedPerformerIndices).toEqual([0, 2]);
    expect(state.primaryPerformerIndex).toBe(2);
    expect(state.scopedPerformers()).toEqual([
      state.performerManager.performers[0],
      state.performerManager.performers[2],
    ]);

    state.togglePerformerSelection(1);
    expect(state.selectedPerformerIndices).toEqual([0, 2, 1]);
    expect(state.primaryPerformerIndex).toBe(1);

    state.clearPerformerSelection();
    expect(state.selectedPerformerIndices).toEqual([]);
    expect(state.scopedPerformers()).toEqual([]);
  });

  it("serializes explicit None separately from All", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();

    state.clearPerformerSelection();
    expect(state.serialize()).toMatchObject({
      selectedPerformerIndex: null,
      selectedPerformerIndices: [],
    });

    state.selectAllPerformers();
    expect(state.serialize()).toMatchObject({
      selectedPerformerIndex: null,
      selectedPerformerIndices: [0, 1],
    });
  });

  it("projects a document-owned selection through the viewer controller", () => {
    let selected = [1];
    let primary: number | null = 1;
    const replace = vi.fn((index: number) => {
      selected = [index];
      primary = index;
    });
    const toggle = vi.fn((index: number) => {
      selected = selected.includes(index)
        ? selected.filter((candidate) => candidate !== index)
        : [...selected, index];
      primary = selected.at(-1) ?? null;
    });
    const { state, dispose } = createViewer3DStateForTest({
      performerSelection: {
        getSelectedIndices: () => selected,
        getPrimaryIndex: () => primary,
        replace,
        toggle,
        clear: () => {
          selected = [];
          primary = null;
        },
        selectAll: (count) => {
          selected = Array.from({ length: count }, (_, index) => index);
          primary = selected.at(-1) ?? null;
        },
        setSelection: (indices, primaryIndex) => {
          selected = [...indices];
          primary = primaryIndex ?? selected.at(-1) ?? null;
        },
      },
    });
    cleanups.push(dispose);
    state.performerManager.initialize();
    state.performerManager.addPerformer();

    expect(state.selectedPerformerIndices).toEqual([1]);
    state.togglePerformerSelection(0);
    expect(toggle).toHaveBeenCalledWith(0);
    expect(state.selectedPerformerIndices).toEqual([1, 0]);
    expect(state.primaryPerformerIndex).toBe(0);
    state.replacePerformerSelection(1);
    expect(replace).toHaveBeenCalledWith(1);
  });

  it("scopedPerformers returns empty array when selection is out of bounds", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.selectPerformerScope(5);
    expect(state.scopedPerformers().length).toBe(0);
  });

  it("selectPerformerScope(null) toggles back to All", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.selectPerformerScope(0);
    expect(state.selectedPerformerIndex).toBe(0);
    state.selectPerformerScope(null);
    expect(state.selectedPerformerIndex).toBeNull();
  });

  it("selecting a performer keeps the current camera view", () => {
    const state = makeSeeded3DState();
    state.performerManager.initialize();
    const moveCamera = vi.fn();
    state.registerSnapTo(moveCamera);

    state.selectPerformerScope(0);

    expect(state.selectedPerformerIndex).toBe(0);
    expect(moveCamera).not.toHaveBeenCalled();
  });

  it("returning to All keeps the current camera view", () => {
    const state = makeSeeded3DState();
    state.performerManager.initialize();
    const moveCamera = vi.fn();
    state.registerSnapTo(moveCamera);

    state.selectPerformerScope(0);
    state.selectPerformerScope(null);

    expect(moveCamera).not.toHaveBeenCalled();
  });

  it("keeps the editing camera through cast and formation changes", () => {
    const state = makeSeeded3DState();
    state.performerManager.initialize();
    const moveCamera = vi.fn();
    state.registerSnapTo(moveCamera);

    state.spawnPerformerFromUI();
    state.applyFormationFromUI("stage-lr");
    state.removePerformerFromUI();

    expect(moveCamera).not.toHaveBeenCalled();
  });

  it("moves the camera only when the user explicitly frames the cast", () => {
    const state = makeSeeded3DState();
    state.performerManager.initialize();
    state.spawnPerformerFromUI();
    const moveCamera = vi.fn();
    state.registerSnapTo(moveCamera);

    state.frameAllPerformers();

    expect(moveCamera).toHaveBeenCalledTimes(1);
  });

  it("setHandPlaneScoped updates every performer when All is selected", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();

    state.setHandPlaneScoped("left", Plane.FLOOR);

    expect(
      state.performerManager.performers.map(
        (performer) => performer.rawLeftPlane
      )
    ).toEqual([Plane.FLOOR, Plane.FLOOR, Plane.FLOOR]);
  });

  it("setHandPlaneScoped updates only the selected performer in single mode", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    state.selectPerformerScope(1);

    state.setHandPlaneScoped("right", Plane.WHEEL);

    expect(
      state.performerManager.performers.map(
        (performer) => performer.rawRightPlane
      )
    ).toEqual([null, Plane.WHEEL, null]);
  });

  it("applies and undoes a multi-performer prop edit as one history entry", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    state.setPerformerSelection([0, 2], 2);
    state.sceneUndo.clear();

    state.setPropScoped(PropType.FAN);

    expect(state.sceneUndo.historySize).toBe(1);
    expect(
      state.performerManager.performers.map(
        (performer) => performer.settings.prop
      )
    ).toEqual([PropType.FAN, null, PropType.FAN]);

    state.sceneUndo.undo();
    expect(
      state.performerManager.performers.map(
        (performer) => performer.settings.prop
      )
    ).toEqual([null, null, null]);

    state.sceneUndo.redo();
    expect(
      state.performerManager.performers.map(
        (performer) => performer.settings.prop
      )
    ).toEqual([PropType.FAN, null, PropType.FAN]);
  });

  it("applies a Director cast plan by index as one viewer history entry", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    const before = state.performerManager.performers.map((performer) => ({
      characterId: performer.characterId,
      prop: performer.settings.prop,
    }));
    state.sceneUndo.clear();

    expect(
      state.applyPerformerAppearanceAssignments([
        { index: 0, characterId: "y-bot", prop: PropType.FAN },
        { index: 1, characterId: "x-bot", prop: PropType.CLUB },
        { index: 2, characterId: "ch26", prop: PropType.POI },
      ])
    ).toBe(true);
    expect(state.sceneUndo.historySize).toBe(1);
    expect(
      state.performerManager.performers.map((performer) => ({
        characterId: performer.characterId,
        prop: performer.settings.prop,
      }))
    ).toEqual([
      { characterId: "y-bot", prop: PropType.FAN },
      { characterId: "x-bot", prop: PropType.CLUB },
      { characterId: "ch26", prop: PropType.POI },
    ]);

    state.sceneUndo.undo();
    expect(
      state.performerManager.performers.map((performer) => ({
        characterId: performer.characterId,
        prop: performer.settings.prop,
      }))
    ).toEqual(before);
  });

  it("records every bulk performer setting class as one undoable edit", () => {
    const state = makeState();
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    state.setPerformerSelection([0, 2], 2);
    const scoped = () => [
      state.performerManager.performers[0]!,
      state.performerManager.performers[2]!,
    ];
    const expectAtomic = (action: () => void) => {
      state.sceneUndo.clear();
      action();
      expect(state.sceneUndo.historySize).toBe(1);
    };

    expectAtomic(() => state.setCharacterScoped("y-bot"));
    expect(scoped().map((performer) => performer.characterId)).toEqual([
      "y-bot",
      "y-bot",
    ]);
    state.sceneUndo.undo();
    expect(
      scoped().every((performer) => performer.characterId !== "y-bot")
    ).toBe(true);
    state.sceneUndo.redo();
    expect(
      scoped().every((performer) => performer.characterId === "y-bot")
    ).toBe(true);

    expectAtomic(() => state.mergePropBuildScoped({}));
    expect(scoped().map((performer) => performer.settings.propBuild)).toEqual([
      {},
      {},
    ]);

    expectAtomic(() => state.setStaffLengthScoped(100));
    expect(
      scoped().map((performer) => performer.settings.staffLengthCm)
    ).toEqual([100, 100]);
    state.sceneUndo.undo();
    expect(
      scoped().map((performer) => performer.settings.staffLengthCm)
    ).toEqual([null, null]);
    state.sceneUndo.redo();

    expectAtomic(() => state.setEffortScoped("float"));
    expect(scoped().map((performer) => performer.settings.effortId)).toEqual([
      "float",
      "float",
    ]);

    expectAtomic(() => state.setEffectScoped("fire"));
    expect(scoped().map((performer) => performer.rawEffect)).toEqual([
      "fire",
      "fire",
    ]);
    state.sceneUndo.undo();
    expect(scoped().map((performer) => performer.rawEffect)).toEqual([
      null,
      null,
    ]);
    state.sceneUndo.redo();

    expectAtomic(() => state.setHandPlaneScoped("left", Plane.FLOOR));
    expect(scoped().map((performer) => performer.rawLeftPlane)).toEqual([
      Plane.FLOOR,
      Plane.FLOOR,
    ]);

    expectAtomic(() => state.loadSequenceScoped(FALG));
    expect(state.currentSequenceData?.id).toBe(FALG.id);
    expect(
      scoped().every((performer) => performer.loadedSequence?.id === FALG.id)
    ).toBe(true);
    state.sceneUndo.undo();
    expect(state.currentSequenceData).toBeNull();
    expect(
      scoped().every((performer) => performer.loadedSequence === null)
    ).toBe(true);
    state.sceneUndo.redo();
    expect(state.currentSequenceData?.id).toBe(FALG.id);
    expect(
      scoped().every((performer) => performer.loadedSequence?.id === FALG.id)
    ).toBe(true);
  });

  it("does not show a grid plane when a performer starts using it", async () => {
    localStorage.removeItem("tka-viewer3d-visiblePlanes");
    const state = makeState();
    state.performerManager.initialize();
    state.selectPerformerScope(0);

    state.setHandPlaneScoped("left", Plane.WHEEL);
    await tick();

    expect([...state.visiblePlanes]).toEqual([]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";

const east = { toward: "e", steps: 1 } as const;
const north = { toward: "n", steps: 2 } as const;
const sequence = (
  id: string,
  join?: typeof east | typeof north,
  mode = "diamond"
) =>
  ({
    id,
    gridMode: mode,
    steps: [],
    ...(join ? { conjoined: join } : {}),
  }) as unknown as SequenceData;

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

describe("per-performer grid join", () => {
  it("projects an aligned join without mutating the source, and keeps it across a new score", () => {
    const performer = createCharacterInstanceState(
      { id: "grid", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    const source = sequence("first", north);
    performer.loadSequence(source);
    performer.setGridJoin({ toward: "ne", steps: 1 });
    expect(performer.gridJoin).toEqual(east);
    expect(performer.loadedSequence?.conjoined).toEqual({
      toward: "ne",
      steps: 1,
    });
    expect(performer.sourceSequence).toBe(source);
    expect(source.conjoined).toEqual(north);
    performer.loadSequence(sequence("second", undefined, "box"));
    expect(performer.gridJoin).toEqual({ toward: "ne", steps: 1 });
    expect(performer.gridScale).toBeCloseTo(2 / 3);
    performer.setGridJoin(null);
    expect(performer.gridJoin).toBeNull();
    expect(performer.settings.gridJoin).toBeNull();
    performer.setGridJoin(undefined);
    expect(performer.settings.gridJoin).toBeUndefined();
    expect(performer.gridJoin).toBeNull();
  });

  it("restores the raw score and explicit one-grid override from an editing snapshot", () => {
    const performer = createCharacterInstanceState(
      { id: "saved-grid", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    const source = sequence("saved", east);
    performer.loadSequence(source);
    performer.setGridJoin(null);
    const saved = performer.captureEditingSnapshot();
    performer.setGridJoin(north);
    performer.restoreEditingSnapshot(saved);
    expect(performer.settings.gridJoin).toBeNull();
    expect(performer.gridJoin).toBeNull();
    expect(performer.sourceSequence?.conjoined).toEqual(east);
    performer.setGridJoin(undefined);
    expect(performer.gridJoin).toEqual(east);
  });

  it("aligns one raw join separately for diamond and box performers", () => {
    const diamond = createCharacterInstanceState(
      { id: "diamond-grid", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    const box = createCharacterInstanceState(
      { id: "box-grid", positionX: 0, persistent: false },
      makeStandaloneDeps()
    );
    diamond.loadSequence(sequence("diamond", undefined, "diamond"));
    box.loadSequence(sequence("box", undefined, "box"));
    diamond.setGridJoin({ toward: "ne", steps: 1 });
    box.setGridJoin({ toward: "ne", steps: 1 });
    expect(diamond.settings.gridJoin).toEqual(box.settings.gridJoin);
    expect(diamond.gridJoin).toEqual(east);
    expect(box.gridJoin).toEqual({ toward: "ne", steps: 1 });
    expect(diamond.loadedSequence?.conjoined).toEqual({
      toward: "ne",
      steps: 1,
    });
    expect(box.loadedSequence?.conjoined).toEqual({ toward: "ne", steps: 1 });
  });

  it("changes exactly the selected performers with one undo entry", () => {
    const { state, dispose } = createViewer3DStateForTest({});
    disposers.push(dispose);
    state.performerManager.initialize();
    state.performerManager.addPerformer();
    state.performerManager.addPerformer();
    state.setPerformerSelection([0, 2], 2);
    state.sceneUndo.clear();
    expect(state.setGridJoinScoped(east)).toBe(true);
    expect(state.sceneUndo.historySize).toBe(1);
    expect(
      state.performerManager.performers.map((p) => p.settings.gridJoin)
    ).toEqual([east, undefined, east]);
    state.sceneUndo.undo();
    expect(
      state.performerManager.performers.map((p) => p.settings.gridJoin)
    ).toEqual([undefined, undefined, undefined]);
    state.sceneUndo.redo();
    expect(
      state.performerManager.performers.map((p) => p.settings.gridJoin)
    ).toEqual([east, undefined, east]);
    const saved = state.serialize();
    expect(saved.performers.map((p) => p.settings?.gridJoin)).toEqual([
      east,
      undefined,
      east,
    ]);
    state.setGridJoinScoped(null);
    state.applyPersistConfig(saved);
    expect(
      state.performerManager.performers.map((p) => p.settings.gridJoin)
    ).toEqual([east, undefined, east]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFormationFromPreset,
  type FormationPreset,
  Viewer3DUndoManager,
} from "@austencloud/scene-3d";

import {
  createViewer3DStateForTest,
  type ViewerState,
} from "./viewer3d-test-helpers.svelte";

const cleanups: Array<() => void> = [];
let now = 1_000;

beforeEach(() => {
  now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.restoreAllMocks();
});

function makeCast(count: number): ViewerState {
  const { state, dispose } = createViewer3DStateForTest({
    viewer3DUndoManager: new Viewer3DUndoManager(),
  });
  cleanups.push(dispose);
  state.performerManager.initialize();
  while (state.performerManager.performers.length < count) {
    state.performerManager.addPerformer();
  }
  settle(state);
  return state;
}

/** Let any running glide finish. */
function settle(state: ViewerState): void {
  now += 5_000;
  state.performerManager.updateFormationTransition(now);
}

function facings(state: ViewerState): number[] {
  return state.performerManager.performers.map(
    (performer) => performer.facingAngle
  );
}

/** Smallest rotation between two headings, in radians. */
function turnBetween(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function expectFacings(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((facing, index) => {
    expect(turnBetween(facing, expected[index]!)).toBeLessThan(1e-6);
  });
}

function presetFacings(preset: FormationPreset, count: number): number[] {
  return createFormationFromPreset(preset, count).slots.map(
    (slot) => slot.facingAngle ?? 0
  );
}

describe("viewer formation facing", () => {
  it("turns performers toward the preset's facings as the formation glides in", () => {
    const state = makeCast(2);

    state.applyFormationFromUI("back-to-back");
    now += 175;
    state.performerManager.updateFormationTransition(now);
    const midway = state.performerManager.performers[1]!.facingAngle;
    expect(turnBetween(midway, 0)).toBeGreaterThan(0.1);
    expect(turnBetween(midway, Math.PI)).toBeGreaterThan(0.1);

    settle(state);
    expectFacings(facings(state), presetFacings("back-to-back", 2));
  });

  it("turns a four-performer Circle to face the center", () => {
    const state = makeCast(4);

    state.applyFormationFromUI("circle");
    settle(state);

    const performers = state.performerManager.performers;
    const center = {
      x: performers.reduce((sum, p) => sum + p.position.x, 0) / 4,
      z: performers.reduce((sum, p) => sum + p.position.z, 0) / 4,
    };
    for (const performer of performers) {
      const toCenter = Math.atan2(
        center.x - performer.position.x,
        center.z - performer.position.z
      );
      expect(turnBetween(performer.facingAngle, toCenter)).toBeLessThan(1e-6);
    }
  });

  it("restores formation facings on undo and redo", () => {
    const state = makeCast(2);
    state.applyFormationFromUI("line");
    settle(state);
    const line = facings(state);
    state.applyFormationFromUI("back-to-back");
    settle(state);

    state.undo();
    expectFacings(facings(state), line);

    state.redo();
    expectFacings(facings(state), presetFacings("back-to-back", 2));
  });

  it("restores formation facings from a saved scene", () => {
    const source = makeCast(2);
    source.applyFormationFromUI("back-to-back");
    settle(source);

    const restored = makeCast(1);
    restored.applyPersistConfig(source.serialize());

    expectFacings(facings(restored), presetFacings("back-to-back", 2));
  });
});

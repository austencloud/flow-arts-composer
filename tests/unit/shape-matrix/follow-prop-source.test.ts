/**
 * followPropSource keeps a ShapeMatrixAppState aligned with a host-owned
 * ShapeMatrixPropSource (the Create module's Shape tab mirrors settings).
 *
 * adoptPropPair reads the state's own leftPropType/rightPropType/data/loading,
 * so calling it from inside a *tracked* effect makes that effect re-run the
 * instant the engine's own load commits -- before the pick's onPropPairChange
 * has written the new pair out to settings. The effect then "adopts" the
 * settings pair, which still says the old prop, reverting the pick and
 * kicking off a redundant load; the pick's own onPropPairChange call, which
 * fires right after, then writes that reverted pair back to settings. These
 * tests drive the real prop source, the real app state, and the real
 * followPropSource effect together so the fix (wrapping adoptPropPair in
 * untrack) is verified against the actual reactive path, not a mock of it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { effect_root } from "svelte/internal/client";

import { buildFlowerAxis } from "$lib/shared/shape-matrix/domain/flower-signature";
import { createShapeMatrixAppState } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import { followPropSource } from "$lib/shared/shape-matrix/app/state/follow-prop-source.svelte";
import { createShapeEnginePropSource } from "$lib/features/create/shape-engine/shape-engine-prop-source";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  propSourceSettingsHarness,
  resetPropSourceSettingsHarness,
  type FollowPropSourceSettings,
} from "./follow-prop-source-harness.svelte";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  resetPropSourceSettingsHarness();
});

function createHarness() {
  const axis = buildFlowerAxis();
  const loadCalls: Array<{ left: PropType; right: PropType }> = [];
  const loadMatrix = vi.fn(
    async (props: { left: PropType; right: PropType }) => {
      loadCalls.push(props);
      return {
        axis,
        left: new Map(),
        right: new Map(),
        props,
        tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
        reach: { left: 100, right: 100 },
        clubTipDx: 100,
      };
    }
  );

  const updateSettings = vi.fn((patch: Partial<FollowPropSourceSettings>) => {
    Object.assign(propSourceSettingsHarness, patch);
  });

  const propSource = createShapeEnginePropSource({
    getSettings: () => propSourceSettingsHarness,
    updateSettings,
  });

  const state = createShapeMatrixAppState(
    {
      loadMatrix,
      syncState: () => {},
      onPropPairChange: (pair, catDog) => propSource.set({ ...pair, catDog }),
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
      leftPropType: propSource.left,
      rightPropType: propSource.right,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    },
    false
  );

  dispose = effect_root(() => {
    followPropSource(state, propSource);
  });
  flushSync();

  return { state, propSource, updateSettings, loadCalls };
}

describe("followPropSource", () => {
  it("a pick in the engine survives the settings echo", async () => {
    const { state, loadCalls } = createHarness();
    await state.load();
    flushSync();

    await state.setPropType(PropType.FAN);
    flushSync();

    expect(state.leftPropType).toBe(PropType.FAN);
    expect(state.rightPropType).toBe(PropType.FAN);
    expect(propSourceSettingsHarness.leftPropType).toBe(PropType.FAN);
    expect(propSourceSettingsHarness.rightPropType).toBe(PropType.FAN);
    expect(loadCalls).toEqual([
      { left: PropType.STAFF, right: PropType.STAFF },
      { left: PropType.FAN, right: PropType.FAN },
    ]);
  });

  it("adopts a settings change made elsewhere without writing it back", async () => {
    const { state, updateSettings } = createHarness();
    await state.load();
    flushSync();
    updateSettings.mockClear();

    propSourceSettingsHarness.leftPropType = PropType.CLUB;
    propSourceSettingsHarness.rightPropType = PropType.CLUB;
    flushSync();
    // adoptPropPair's own reload is async; give it a tick to land.
    await Promise.resolve();
    await Promise.resolve();
    flushSync();

    expect(state.leftPropType).toBe(PropType.CLUB);
    expect(state.rightPropType).toBe(PropType.CLUB);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("turning cat dog off folds back to one hand in state and settings", async () => {
    propSourceSettingsHarness.leftPropType = PropType.STAFF;
    propSourceSettingsHarness.rightPropType = PropType.FAN;
    propSourceSettingsHarness.catDogMode = true;

    const { state } = createHarness();
    await state.load();
    flushSync();
    expect(state.catDog).toBe(true);
    expect(state.rightPropType).toBe(PropType.FAN);

    await state.toggleCatDog();
    flushSync();

    expect(state.leftPropType).toBe(PropType.STAFF);
    expect(state.rightPropType).toBe(PropType.STAFF);
    expect(state.catDog).toBe(false);
    expect(propSourceSettingsHarness.leftPropType).toBe(PropType.STAFF);
    expect(propSourceSettingsHarness.rightPropType).toBe(PropType.STAFF);
    expect(propSourceSettingsHarness.catDogMode).toBe(false);
  });
});

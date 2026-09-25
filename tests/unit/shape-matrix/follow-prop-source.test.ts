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
 * fires right after, then writes that reverted pair back to settings.
 *
 * adoptPropPair's own no-op check had a matching bug: it compared the
 * adopted pair against the committed leftPropType/rightPropType, so a
 * settings change that happened to match the pair still on screen (while a
 * pick's load for a *different* pair was in flight) read as a no-op and was
 * silently dropped, letting the pick's later write clobber it.
 *
 * These tests drive the real prop source, the real app state, and the real
 * followPropSource effect together (via the harness's mountFollowPropSource,
 * built on the public `$effect.root`) so both fixes are verified against the
 * actual reactive path, not a mock of it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";

import { buildFlowerAxis } from "$lib/shared/shape-matrix/domain/flower-signature";
import { createShapeMatrixAppState } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import { createShapeEnginePropSource } from "$lib/features/create/shape-engine/shape-engine-prop-source";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  mountFollowPropSource,
  propSourceSettingsHarness,
  resetPropSourceSettingsHarness,
  type FollowPropSourceSettings,
} from "./follow-prop-source-harness.svelte";

type PropPair = { left: PropType; right: PropType };

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  resetPropSourceSettingsHarness();
});

function fakeMatrixData(
  axis: ReturnType<typeof buildFlowerAxis>,
  props: PropPair
) {
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

/** Resolves every load as soon as it is asked for, for tests that only need the final state. */
function createImmediateLoadMatrix() {
  const axis = buildFlowerAxis();
  const loadCalls: PropPair[] = [];
  const loadMatrix = vi.fn(async (props: PropPair) => {
    loadCalls.push(props);
    return fakeMatrixData(axis, props);
  });
  return { loadMatrix, loadCalls };
}

/**
 * Leaves every load pending until `resolveNext` is called, in the order the
 * loads were requested, so a test can land a settings change (or a dispose)
 * while an earlier load -- a pick's own, or an adopt's background reload --
 * is still in flight.
 */
function createDeferredLoadMatrix() {
  const axis = buildFlowerAxis();
  const loadCalls: PropPair[] = [];
  const pending: Array<() => void> = [];
  const loadMatrix = vi.fn((props: PropPair) => {
    loadCalls.push(props);
    return new Promise((resolve) => {
      pending.push(() => resolve(fakeMatrixData(axis, props)));
    });
  });
  function resolveNext(): void {
    const next = pending.shift();
    if (!next) throw new Error("no pending load to resolve");
    next();
  }
  return { loadMatrix, loadCalls, resolveNext };
}

function createHarness(loadMatrix: ReturnType<typeof vi.fn>) {
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

  dispose = mountFollowPropSource(state, propSource);
  flushSync();

  return { state, propSource, updateSettings };
}

describe("followPropSource", () => {
  it("a pick in the engine survives the settings echo", async () => {
    const { loadMatrix, loadCalls } = createImmediateLoadMatrix();
    const { state } = createHarness(loadMatrix);
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
    const { loadMatrix, loadCalls } = createImmediateLoadMatrix();
    const { state, updateSettings } = createHarness(loadMatrix);
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
    expect(loadCalls).toContainEqual({
      left: PropType.CLUB,
      right: PropType.CLUB,
    });
  });

  it("turning cat dog off folds back to one hand in state and settings", async () => {
    propSourceSettingsHarness.leftPropType = PropType.STAFF;
    propSourceSettingsHarness.rightPropType = PropType.FAN;
    propSourceSettingsHarness.catDogMode = true;

    const { loadMatrix } = createImmediateLoadMatrix();
    const { state } = createHarness(loadMatrix);
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

  it("a settings change to a different pair wins over an in-flight pick, which never writes", async () => {
    const { loadMatrix, resolveNext } = createDeferredLoadMatrix();
    const { state, updateSettings } = createHarness(loadMatrix);

    const initialLoad = state.load();
    resolveNext();
    await initialLoad;
    updateSettings.mockClear();

    // The pick's own uncached load is now in flight (queued, not resolved).
    const pickPromise = state.setPropType(PropType.FAN);

    // Settings change to a pair that differs from both the landed pair and
    // the pick's own in-flight target.
    propSourceSettingsHarness.leftPropType = PropType.CLUB;
    propSourceSettingsHarness.rightPropType = PropType.CLUB;
    flushSync();

    resolveNext(); // the pick's FAN fetch: stale token, setPropType returns false
    await pickPromise;
    resolveNext(); // the adopt's own CLUB fetch: current token, lands
    await Promise.resolve();
    flushSync();

    expect(state.leftPropType).toBe(PropType.CLUB);
    expect(state.rightPropType).toBe(PropType.CLUB);
    expect(propSourceSettingsHarness.leftPropType).toBe(PropType.CLUB);
    expect(propSourceSettingsHarness.rightPropType).toBe(PropType.CLUB);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("settings turning cat dog off during an in-flight pick wins over the pick", async () => {
    propSourceSettingsHarness.leftPropType = PropType.STAFF;
    propSourceSettingsHarness.rightPropType = PropType.STAFF;
    propSourceSettingsHarness.catDogMode = true;

    const { loadMatrix, resolveNext } = createDeferredLoadMatrix();
    const { state, updateSettings } = createHarness(loadMatrix);

    const initialLoad = state.load();
    resolveNext();
    await initialLoad;
    updateSettings.mockClear();
    expect(state.catDog).toBe(true);

    // Shape picks right=CLUB; the uncached load is in flight.
    const pickPromise = state.setPropType(PropType.CLUB, "right");

    // The settings drawer turns cat dog off, writing STAFF/STAFF unchanged.
    propSourceSettingsHarness.catDogMode = false;
    flushSync();

    resolveNext(); // the pick's STAFF/CLUB fetch: stale token, returns false
    await pickPromise;
    resolveNext(); // the adopt's own STAFF/STAFF fetch: current token, lands
    await Promise.resolve();
    flushSync();

    expect(state.leftPropType).toBe(PropType.STAFF);
    expect(state.rightPropType).toBe(PropType.STAFF);
    expect(state.catDog).toBe(false);
    expect(propSourceSettingsHarness.leftPropType).toBe(PropType.STAFF);
    expect(propSourceSettingsHarness.rightPropType).toBe(PropType.STAFF);
    expect(propSourceSettingsHarness.catDogMode).toBe(false);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("a load that resolves after dispose never writes settings", async () => {
    const { loadMatrix, resolveNext } = createDeferredLoadMatrix();
    const { state, updateSettings } = createHarness(loadMatrix);

    const initialLoad = state.load();
    resolveNext();
    await initialLoad;
    updateSettings.mockClear();

    const pickPromise = state.setPropType(PropType.FAN);
    state.dispose();
    resolveNext(); // resolves after the host has gone away
    await pickPromise;
    flushSync();

    expect(updateSettings).not.toHaveBeenCalled();
    expect(state.loading).toBe(false);
  });
});

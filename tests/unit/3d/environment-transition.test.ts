import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_VEIL_MAX_OPACITY,
  advanceEnvironmentTransition,
  createEnvironmentTransitionState,
  getEnvironmentVeilOpacity,
  requestEnvironment,
  switchEnvironmentBehindHost,
} from "#lib/shared/3d/environments/domain/environment-transition.js";

const FAST = { coverDurationMs: 100, revealDurationMs: 100 };
type TestEnvironment = "forest" | "ocean" | "winter" | "ember";

function createTestTransition(initial: TestEnvironment = "forest") {
  return createEnvironmentTransitionState<TestEnvironment>(initial);
}

describe("environment transition", () => {
  it("switches a retained world behind a host cover without an empty-frame gap", () => {
    const autumn = createEnvironmentTransitionState("autumn");
    const forest = switchEnvironmentBehindHost(autumn, "forest");

    expect(forest).toEqual({
      mountedKey: "forest",
      requestedKey: "forest",
      phase: "waiting",
      visibility: 1,
      gapFramesRemaining: 0,
    });
  });

  it("covers, leaves a clean gap, waits for readiness, and reveals", () => {
    let state = requestEnvironment(createTestTransition(), "ocean");

    state = advanceEnvironmentTransition(state, 100, false, FAST);
    expect(state).toMatchObject({
      phase: "gap",
      mountedKey: null,
      visibility: 0,
    });
    expect(getEnvironmentVeilOpacity(state)).toBe(ENVIRONMENT_VEIL_MAX_OPACITY);

    state = advanceEnvironmentTransition(state, 16, false, FAST);
    expect(state).toMatchObject({ phase: "gap", gapFramesRemaining: 0 });

    state = advanceEnvironmentTransition(state, 16, false, FAST);
    expect(state).toMatchObject({ phase: "waiting", mountedKey: "ocean" });

    state = advanceEnvironmentTransition(state, 16, false, FAST);
    expect(state.phase).toBe("waiting");

    state = advanceEnvironmentTransition(state, 16, true, FAST);
    expect(state.phase).toBe("revealing");

    state = advanceEnvironmentTransition(state, 100, true, FAST);
    expect(state).toMatchObject({
      phase: "idle",
      mountedKey: "ocean",
      visibility: 1,
    });
    expect(getEnvironmentVeilOpacity(state)).toBe(0);
  });

  it("mounts only the latest scene requested during cover", () => {
    let state = requestEnvironment(createTestTransition(), "ocean");
    state = advanceEnvironmentTransition(state, 40, false, FAST);
    state = requestEnvironment(state, "winter");
    state = requestEnvironment(state, "ember");
    state = advanceEnvironmentTransition(state, 60, false, FAST);
    state = advanceEnvironmentTransition(state, 16, false, FAST);
    state = advanceEnvironmentTransition(state, 16, false, FAST);

    expect(state).toMatchObject({ phase: "waiting", mountedKey: "ember" });
  });

  it("does not allocate another state for the same target while covering", () => {
    let state = requestEnvironment(createTestTransition(), "ocean");

    const duplicateRequest = requestEnvironment(state, "ocean");

    expect(duplicateRequest).toBe(state);
  });

  it("reverses continuously when the mounted scene is selected again", () => {
    let state = requestEnvironment(createTestTransition(), "ocean");
    state = advanceEnvironmentTransition(state, 40, false, FAST);
    expect(state.visibility).toBeCloseTo(0.6);
    const opacityBeforeReversal = getEnvironmentVeilOpacity(state);

    state = requestEnvironment(state, "forest");
    expect(state).toMatchObject({
      phase: "revealing",
      mountedKey: "forest",
    });
    expect(getEnvironmentVeilOpacity(state)).toBeCloseTo(opacityBeforeReversal);

    state = advanceEnvironmentTransition(state, 40, true, FAST);
    expect(state).toMatchObject({
      phase: "idle",
      mountedKey: "forest",
      visibility: 1,
    });
  });

  it("covers from the current opacity when a new scene is requested during reveal", () => {
    let state = requestEnvironment(createTestTransition(), "ocean");
    state = advanceEnvironmentTransition(state, 100, false, FAST);
    state = advanceEnvironmentTransition(state, 16, false, FAST);
    state = advanceEnvironmentTransition(state, 16, false, FAST);
    state = advanceEnvironmentTransition(state, 16, true, FAST);
    state = advanceEnvironmentTransition(state, 35, true, FAST);

    expect(state).toMatchObject({ phase: "revealing", visibility: 0.35 });
    const opacityBeforeRequest = getEnvironmentVeilOpacity(state);

    state = requestEnvironment(state, "ember");
    expect(state.phase).toBe("covering");
    expect(getEnvironmentVeilOpacity(state)).toBeCloseTo(opacityBeforeRequest);
  });

  it("clamps a caller-provided peak opacity", () => {
    const covered = {
      ...createTestTransition(),
      visibility: 0,
    };

    expect(getEnvironmentVeilOpacity(covered, 0.72)).toBeCloseTo(0.72);
    expect(getEnvironmentVeilOpacity(covered, 2)).toBe(1);
    expect(getEnvironmentVeilOpacity(covered, -1)).toBe(0);
  });

  it("handles reduced motion without getting stuck", () => {
    const instant = { coverDurationMs: 0, revealDurationMs: 0 };
    let state = requestEnvironment(createTestTransition(), "ocean");
    state = advanceEnvironmentTransition(state, 0, false, instant);
    state = advanceEnvironmentTransition(state, 0, false, instant);
    state = advanceEnvironmentTransition(state, 0, false, instant);
    state = advanceEnvironmentTransition(state, 0, true, instant);
    state = advanceEnvironmentTransition(state, 0, true, instant);

    expect(state).toMatchObject({
      phase: "idle",
      mountedKey: "ocean",
      visibility: 1,
    });
  });
});

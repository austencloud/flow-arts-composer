import { describe, expect, it } from "vitest";
import {
  createEnvironmentLoadState,
  displayedEnvironment,
  observeEnvironmentLoad,
  pendingEnvironment,
  sceneEnvironmentIdForRendererKey,
  type EnvironmentLoadState,
} from "./environment-load";
import { SceneEnvironmentId } from "./scene-environment";

const { COSMIC, OCEAN, WINTER, RAINBOW } = SceneEnvironmentId;

function tracked(settled = COSMIC): EnvironmentLoadState {
  return { ...createEnvironmentLoadState(settled), tracking: true };
}

describe("environment load", () => {
  it("never shows a pending load before a renderer reports", () => {
    const state = createEnvironmentLoadState(COSMIC);
    expect(pendingEnvironment(state, OCEAN)).toBeNull();
    expect(displayedEnvironment(state, OCEAN)).toBe(OCEAN);
  });

  it("keeps the outgoing scene active while the tapped one builds", () => {
    const state = tracked(COSMIC);
    expect(pendingEnvironment(state, OCEAN)).toBe(OCEAN);
    expect(displayedEnvironment(state, OCEAN)).toBe(COSMIC);
  });

  it("finishes the load only when the requested scene settles on screen", () => {
    let state = tracked(COSMIC);
    state = observeEnvironmentLoad(state, OCEAN, {
      requested: OCEAN,
      mounted: COSMIC,
      settled: false,
    }).state;
    expect(pendingEnvironment(state, OCEAN)).toBe(OCEAN);

    state = observeEnvironmentLoad(state, OCEAN, {
      requested: OCEAN,
      mounted: OCEAN,
      settled: true,
    }).state;
    expect(pendingEnvironment(state, OCEAN)).toBeNull();
    expect(displayedEnvironment(state, OCEAN)).toBe(OCEAN);
  });

  it("starts tracking on the first report, even mid-switch", () => {
    const result = observeEnvironmentLoad(
      createEnvironmentLoadState(COSMIC),
      OCEAN,
      { requested: OCEAN, mounted: null, settled: false }
    );
    expect(result.state.tracking).toBe(true);
    expect(pendingEnvironment(result.state, OCEAN)).toBe(OCEAN);
  });

  it("reverts to the scene still on screen when a replacement fails", () => {
    const result = observeEnvironmentLoad(tracked(COSMIC), OCEAN, {
      requested: OCEAN,
      mounted: COSMIC,
      settled: true,
    });
    expect(result.revertTo).toBe(COSMIC);
    expect(result.state.failed).toBe(OCEAN);
    expect(pendingEnvironment(result.state, COSMIC)).toBeNull();
  });

  it("does not revert a newer choice because of a stale report", () => {
    // Ocean was tapped, then Winter; a late report about Ocean must not undo Winter.
    const result = observeEnvironmentLoad(tracked(COSMIC), WINTER, {
      requested: OCEAN,
      mounted: COSMIC,
      settled: true,
    });
    expect(result.revertTo).toBeNull();
    expect(result.state.failed).toBeNull();
    expect(pendingEnvironment(result.state, WINTER)).toBe(WINTER);
  });

  it("maps renderer keys to scene ids, including renamed ones", () => {
    expect(sceneEnvironmentIdForRendererKey("ocean")).toBe(OCEAN);
    expect(sceneEnvironmentIdForRendererKey(null)).toBeNull();
    const rainbowKey = "pride";
    expect(sceneEnvironmentIdForRendererKey(rainbowKey)).toBe(RAINBOW);
  });
});

import { describe, expect, it } from "vitest";
import {
  FLOW_FEST_FIRE_JAM_CONTRACT,
  computeFlowFestFireJamAudioMix,
  observeFlowFestFireJam,
} from "#lib/features/flow-fest-sim/domain/flow-fest-fire-jam.js";
import {
  advanceFlowFestProgress,
  createFlowFestGate4ReviewProgress,
  restoreFlowFestProgress,
} from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
import { FlowFestFireJamSoundscape } from "#lib/features/flow-fest-sim/services/implementations/FlowFestFireJamSoundscape.js";

const FINGERPRINT = "gate4-contract";
const LAYOUT = {
  fireCenter: { x: 89, z: -113.5 },
  ledCircleCenter: { x: 120, z: -103 },
};

describe("Flow Fest Gate 4 fire-jam slice", () => {
  it("requires the wheel to be parked before the player can join", () => {
    const mounted = observeFlowFestFireJam(
      LAYOUT,
      { x: 89, z: -105 },
      true,
      "not-started"
    );
    const onFoot = observeFlowFestFireJam(
      LAYOUT,
      { x: 89, z: -105 },
      false,
      "not-started"
    );

    expect(mounted.distanceMeters).toBeLessThan(
      FLOW_FEST_FIRE_JAM_CONTRACT.joinRadiusMeters
    );
    expect(mounted.wheelMustPark).toBe(true);
    expect(mounted.canJoin).toBe(false);
    expect(onFoot.canJoin).toBe(true);
  });

  it("raises the environment response only after joining the jam", () => {
    const position = { x: 89, z: -113.5 };
    const waiting = observeFlowFestFireJam(
      LAYOUT,
      position,
      false,
      "not-started"
    );
    const active = observeFlowFestFireJam(LAYOUT, position, false, "active");
    const mix = computeFlowFestFireJamAudioMix(LAYOUT, position, "active", 0.7);

    expect(active.responseIntensity).toBeGreaterThan(waiting.responseIntensity);
    expect(active.responseIntensity).toBe(1);
    expect(mix.fire).toBe(1);
    expect(mix.master).toBe(0.7);
    expect(mix.crowd).toBeGreaterThan(0.5);
  });

  it("attenuates both authored sound sources outside the response radius", () => {
    const mix = computeFlowFestFireJamAudioMix(
      LAYOUT,
      { x: 400, z: 300 },
      "active",
      0.8
    );

    expect(mix).toEqual({ fire: 0, led: 0, crowd: 0, master: 0.8 });
  });

  it("retains a listener-relative spatial frame before gesture unlock", () => {
    const soundscape = new FlowFestFireJamSoundscape();
    soundscape.setSpatialFrame({
      listener: { x: 0, y: 1.7, z: 0, yawRadians: Math.PI / 2 },
      fire: { x: 8, y: 1, z: 0 },
      led: { x: -12, y: 1.5, z: 4 },
      crowd: { x: 5, y: 1.5, z: 7 },
    });

    expect(soundscape.snapshot()).toMatchObject({
      spatialFrameCount: 1,
      spatializedSources: 0,
      unlocked: false,
    });
    soundscape.dispose();
  });

  it("builds a reachable review state and persists the complete interaction", () => {
    let state = createFlowFestGate4ReviewProgress(FINGERPRINT);
    expect(state).toMatchObject({
      phase: "night-free-roam",
      moment: "night",
      branch: "lower-tent",
      fireJamState: "not-started",
    });
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);

    state = advanceFlowFestProgress(state, { type: "join-fire-jam" });
    state = advanceFlowFestProgress(state, { type: "complete-fire-jam" });
    expect(state.fireJamState).toBe("completed");
    expect(restoreFlowFestProgress(state, FINGERPRINT)).toEqual(state);
  });

  it("rejects impossible post-jam snapshots", () => {
    let state = createFlowFestGate4ReviewProgress(FINGERPRINT);
    state = advanceFlowFestProgress(state, { type: "join-fire-jam" });
    state = advanceFlowFestProgress(state, { type: "complete-fire-jam" });
    state = advanceFlowFestProgress(state, { type: "head-home" });

    expect(state.phase).toBe("night-return");
    expect(
      restoreFlowFestProgress(
        { ...state, fireJamState: "not-started" },
        FINGERPRINT
      )
    ).toBeNull();
  });
});

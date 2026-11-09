import { describe, it, expect } from "vitest";
import { Plane, PlaneMode } from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { FALG } from "#lib/shared/combination/domain/demo-fixtures.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  SCAN_VERSION,
  type WallFeasibilityMetadata,
} from "#lib/shared/3d/domain/models/wall-feasibility.js";
import { resolvePlanePolicy } from "#lib/shared/3d/services/wall-plane-policy.js";

/**
 * The viewer's conversion seam for the offline wall scan. Override keys are
 * step indices in sequenceToMotionConfigs order (start placement excluded),
 * so in stepConfigs they sit one slot later when a start pose exists.
 */
const CHEAT: WallFeasibilityMetadata = {
  wallFeasible: "withCheat",
  scanVersion: SCAN_VERSION,
  wallPlaneOverrides: {
    2: { left: { depthOffset: -0.12 } },
    5: { right: { depthOffset: 0.08, k: 0.4 } },
  },
};

function withMeta(meta: WallFeasibilityMetadata | undefined): SequenceData {
  return {
    ...FALG,
    metadata: { ...(FALG.metadata ?? {}), wallFeasibility: meta },
  } as SequenceData;
}

let seq = 0;
function load(sequence: SequenceData) {
  const state = createCharacterInstanceState(
    { id: `wall-feasibility-${seq++}`, positionX: 0 },
    makeStandaloneDeps()
  );
  state.loadSequence(sequence);
  return state;
}

const offsets = (state: ReturnType<typeof load>) =>
  state.stepConfigs.flatMap((c, i) =>
    (["left", "right"] as const)
      .filter((h) => c[h]?.depthOffset !== undefined)
      .map((h) => `${i}:${h}:${c[h]!.depthOffset}`)
  );

describe("CharacterInstanceState — wall feasibility overrides", () => {
  it("stamps withCheat depthOffset per step and per hand, start pose excluded", () => {
    const state = load(withMeta(CHEAT));
    const o = state.motionStepOffset;
    expect(o).toBe(1);
    expect(offsets(state)).toEqual([
      `${2 + o}:left:-0.12`,
      `${5 + o}:right:0.08`,
    ]);
    expect(state.stepConfigs[5 + o]!.right!.plane).toBe(Plane.WALL);
  });

  it("stamps k only where the hand is concave-eligible (anti)", () => {
    const raw = load(FALG);
    const o = raw.motionStepOffset;
    const antiAt = raw.stepConfigs.findIndex(
      (c, i) => i >= o && c.right?.motionType === MotionType.ANTI
    );
    const proAt = raw.stepConfigs.findIndex(
      (c, i) => i >= o && c.right?.motionType === MotionType.PRO
    );
    expect(antiAt).toBeGreaterThanOrEqual(o);
    expect(proAt).toBeGreaterThanOrEqual(o);
    const state = load(
      withMeta({
        ...CHEAT,
        wallPlaneOverrides: {
          [antiAt - o]: { right: { k: 0.4 } },
          [proAt - o]: { right: { k: 0.4 } },
        },
      })
    );
    expect(state.stepConfigs[antiAt]!.right).toMatchObject({
      pathShape: "concave",
      concaveDepth: 0.4,
    });
    expect(state.stepConfigs[proAt]!.right).toEqual(
      raw.stepConfigs[proAt]!.right
    );
  });

  it("leaves every config unchanged without a verdict, or with true, false or a stale version", () => {
    const baseline = load(FALG).stepConfigs;
    for (const meta of [
      undefined,
      { wallFeasible: true, scanVersion: SCAN_VERSION } as const,
      { wallFeasible: false, scanVersion: SCAN_VERSION } as const,
      { ...CHEAT, scanVersion: SCAN_VERSION - 1 },
    ]) {
      const state = load(withMeta(meta));
      expect(offsets(state)).toEqual([]);
      expect(state.stepConfigs).toEqual(baseline);
    }
  });

  it("drops the wall cheat when the hands leave the wall plane", () => {
    const state = load(withMeta(CHEAT));
    state.setPlaneMode(PlaneMode.DUAL_WHEEL);
    expect(offsets(state)).toEqual([]);
    state.setPlaneMode(PlaneMode.WALL);
    expect(offsets(state)).toHaveLength(2);
  });

  it("drops it only on a beat moved to wheel, keeping the rest", () => {
    const state = load(withMeta(CHEAT));
    const o = state.motionStepOffset;
    state.setStepHandPlane(2 + o, "right", Plane.WHEEL);
    expect(offsets(state)).toEqual([`${5 + o}:right:0.08`]);
  });
});

describe("resolvePlanePolicy", () => {
  it("absent claims nothing; false prefers dual wheel even across versions; only a current withCheat stamps", () => {
    expect(resolvePlanePolicy(undefined)).toEqual({
      preferDualWheel: false,
      applyOverrides: false,
    });
    expect(
      resolvePlanePolicy({ wallFeasible: true, scanVersion: SCAN_VERSION })
    ).toEqual({ preferDualWheel: false, applyOverrides: false });
    expect(resolvePlanePolicy({ wallFeasible: false, scanVersion: 1 })).toEqual(
      { preferDualWheel: true, applyOverrides: false }
    );
    expect(resolvePlanePolicy(CHEAT)).toEqual({
      preferDualWheel: false,
      applyOverrides: true,
    });
    expect(
      resolvePlanePolicy({ ...CHEAT, scanVersion: 1 }).applyOverrides
    ).toBe(false);
  });
});

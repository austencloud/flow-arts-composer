/**
 * The continuity detector has to tell a fast sweep from a teleport, and it has
 * to keep finding the one the user reported. Both are checked here.
 */

import { describe, it, expect } from "vitest";
import { PlaneMode } from "@austencloud/scene-3d";

import {
  auditPropContinuity,
  phaseLabel,
  type ContinuityPose,
  type ContinuityTrace,
} from "#lib/shared/3d/diagnostics/prop-continuity-audit.js";
import {
  sweepPropContinuity,
  type PropPoseScoreSource,
} from "#lib/shared/3d/diagnostics/prop-continuity-sweep.js";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import { FALG } from "#lib/shared/combination/domain/demo-fixtures.js";

const PHASE_STEP = 0.002;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 } as const;

/** A prop drawing the whole 0.52 m grid circle once per step: fast, and legal. */
function fullCircleTrace(steps: number): ContinuityTrace {
  const phases: number[] = [];
  const poses: ContinuityPose[] = [];
  for (let phase = 0; phase < steps; phase += PHASE_STEP) {
    const angle = phase * 2 * Math.PI;
    phases.push(phase);
    poses.push({
      position: { x: 0.52 * Math.cos(angle), y: 0.52 * Math.sin(angle), z: 0.3 },
      rotation: IDENTITY,
    });
  }
  return { prop: "blue", phases, poses };
}

describe("auditPropContinuity", () => {
  it("leaves a legitimately fast sweep alone", () => {
    const findings = auditPropContinuity("synthetic", fullCircleTrace(4));
    expect(findings).toEqual([]);
  });

  it("flags a single-frame jump inside that same fast sweep", () => {
    const trace = fullCircleTrace(4);
    const poses = [...trace.poses] as ContinuityPose[];
    const at = poses.findIndex((_, i) => trace.phases[i] >= 2);
    // Displace the rest of the trace 40 cm downstage from one frame onward.
    for (let i = at; i < poses.length; i++) {
      poses[i] = {
        ...poses[i],
        position: { ...poses[i].position, z: poses[i].position.z - 0.4 },
      };
    }
    const findings = auditPropContinuity("synthetic", { ...trace, poses });
    expect(findings).toHaveLength(1);
    expect(findings[0].class).toBe("depth-flip");
    expect(findings[0].axis).toBe("z");
    expect(findings[0].magnitudeCm).toBeGreaterThan(39);
    expect(findings[0].trendRatio).toBeGreaterThan(10);
  });

  it("does not read a quaternion hemisphere change as motion", () => {
    const trace = fullCircleTrace(2);
    const poses = trace.poses.map((pose, i) => ({
      ...(pose as ContinuityPose),
      // Same rotation, opposite hemisphere on alternating frames.
      rotation: i % 2 === 0 ? IDENTITY : { x: 0, y: 0, z: 0, w: -1 },
    }));
    const findings = auditPropContinuity("synthetic", { ...trace, poses });
    expect(findings.filter((f) => f.class !== "depth-flip")).toEqual([]);
  });

  it("labels phase the way the staff-grip lab does", () => {
    expect(phaseLabel(0)).toBe("1.00");
    expect(phaseLabel(3.664)).toBe("4.66");
  });
});

describe("FALG regression", () => {
  it("still swings the blue staff from upstage to downstage inside step 4", () => {
    const state = createCharacterInstanceState(
      { id: "falg-continuity", persistent: false },
      makeStandaloneDeps()
    );
    state.setPlaneMode(PlaneMode.WALL);
    state.loadSequence(FALG);

    const result = sweepPropContinuity(
      FALG.id,
      FALG.word,
      state as unknown as PropPoseScoreSource,
      { phaseStep: PHASE_STEP, planeMode: PlaneMode.WALL }
    );

    const blueInStep4 = result.findings.filter(
      (f) => f.prop === "blue" && f.phaseStart >= 3 && f.phaseStart < 4
    );
    expect(blueInStep4).toHaveLength(1);

    const finding = blueInStep4[0];
    expect(finding.class).toBe("depth-flip");
    expect(finding.axis).toBe("z");
    // Upstage (negative z) to downstage (positive z).
    expect(finding.displacementCm.z).toBeGreaterThan(35);
    // The whole swing lands inside a tenth of a step.
    expect(finding.phaseEnd - finding.phaseStart).toBeLessThan(0.1);
    expect(finding.labelStart.startsWith("4.")).toBe(true);
  }, 60_000);
});

import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type {
  AvatarGripDiagnostics,
  CollisionEvent,
} from "@austencloud/scene-3d";
import {
  AvatarGripMotionAudit,
  AVATAR_GRIP_MOTION_THRESHOLDS,
} from "#lib/shared/3d/diagnostics/avatar-grip-motion-audit.js";

const FRAME_MS = 1000 / 60;

function point(x: number, y = 1, z = 0): Vector3 {
  return new Vector3(x, y, z);
}

function diagnostics(
  overrides: Partial<AvatarGripDiagnostics> = {}
): AvatarGripDiagnostics {
  return {
    stepNumber: 0,
    beatProgress: 0,
    authoredBlueGrip: point(-0.04),
    authoredRedGrip: point(0.04),
    leftTarget: point(-0.04),
    rightTarget: point(0.04),
    leftWrist: point(-0.05),
    rightWrist: point(0.05),
    leftPalm: point(-0.04),
    rightPalm: point(0.04),
    renderedBlueGrip: point(-0.04),
    renderedRedGrip: point(0.04),
    blueCorrectionLocal: point(0, 0, 0),
    redCorrectionLocal: point(0, 0, 0),
    blueStaffSegment: null,
    redStaffSegment: null,
    ...overrides,
  };
}

function recordFrames(
  audit: AvatarGripMotionAudit,
  makeDiagnostics: (frame: number) => AvatarGripDiagnostics,
  events: readonly CollisionEvent[] = [],
  count = 60
): void {
  for (let frame = 0; frame < count; frame += 1) {
    audit.record("austen", makeDiagnostics(frame), events, frame * FRAME_MS);
  }
}

describe("AvatarGripMotionAudit", () => {
  it("certifies a stationary post-solve hold as stable", () => {
    const audit = new AvatarGripMotionAudit();
    recordFrames(audit, () => diagnostics());

    const report = audit.report().performers.austen;
    expect(report.status).toBe("stable");
    expect(report.settledFrames).toBeGreaterThanOrEqual(
      AVATAR_GRIP_MOTION_THRESHOLDS.minimumSettledSamples
    );
    expect(report.twitchFrames).toBe(0);
    expect(report.speeds.palm.peakMps).toBe(0);
    expect(report.minimumSeparation.renderedGrips).toBeCloseTo(0.08);
  });

  it("attributes stationary-target hand oscillation to the arm solver", () => {
    const audit = new AvatarGripMotionAudit();
    recordFrames(audit, (frame) => {
      const jitter = frame % 2 === 0 ? -0.008 : 0.008;
      return diagnostics({
        leftWrist: point(-0.05 + jitter),
        rightWrist: point(0.05 - jitter),
        leftPalm: point(-0.04 + jitter),
        rightPalm: point(0.04 - jitter),
        renderedBlueGrip: point(-0.04 - jitter),
        renderedRedGrip: point(0.04 + jitter),
      });
    });

    const report = audit.report().performers.austen;
    expect(report.status).toBe("twitching");
    expect(report.firstMovingSubsystem).toBe("arm-solver");
    expect(report.sourceCounts["arm-solver"]).toBeGreaterThan(0);
    expect(report.speeds.palm.peakMps).toBeGreaterThan(
      AVATAR_GRIP_MOTION_THRESHOLDS.twitchSpeedMps
    );
  });

  it("attributes stable hands with moving correction groups to contact lock", () => {
    const audit = new AvatarGripMotionAudit();
    recordFrames(audit, (frame) => {
      const jitter = frame % 2 === 0 ? -0.006 : 0.006;
      return diagnostics({
        renderedBlueGrip: point(-0.04 + jitter),
        renderedRedGrip: point(0.04 - jitter),
        blueCorrectionLocal: point(jitter, 0, 0),
        redCorrectionLocal: point(-jitter, 0, 0),
      });
    });

    const report = audit.report().performers.austen;
    expect(report.status).toBe("twitching");
    expect(report.firstMovingSubsystem).toBe("contact-lock");
    expect(report.sourceCounts["contact-lock"]).toBeGreaterThan(0);
  });

  it("attributes target oscillation before downstream motion", () => {
    const audit = new AvatarGripMotionAudit();
    recordFrames(audit, (frame) => {
      const jitter = frame % 2 === 0 ? -0.005 : 0.005;
      return diagnostics({
        leftTarget: point(-0.04 + jitter),
        rightTarget: point(0.04 - jitter),
      });
    });

    const report = audit.report().performers.austen;
    expect(report.status).toBe("twitching");
    expect(report.firstMovingSubsystem).toBe("target-policy");
  });

  it("does not call authored sequence travel a twitch", () => {
    const audit = new AvatarGripMotionAudit();
    recordFrames(audit, (frame) =>
      diagnostics({
        authoredBlueGrip: point(-0.04 + frame * 0.01),
        authoredRedGrip: point(0.04 + frame * 0.01),
      })
    );

    const report = audit.report().performers.austen;
    expect(report.status).toBe("authored-motion");
    expect(report.twitchFrames).toBe(0);
  });

  it("keeps exact prop overlap depth and bounds the trace", () => {
    const audit = new AvatarGripMotionAudit();
    const overlap: CollisionEvent = {
      zone: "prop-through-prop",
      severity: "penetrate",
      stepNumber: 0,
      beatProgress: 0,
      penetrationDepth: 0.018,
      description: "Staffs cross",
    };
    recordFrames(audit, () => diagnostics(), [overlap], 650);

    const report = audit.report().performers.austen;
    expect(report.sampledFrames).toBe(600);
    expect(report.samples[0].frame).toBe(50);
    expect(report.maximumPropOverlapDepth).toBe(0.018);
  });
});

import { describe, expect, it } from "vitest";
import type { CollisionEvent } from "@austencloud/scene-3d";
import {
  AVATAR_COLLISION_AUDIT_STORAGE_KEY,
  AvatarSequenceCollisionAudit,
} from "#lib/shared/3d/collision/avatar-sequence-collision-audit.js";

function event(
  stepNumber: number,
  beatProgress: number,
  penetrationDepth: number,
  zone: CollisionEvent["zone"] = "arm-through-neck"
): CollisionEvent {
  return {
    zone,
    severity: penetrationDepth > 0.05 ? "penetrate" : "clip",
    stepNumber,
    beatProgress,
    penetrationDepth,
    description: `${zone} ${(penetrationDepth * 100).toFixed(0)}cm`,
  };
}

function pose(
  overrides: Partial<import("@austencloud/scene-3d").AvatarPoseDiagnostics> = {}
): import("@austencloud/scene-3d").AvatarPoseDiagnostics {
  return {
    requestedStanceYawRad: 0,
    achievedShoulderYawRad: 0,
    shoulderWidth: 0.4,
    requestedSpinePitchRad: 0,
    appliedStanceYawRad: 0,
    appliedReachLeanRad: 0,
    appliedHeadDodgeRad: 0,
    achievedTorsoPitchRad: 0,
    ...overrides,
  };
}

describe("AvatarSequenceCollisionAudit", () => {
  it("clusters contiguous bad frames and keeps the exact worst sample", () => {
    const audit = new AvatarSequenceCollisionAudit();
    audit.record(
      "austen",
      [event(2, 0.2, 0.03)],
      pose({
        requestedStanceYawRad: 0.4,
        achievedShoulderYawRad: 0.1,
        shoulderWidth: 0.4,
      })
    );
    audit.record(
      "austen",
      [event(2, 0.3, 0.08)],
      pose({
        requestedStanceYawRad: 0.8,
        achievedShoulderYawRad: 0.25,
        shoulderWidth: 0.39,
        requestedSpinePitchRad: 0.12,
        appliedReachLeanRad: 0.08,
        appliedHeadDodgeRad: 0.3,
        achievedTorsoPitchRad: 0.18,
      })
    );
    audit.record(
      "austen",
      [event(2, 0.4, 0.04)],
      pose({
        requestedStanceYawRad: 0.6,
        achievedShoulderYawRad: 0.2,
        shoulderWidth: 0.38,
      })
    );
    audit.record(
      "austen",
      [],
      pose({
        requestedStanceYawRad: 0.6,
        achievedShoulderYawRad: 0.2,
        shoulderWidth: 0.38,
      })
    );

    expect(audit.report()).toMatchObject({
      sampledFrames: 4,
      clusters: [
        {
          performerId: "austen",
          zone: "arm-through-neck",
          frameCount: 3,
          firstStep: 2,
          firstProgress: 0.2,
          lastProgress: 0.4,
          worstStep: 2,
          worstProgress: 0.3,
          worstPenetrationDepth: 0.08,
          worstPose: {
            requestedStanceYawRad: 0.8,
            achievedShoulderYawRad: 0.25,
            shoulderWidth: 0.39,
            requestedSpinePitchRad: 0.12,
            appliedReachLeanRad: 0.08,
            appliedHeadDodgeRad: 0.3,
            achievedTorsoPitchRad: 0.18,
          },
          worstDescription: "arm-through-neck 8cm",
          severity: "penetrate",
        },
      ],
    });
    expect(audit.report().currentPoseByPerformer.austen).toEqual({
      requestedStanceYawRad: 0.6,
      achievedShoulderYawRad: 0.2,
      shoulderWidth: 0.38,
      requestedSpinePitchRad: 0,
      appliedStanceYawRad: 0,
      appliedReachLeanRad: 0,
      appliedHeadDodgeRad: 0,
      achievedTorsoPitchRad: 0,
    });
  });

  it("keeps telemetry compact while retaining the exact worst description", () => {
    const audit = new AvatarSequenceCollisionAudit();
    for (let frame = 0; frame < 100; frame += 1) {
      audit.record("austen", [event(4, frame / 100, frame / 1000)]);
    }

    const [cluster] = audit.report().clusters;
    expect(cluster.descriptions).toHaveLength(1);
    expect(cluster.worstDescription).toBe("arm-through-neck 10cm");
  });

  it("starts a new cluster after a clear frame", () => {
    const audit = new AvatarSequenceCollisionAudit();
    audit.record("austen", [event(1, 0.1, 0.04)]);
    audit.record("austen", []);
    audit.record("austen", [event(3, 0.7, 0.07)]);

    expect(audit.report().clusters).toHaveLength(2);
  });

  it("keeps performers and zones independent", () => {
    const audit = new AvatarSequenceCollisionAudit();
    audit.record("austen", [event(1, 0.1, 0.04)]);
    audit.record("remy", [event(1, 0.1, 0.06, "arm-through-torso")]);
    audit.record("austen", []);

    const report = audit.report();
    expect(
      report.clusters.map((cluster) => cluster.performerId).sort()
    ).toEqual(["austen", "remy"]);
  });

  it("publishes a browser-readable snapshot without serializing every frame", () => {
    const audit = new AvatarSequenceCollisionAudit();
    sessionStorage.removeItem(AVATAR_COLLISION_AUDIT_STORAGE_KEY);
    for (let frame = 0; frame < 15; frame += 1) {
      audit.record("austen", [event(2, frame / 15, 0.06)]);
    }

    const stored = sessionStorage.getItem(AVATAR_COLLISION_AUDIT_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toMatchObject({
      sampledFrames: 15,
      clusters: [{ performerId: "austen", frameCount: 15 }],
    });
  });
});

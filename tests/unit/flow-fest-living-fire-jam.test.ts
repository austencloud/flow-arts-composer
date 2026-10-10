import { describe, expect, it } from "vitest";
import {
  auditFlowFestLivingCommunity,
  sampleFlowFestLivingCommunity,
  type FlowFestFestivalCommunityLayout,
  type FlowFestFestivalPersonPlacement,
} from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";

function performer(
  ordinal: number,
  role: "fire-poi" | "fire-hoop" = "fire-poi"
): FlowFestFestivalPersonPlacement {
  return {
    id: `performer-${ordinal}`,
    avatarId: "ch01",
    role,
    behavior: "fire-rotation",
    x: ordinal,
    y: 2,
    z: 0,
    facingAngle: 0,
    phaseOffset: ordinal,
    rotationOrdinal: ordinal,
    performanceTarget: { x: ordinal, y: 2, z: 3 },
    queueTarget: { x: ordinal + 10, y: 2, z: 8 },
  };
}

const LAYOUT: FlowFestFestivalCommunityLayout = {
  fireCenter: { x: 0, y: 2, z: 0 },
  ledCircleCenter: { x: 30, y: 2, z: 0 },
  spectatorCount: 3,
  performerCount: 5,
  firePerformerCount: 5,
  activeFirePerformerCount: 3,
  ingressBearingRadians: -Math.PI / 2,
  ingressHalfWidthRadians: 0.4,
  people: [
    {
      id: "watcher",
      avatarId: "ch07",
      role: "spectator",
      behavior: "watch-fire",
      x: 12,
      y: 2,
      z: 0,
      facingAngle: -Math.PI / 2,
      phaseOffset: 0,
    },
    {
      id: "walker",
      avatarId: "ch21",
      role: "spectator",
      behavior: "perimeter-walk",
      x: -12,
      y: 2,
      z: 1,
      facingAngle: Math.PI / 2,
      phaseOffset: 1,
    },
    {
      id: "talker",
      avatarId: "ch12",
      role: "spectator",
      behavior: "social-pair",
      x: 8,
      y: 2,
      z: 9,
      facingAngle: 0,
      phaseOffset: 2,
      lookTarget: { x: 9, z: 10 },
    },
    performer(0),
    performer(1, "fire-hoop"),
    performer(2),
    performer(3, "fire-hoop"),
    performer(4),
  ],
};

describe("Flow Fest living fire jam", () => {
  it("rotates three real prop performers without changing the cast", () => {
    const first = sampleFlowFestLivingCommunity(LAYOUT, 6, 1);
    const second = sampleFlowFestLivingCommunity(LAYOUT, 30, 1);

    expect(first.activeFirePerformerIds).toEqual([
      "performer-0",
      "performer-1",
      "performer-2",
    ]);
    expect(second.activeFirePerformerIds).toEqual([
      "performer-1",
      "performer-2",
      "performer-3",
    ]);
    expect(first.people).toHaveLength(second.people.length);
    expect(second.rotationOrdinal).toBe(1);
  });

  it("keeps social and perimeter behavior deterministic", () => {
    const first = sampleFlowFestLivingCommunity(LAYOUT, 12.5, 0.8);
    const second = sampleFlowFestLivingCommunity(LAYOUT, 12.5, 0.8);

    expect(first).toEqual(second);
    expect(first.talkingSpectatorCount).toBe(1);
    expect(first.movingSpectatorCount).toBeGreaterThanOrEqual(1);
    expect(
      first.people.find((person) => person.id === "talker")?.activity
    ).toBe("talking");
  });

  it("audits an open performance floor, ingress, and complete rotation", () => {
    const audit = auditFlowFestLivingCommunity(LAYOUT, 8.4);

    expect(audit.spectatorFloorIntrusions).toBe(0);
    expect(audit.minimumSpectatorRadiusMeters).toBeGreaterThan(9.6);
    expect(audit.fireRotationComplete).toBe(true);
    expect(audit.ingressParticipantCount).toBe(0);
  });
});

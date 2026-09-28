import { afterEach, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  CollisionDetector,
  type BodySnapshot,
  type PropSegment,
} from "@austencloud/scene-3d";

const STAFF_RADIUS = 0.01;

function point(x: number, y: number, z = 0): Vector3 {
  return new Vector3(x, y, z);
}

function staff(from: Vector3, to: Vector3): PropSegment {
  return { a: from, b: to, radius: STAFF_RADIUS };
}

function body(overrides: Partial<BodySnapshot> = {}): BodySnapshot {
  return {
    head: point(0, 1.7),
    face: point(0, 1.78, 0.18),
    neck: point(0, 1.55),
    spine2: point(0, 1.35),
    spine1: point(0, 1.15),
    hips: point(0, 0.95),
    leftShoulder: point(-0.18, 1.45),
    rightShoulder: point(0.18, 1.45),
    leftElbow: point(-0.4, 1.4),
    rightElbow: point(0.4, 1.4),
    leftHand: point(-0.6, 1.25),
    rightHand: point(0.6, 1.25),
    ...overrides,
  };
}

let detector: CollisionDetector | null = null;

afterEach(() => {
  detector?.dispose();
  detector = null;
});

describe("CollisionDetector arm/body coverage", () => {
  it("detects a forearm passing through the neck outside the face sphere", () => {
    detector = new CollisionDetector();
    const events = detector.detect(
      body({
        face: point(0, 1.9, 0.3),
        leftElbow: point(-0.25, 1.55),
        leftHand: point(0.25, 1.55),
      }),
      null,
      null,
      3,
      0.4
    );

    const neckEvent = events.find(
      (event) => event.zone === "arm-through-neck"
    );
    expect(neckEvent).toBeDefined();
    expect(neckEvent?.description).toContain("endpoint");
    expect(events.some((event) => event.zone === "arm-through-face")).toBe(
      false
    );
  });

  it("detects a forearm passing through the chest", () => {
    detector = new CollisionDetector();
    const events = detector.detect(
      body({
        neck: point(0, 1.8, 0.3),
        leftElbow: point(-0.25, 1.35),
        leftHand: point(0.25, 1.35),
      }),
      null,
      null,
      4,
      0.6
    );

    const torsoEvent = events.find(
      (event) => event.zone === "arm-through-torso"
    );
    expect(torsoEvent).toBeDefined();
    expect(torsoEvent?.description).toContain("endpoint");
  });

  it("reports the hand distance for a face intersection", () => {
    detector = new CollisionDetector();
    const events = detector.detect(
      body({
        leftElbow: point(-0.25, 1.78, 0.18),
        leftHand: point(0.25, 1.78, 0.18),
      }),
      null,
      null,
      6,
      0.5
    );

    const faceEvent = events.find(
      (event) => event.zone === "arm-through-face"
    );
    expect(faceEvent).toBeDefined();
    expect(faceEvent?.description).toContain("hand");
  });

  it("does not flag the attached shoulder root as a torso collision", () => {
    detector = new CollisionDetector();
    const events = detector.detect(
      body({
        neck: point(0, 1.8, 0.3),
        spine2: point(0, 1.45),
        leftShoulder: point(-0.13, 1.45),
        leftElbow: point(-0.5, 1.45),
        leftHand: point(-0.72, 1.3),
        rightShoulder: point(0.5, 1.45),
        rightElbow: point(0.75, 1.4),
        rightHand: point(0.95, 1.25),
      }),
      null,
      null,
      0,
      0
    );

    expect(
      events.some(
        (event) =>
          event.zone === "arm-through-torso" &&
          event.description.startsWith("L upper arm")
      )
    ).toBe(false);
  });
});

describe("CollisionDetector segment crossings", () => {
  it.each([
    {
      name: "forearms crossing 3 cm apart",
      pose: {
        leftElbow: point(-0.25, 1.2, 0.3),
        leftHand: point(0.25, 1.4, 0.3),
        rightElbow: point(0.25, 1.2, 0.33),
        rightHand: point(-0.25, 1.4, 0.33),
      },
      description: "Forearms intersect",
      depth: 0.03,
    },
    {
      name: "a hand beside the other elbow",
      pose: {
        leftElbow: point(-0.3, 1.3, 0.3),
        leftHand: point(0, 1.3, 0.3),
        rightElbow: point(0.03, 1.33, 0.3),
        rightHand: point(0.03, 1.6, 0.3),
      },
      description: "Forearms intersect",
      depth: 0.06 - Math.hypot(0.03, 0.03),
    },
    {
      name: "forearms side by side 4 cm apart",
      pose: {
        leftElbow: point(-0.2, 1.3, 0.3),
        leftHand: point(0.1, 1.3, 0.3),
        rightElbow: point(0.2, 1.3, 0.34),
        rightHand: point(-0.1, 1.3, 0.34),
      },
      description: "Forearms intersect",
      depth: 0.02,
    },
    {
      name: "upper arms crossing",
      pose: {
        leftElbow: point(0.06, 1.35, 0.2),
        leftHand: point(0.06, 1.6, 0.35),
        rightElbow: point(-0.06, 1.35, 0.2),
        rightHand: point(-0.06, 1.6, 0.35),
      },
      description: "Upper arms intersect",
      depth: 0.06,
    },
  ])("measures $name", ({ pose, description, depth }) => {
    detector = new CollisionDetector();
    const event = detector
      .detect(body(pose), null, null, 2, 0.5)
      .find(
        (candidate) =>
          candidate.zone === "arms-through-each-other" &&
          candidate.description.startsWith(description)
      );

    expect(event).toBeDefined();
    expect(event?.penetrationDepth).toBeCloseTo(depth, 6);
  });

  it("measures a staff through the middle of the left forearm", () => {
    detector = new CollisionDetector();
    const event = detector
      .detect(
        body(),
        staff(point(-0.5, 1.325, -0.5), point(-0.5, 1.325, 0.5)),
        null,
        2,
        0.5
      )
      .find((candidate) => candidate.zone === "prop-through-arm");

    expect(event).toBeDefined();
    expect(event?.description).toMatch(/^Blue staff → L forearm/);
    expect(event?.penetrationDepth).toBeCloseTo(0.05, 6);
  });

  it("measures staves crossing 3 cm apart", () => {
    detector = new CollisionDetector();
    const event = detector
      .detect(
        body(),
        staff(point(-0.5, 0.9, 0.4), point(0.5, 1.9, 0.4)),
        staff(point(0.5, 0.9, 0.43), point(-0.5, 1.9, 0.43)),
        2,
        0.5
      )
      .find((candidate) => candidate.zone === "prop-through-prop");

    expect(event).toBeDefined();
    expect(event?.penetrationDepth).toBeCloseTo(0.01, 6);
  });

  it("reports nothing when the arms and staves are well apart", () => {
    detector = new CollisionDetector();
    const events = detector.detect(
      body(),
      staff(point(-0.3, 0.6, 0.6), point(-0.3, 1.6, 0.6)),
      staff(point(0.3, 0.6, 0.6), point(0.3, 1.6, 0.6)),
      2,
      0.5
    );

    expect(events).toEqual([]);
  });
});

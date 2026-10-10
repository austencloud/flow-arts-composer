import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  buildLevelOneSpaceFromCsv,
  isLevelOneOrientation,
} from "#lib/features/movement-map/domain/level-one-space.js";
import { buildCoverageReport } from "#lib/features/movement-map/domain/annotation-coverage.js";
import {
  signatureKey,
  nearestPhaseAnchor,
  type MovementAnnotation,
} from "#lib/features/movement-map/domain/movement-annotation.js";

function loadCsv(name: string): string {
  return readFileSync(
    resolve(process.cwd(), "static/data/pictographs", name),
    "utf-8"
  );
}

const SOURCES = [
  { gridMode: GridMode.DIAMOND, csv: loadCsv("DiamondPictographDataframe.csv") },
  { gridMode: GridMode.BOX, csv: loadCsv("BoxPictographDataframe.csv") },
];

const space = buildLevelOneSpaceFromCsv(SOURCES);

function annotationFor(key: string, phase: number): MovementAnnotation {
  const movement = space.byKey.get(key)!;
  return {
    id: `${key}@${phase}`,
    leftSignature: movement.signature,
    rightSignature: null,
    phase,
    left: { elbowFlexion: "slight" },
    right: {},
    body: {},
    notes: "",
    videoId: "v1",
    videoLabel: "clip",
    timestamp: 1,
    stepIndex: 0,
    stepLetter: "A",
    sequenceId: "s1",
    sequenceWord: "A",
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

describe("Level 1 movement space", () => {
  it("builds a non-empty, finite space from the canonical dataframes", () => {
    expect(space.movements.length).toBeGreaterThan(0);
    // The whole premise is that this world is small enough to finish mapping.
    expect(space.movements.length).toBeLessThan(500);
  });

  it("admits only radial orientations at both ends", () => {
    for (const movement of space.movements) {
      expect(isLevelOneOrientation(movement.signature.startOrientation)).toBe(
        true
      );
      expect(isLevelOneOrientation(movement.signature.endOrientation)).toBe(
        true
      );
    }
  });

  it("keys every movement uniquely", () => {
    const keys = new Set(space.movements.map((m) => m.key));
    expect(keys.size).toBe(space.movements.length);
  });

  it("attributes each movement to at least one letter", () => {
    for (const movement of space.movements) {
      expect(movement.letters.length).toBeGreaterThan(0);
    }
  });
});

describe("coverage", () => {
  it("reports an untouched space as entirely unseen", () => {
    const report = buildCoverageReport(space, []);
    expect(report.unseen).toBe(space.movements.length);
    expect(report.mapped).toBe(0);
    expect(report.fraction).toBe(0);
  });

  it("counts a movement as mapped only once its travel is described", () => {
    const key = space.movements[0]!.key;

    const oneAnchor = buildCoverageReport(space, [annotationFor(key, 0)]);
    expect(oneAnchor.byKey.get(key)!.status).toBe("partial");

    const threeAnchors = buildCoverageReport(space, [
      annotationFor(key, 0),
      annotationFor(key, 0.5),
      annotationFor(key, 1),
    ]);
    expect(threeAnchors.byKey.get(key)!.status).toBe("mapped");
    expect(threeAnchors.mapped).toBe(1);
  });

  it("does not let repeated observations of one instant fake progress", () => {
    const key = space.movements[0]!.key;
    const report = buildCoverageReport(space, [
      annotationFor(key, 1),
      annotationFor(key, 1),
      annotationFor(key, 1),
      annotationFor(key, 1),
    ]);
    expect(report.byKey.get(key)!.status).toBe("partial");
    expect(report.mapped).toBe(0);
  });

  it("surfaces annotations that fall outside the Level 1 space", () => {
    const outside: MovementAnnotation = {
      ...annotationFor(space.movements[0]!.key, 0.5),
      leftSignature: {
        motionType: "pro",
        rotationDirection: "cw",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "clock",
        endOrientation: "counter",
      },
    };
    const report = buildCoverageReport(space, [outside]);
    expect(report.outsideSpace).toBe(1);
    expect(report.mapped).toBe(0);
  });

  it("puts the least-described movements at the top of the gap list", () => {
    const [first, second] = space.movements;
    const report = buildCoverageReport(space, [
      annotationFor(first!.key, 0),
      annotationFor(first!.key, 0.5),
    ]);
    const gapKeys = report.gaps.map((g) => g.movement.key);
    expect(gapKeys.indexOf(second!.key)).toBeLessThan(
      gapKeys.indexOf(first!.key)
    );
  });
});

describe("phase anchors", () => {
  it("snaps a raw phase to the nearest named anchor", () => {
    expect(nearestPhaseAnchor(0)).toBe("launch");
    expect(nearestPhaseAnchor(0.26)).toBe("early");
    expect(nearestPhaseAnchor(0.49)).toBe("mid");
    expect(nearestPhaseAnchor(0.8)).toBe("late");
    expect(nearestPhaseAnchor(1)).toBe("arrival");
  });
});

describe("signature identity", () => {
  it("gives the same key to the same movement regardless of which letter asked", () => {
    const movement = space.movements[0]!;
    expect(signatureKey(movement.signature)).toBe(movement.key);
  });
});

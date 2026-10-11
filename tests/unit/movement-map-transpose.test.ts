import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { buildLevelOneSpaceFromCsv } from "#lib/features/movement-map/domain/level-one-space.js";
import {
  buildCoverageReport,
  coverageForKeys,
} from "#lib/features/movement-map/domain/annotation-coverage.js";
import {
  signatureKey,
  type MovementAnnotation,
} from "#lib/features/movement-map/domain/movement-annotation.js";
import {
  transposeSignature,
  transposeKey,
  isSelfTranspose,
} from "#lib/features/movement-map/domain/movement-transpose.js";

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

const paired = space.movements.filter((m) => m.transposeKey !== null);

function annotation(
  signature: MovementAnnotation["leftSignature"],
  phase: number
): MovementAnnotation {
  return {
    id: `${signatureKey(signature!)}@${phase}`,
    leftSignature: signature,
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

describe("transposing a movement", () => {
  it("reflects the path across the vertical axis", () => {
    const transposed = transposeSignature({
      motionType: "pro",
      rotationDirection: "cw",
      startLocation: "e",
      endLocation: "ne",
      startOrientation: "in",
      endOrientation: "out",
    });

    expect(transposed.startLocation).toBe("w");
    expect(transposed.endLocation).toBe("nw");
  });

  it("reverses the sense of rotation", () => {
    const transposed = transposeSignature({
      motionType: "pro",
      rotationDirection: "ccw",
      startLocation: "n",
      endLocation: "e",
      startOrientation: "in",
      endOrientation: "in",
    });

    expect(transposed.rotationDirection).toBe("cw");
  });

  it("leaves motion type alone, because both signs flip together", () => {
    for (const motionType of ["pro", "anti", "static", "dash"]) {
      const transposed = transposeSignature({
        motionType,
        rotationDirection: "cw",
        startLocation: "ne",
        endLocation: "se",
        startOrientation: "in",
        endOrientation: "out",
      });
      expect(transposed.motionType).toBe(motionType);
    }
  });

  it("leaves radial orientations alone, since they point at the centre", () => {
    const transposed = transposeSignature({
      motionType: "pro",
      rotationDirection: "cw",
      startLocation: "e",
      endLocation: "w",
      startOrientation: "in",
      endOrientation: "out",
    });

    expect(transposed.startOrientation).toBe("in");
    expect(transposed.endOrientation).toBe("out");
  });

  it("is its own inverse", () => {
    for (const movement of space.movements) {
      const there = transposeSignature(movement.signature);
      const back = transposeSignature(there);
      expect(signatureKey(back)).toBe(movement.key);
    }
  });

  it("recognises a movement that crosses the axis as its own transposition", () => {
    expect(
      isSelfTranspose({
        motionType: "pro",
        rotationDirection: "noRotation",
        startLocation: "n",
        endLocation: "s",
        startOrientation: "in",
        endOrientation: "in",
      })
    ).toBe(true);
  });
});

describe("the Level 1 space pairs both sides of the body", () => {
  it("actually finds pairs in the real dataframes", () => {
    expect(paired.length).toBeGreaterThan(0);
  });

  it("holds one entry per pair, not one per signature", () => {
    const signatures = new Set<string>();
    for (const movement of space.movements) {
      signatures.add(movement.key);
      if (movement.transposeKey) signatures.add(movement.transposeKey);
    }
    expect(signatures.size).toBeGreaterThan(space.movements.length);
  });

  it("resolves either side's signature to the one entry", () => {
    for (const movement of paired) {
      expect(space.byKey.get(movement.transposeKey!)).toBe(movement);
      expect(space.byKey.get(movement.key)).toBe(movement);
    }
  });

  it("never lists a transposed twin as a movement of its own", () => {
    const listed = new Set(space.movements.map((m) => m.key));
    for (const movement of paired) {
      expect(listed.has(movement.transposeKey!)).toBe(false);
    }
  });

  it("credits the pair with the letters that ask for either side", () => {
    for (const movement of paired) {
      expect(movement.letters.length).toBeGreaterThan(0);
    }
  });
});

describe("coverage credits the other side of the body", () => {
  const movement = paired[0];
  const twin = transposeSignature(movement.signature);

  it("closes both sides from observations of one", () => {
    const report = buildCoverageReport(space, [
      annotation(movement.signature, 0.05),
      annotation(movement.signature, 0.5),
      annotation(movement.signature, 0.95),
    ]);

    expect(report.byKey.get(movement.key)!.status).toBe("mapped");
    expect(report.byKey.get(signatureKey(twin))!.status).toBe("mapped");
  });

  it("accumulates observations of either side onto one movement", () => {
    const report = buildCoverageReport(space, [
      annotation(movement.signature, 0.05),
      annotation(twin, 0.5),
      annotation(movement.signature, 0.95),
    ]);

    const coverage = report.byKey.get(movement.key)!;
    expect(coverage.status).toBe("mapped");
    expect(coverage.annotationCount).toBe(3);
    expect(report.outsideSpace).toBe(0);
  });

  it("does not count a transposed observation as outside Level 1", () => {
    const report = buildCoverageReport(space, [annotation(twin, 0.5)]);
    expect(report.outsideSpace).toBe(0);
    expect(report.byKey.get(movement.key)!.status).toBe("partial");
  });

  it("lists the pair once in the gaps, not twice", () => {
    const report = buildCoverageReport(space, []);
    const keys = report.gaps.map((g) => g.movement.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(report.gaps.length).toBe(space.movements.length);
  });

  it("counts the whole space as pairs", () => {
    const report = buildCoverageReport(space, []);
    expect(report.total).toBe(space.movements.length);
    expect(report.unseen).toBe(space.movements.length);
  });

  it("keeps the transposed key resolvable through transposeKey()", () => {
    expect(transposeKey(movement.signature)).toBe(movement.transposeKey);
  });
});

describe("a sequence's own progress", () => {
  const movement = paired[0];
  const twin = transposeSignature(movement.signature);

  it("counts a movement and its transposition as one movement", () => {
    const report = buildCoverageReport(space, []);
    const own = coverageForKeys(report, [
      movement.key,
      signatureKey(twin),
    ]);

    expect(own.total).toBe(1);
    expect(own.unseen).toBe(1);
  });

  it("still counts two genuinely different movements as two", () => {
    const report = buildCoverageReport(space, []);
    const other = space.movements.find(
      (m) => m.key !== movement.key && m.key !== movement.transposeKey
    )!;
    const own = coverageForKeys(report, [movement.key, other.key]);

    expect(own.total).toBe(2);
  });
});

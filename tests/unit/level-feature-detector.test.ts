import { describe, it, expect } from "vitest";
import { detectLevelFeatures } from "$lib/shared/domain/curriculum/level-feature-detector";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(partial: Partial<SequenceData>): SequenceData {
  return {
    id: "t",
    name: "",
    word: "",
    steps: [],
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: {},
    ...partial,
  } as SequenceData;
}

function stepWith(motions: unknown, position?: Record<string, string>): unknown {
  return {
    stepNumber: 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions,
    ...(position ?? {}),
  };
}

describe("detectLevelFeatures", () => {
  it("returns L1 for a plain in/out radial sequence", () => {
    const s = seq({
      gridMode: "diamond",
      steps: [stepWith({
        left: { startLocation: "n", endLocation: "e", startOrientation: "in", endOrientation: "out", motionType: "pro" },
        right:  { startLocation: "s", endLocation: "w", startOrientation: "in", endOrientation: "out", motionType: "pro" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(false);
    expect(report.minLevel).toBe(1);
    expect(report.features).toEqual([]);
  });

  it("does NOT flag clock/counter as L4+ (L2 per user's model; handled by existing classifier)", () => {
    const s = seq({
      gridMode: "diamond",
      steps: [stepWith({
        left: { startLocation: "n", endLocation: "e", startOrientation: "in", endOrientation: "clock", motionType: "pro" },
        right:  { startLocation: "s", endLocation: "w", startOrientation: "in", endOrientation: "counter", motionType: "anti" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(false);
    expect(report.minLevel).toBe(1);
  });

  it("flags center location as L6", () => {
    const s = seq({
      gridMode: "centric",
      steps: [stepWith({
        left: { startLocation: "c", endLocation: "n", motionType: "hashOut" },
        right:  { startLocation: "s", endLocation: "e", motionType: "pro" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(6);
    expect(report.features.some((f) => f.includes("center"))).toBe(true);
    expect(report.features.some((f) => f.includes("gridMode:centric"))).toBe(true);
  });

  it("flags tau/terra positions as L6", () => {
    const s = seq({
      steps: [stepWith({}, { startPlacement: "tau3", endPlacement: "terra1" })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(6);
  });

  it("flags zeta/eta positions as L5", () => {
    const s = seq({
      gridMode: "skewed",
      steps: [stepWith({}, { startPlacement: "zeta5", endPlacement: "eta12" })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(5);
  });

  it("flags 8point grid mode as L5", () => {
    const s = seq({ gridMode: "8point", steps: [] });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(5);
  });

  it("flags interradial orientations as L4", () => {
    const s = seq({
      steps: [stepWith({
        left: { startOrientation: "in", endOrientation: "clockIn" },
        right:  { startOrientation: "out", endOrientation: "counterOut" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(4);
  });

  it("flags quarter turns as L4 even without orientations", () => {
    const s = seq({
      steps: [stepWith({
        left: { startLocation: "n", endLocation: "e", motionType: "pro", turns: 0.25 },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(4);
    expect(report.features.some((f) => f.includes("turns:0.25"))).toBe(true);
  });

  it("does NOT flag whole or half turns as L4", () => {
    const s = seq({
      gridMode: "diamond",
      steps: [stepWith({
        left: { startLocation: "n", endLocation: "e", motionType: "pro", turns: 1.5 },
        right:  { startLocation: "s", endLocation: "w", motionType: "anti", turns: 2 },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(false);
    expect(report.minLevel).toBe(1);
  });

  it("does NOT flag a negative float sentinel as a quarter turn", () => {
    const s = seq({
      gridMode: "diamond",
      steps: [stepWith({
        left: { startLocation: "n", endLocation: "e", motionType: "float", turns: -1 },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(false);
    expect(report.minLevel).toBe(1);
  });

  it("flags trigrid grid mode as L7", () => {
    const s = seq({ gridMode: "trigrid", steps: [] });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(7);
  });

  it("flags plane on motion as L8", () => {
    const s = seq({
      steps: [stepWith({
        left: { plane: "wall", startLocation: "n", endLocation: "e" },
        right:  { plane: "wheel", startLocation: "s", endLocation: "w" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.beyondLevel3).toBe(true);
    expect(report.minLevel).toBe(8);
    expect(report.features.some((f) => f.includes("plane:wall"))).toBe(true);
  });

  it("returns highest minLevel when multiple features present", () => {
    const s = seq({
      gridMode: "centric",
      steps: [stepWith({
        left: { plane: "wall", startLocation: "c", endLocation: "n" },
      })] as unknown as SequenceData["steps"],
    });
    const report = detectLevelFeatures(s);
    expect(report.minLevel).toBe(8);
  });
});

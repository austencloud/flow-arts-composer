import { describe, expect, it } from "vitest";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { BuiltTunnelLayer } from "./tunnel-layer-builder";
import { sampleTunnelNotation } from "./tunnel-notation-sampling";

function layer(id: string, arm: number, beats: string[]): BuiltTunnelLayer {
  const steps = beats.map((beat) => ({ id: beat })) as StepData[];
  return {
    stageInstanceId: id,
    arm,
    sequence: { steps } as unknown as SequenceData,
  } as BuiltTunnelLayer;
}

describe("composite tunnel notation sampling", () => {
  it("follows each baked stage instance's own transformed sequence and timing", () => {
    const layers = [
      layer("base", 0, ["A", "B", "C", "D"]),
      layer("mirror", 1, ["mirror-A", "mirror-B", "mirror-C", "mirror-D"]),
      layer("flip", 2, ["flip-A", "flip-B", "flip-C", "flip-D"]),
    ];
    const timing = new Map([
      ["base", { offset: 0, speed: 1 }],
      ["mirror", { offset: 1, speed: 1 }],
      ["flip", { offset: 0, speed: 0.25 }],
    ]);
    const sample = (step: number) =>
      sampleTunnelNotation(
        layers,
        step,
        (item) => timing.get(item.stageInstanceId)!
      );

    expect(sample(1).map(({ step }) => step.id)).toEqual([
      "A",
      "mirror-B",
      "flip-A",
    ]);
    expect(sample(5).map(({ step }) => step.id)).toEqual([
      "A",
      "mirror-B",
      "flip-B",
    ]);
    expect(sample(13).map(({ step }) => step.id)).toEqual([
      "A",
      "mirror-B",
      "flip-D",
    ]);
    expect(sample(17).map(({ step }) => step.id)).toEqual([
      "A",
      "mirror-B",
      "flip-A",
    ]);
  });

  it("keeps every stage appearance even when arms overlap or repeat", () => {
    const layers = Array.from({ length: 64 }, (_, arm) =>
      layer(`instance-${arm}`, arm % 8, [`pose-${arm}`])
    );
    const result = sampleTunnelNotation(layers, 1, () => ({
      offset: 0,
      speed: 1,
    }));
    expect(result).toHaveLength(64);
    expect(result.map(({ layer: item }) => item.stageInstanceId)).toEqual(
      layers.map((item) => item.stageInstanceId)
    );
  });
});

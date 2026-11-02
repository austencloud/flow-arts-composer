// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface GrapevineMotion {
  authoring: {
    sourceFrameRate: number;
    frameRate: number;
    frameCount: number;
    stepsPerLoop: number;
  };
  clips: Record<
    string,
    {
      asset: { file: string; sha256: string };
      measured: {
        depthMinimum: number;
        depthMaximum: number;
        minimumFootClearance: number;
        minimumLegClearance: number;
        pelvisSwayAmplitude: number;
        overSupportFraction: number;
        maximumLegLengthError: number;
      };
    }
  >;
}

const assetDirectory = resolve("static/animations/locomotion-pack");
const motion = JSON.parse(
  readFileSync(resolve(assetDirectory, "grapevine.motion.json"), "utf8")
) as GrapevineMotion;

function animationDurationSeconds(file: string): number {
  const glb = readFileSync(resolve(assetDirectory, file));
  expect(glb.toString("utf8", 0, 4)).toBe("glTF");
  const jsonLength = glb.readUInt32LE(12);
  const jsonType = glb.readUInt32LE(16);
  expect(jsonType).toBe(0x4e4f534a);
  const document = JSON.parse(
    glb.toString("utf8", 20, 20 + jsonLength)
  ) as {
    accessors: Array<{ max?: number[] }>;
    animations: Array<{ samplers: Array<{ input: number }> }>;
  };
  return Math.max(
    ...document.animations.flatMap((animation) =>
      animation.samplers.map(
        (sampler) => document.accessors[sampler.input]?.max?.[0] ?? 0
      )
    )
  );
}

describe("authored grapevine assets", () => {
  it("ships collision-safe high-rate motion tied to its measured manifest", () => {
    expect(motion.authoring).toMatchObject({
      sourceFrameRate: 30,
      frameRate: 120,
      frameCount: 253,
      stepsPerLoop: 4,
    });

    for (const clip of Object.values(motion.clips)) {
      const measured = clip.measured;
      expect(measured.depthMinimum).toBeLessThanOrEqual(-0.12);
      expect(measured.depthMaximum).toBeGreaterThanOrEqual(0.12);
      expect(measured.minimumFootClearance).toBeGreaterThanOrEqual(0.12);
      expect(measured.minimumLegClearance).toBeGreaterThanOrEqual(0.04);
      expect(measured.pelvisSwayAmplitude).toBeGreaterThanOrEqual(0.06);
      expect(measured.pelvisSwayAmplitude).toBeLessThanOrEqual(0.1);
      expect(measured.overSupportFraction).toBeGreaterThanOrEqual(0.15);
      expect(measured.maximumLegLengthError).toBeLessThanOrEqual(0.002);

      const asset = readFileSync(resolve(assetDirectory, clip.asset.file));
      const sha256 = createHash("sha256").update(asset).digest("hex");
      expect(sha256).toBe(clip.asset.sha256);
      expect(animationDurationSeconds(clip.asset.file)).toBeCloseTo(2.1, 4);
    }
  });
});

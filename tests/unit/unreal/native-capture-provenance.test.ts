import { describe, expect, it } from "vitest";
import {
  buildId,
  sha256,
  stableStringify,
  validateCaptureProvenance,
} from "../../../unreal/Shared/Tools/capture-provenance.mjs";

async function fixture() {
  const sequence = { steps: [{ duration: 1, letter: "A" }] };
  const build = {
    sourceCommit: "abc",
    sourceSHA256: "a".repeat(64),
    outputSHA256: "b".repeat(64),
  };
  return {
    schema: "flow-fest-native-performance-v1",
    character: "x-bot",
    propType: "staff",
    fps: 30,
    scoreUnitsPerSecond: 1,
    frames: Array.from({ length: 30 }, () => ({})),
    sequence,
    provenance: {
      schema: "tka-performance-capture-v1",
      build: { ...build, id: await buildId(build) },
      sequenceSHA256: await sha256(stableStringify(sequence)),
      rig: {
        characterId: "x-bot",
        sourcePath: "/rig.glb",
        sourceSHA256: "c".repeat(64),
      },
      props: {
        family: "staff",
        buildSHA256: build.outputSHA256,
        assets: [{ path: "/staff.glb", sha256: "d".repeat(64) }],
      },
      motionOptions: {
        bodyClearance: null,
        enableLocomotion: true,
        enableFootPlanting: true,
        playbackSpeed: 1,
        phaseOffsetSteps: 0,
        showEffects: false,
      },
      clock: {
        fps: 30,
        frameCount: 30,
        scoreUnitsPerSecond: 1,
        loopClosure: "first-frame-at-duration",
      },
    },
  };
}

describe("native capture provenance", () => {
  it("canonicalizes object keys without changing sequence order", () => {
    expect(stableStringify({ z: [2, 1], a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":[2,1]}'
    );
  });

  it("accepts a capture tied to its build, sequence, rig, prop and clock", async () => {
    const capture = await fixture();
    await expect(
      validateCaptureProvenance(capture, {
        expectedBuildId: capture.provenance.build.id,
        expectedSequence: capture.sequence,
        expectedRig: capture.provenance.rig,
        expectedProps: capture.provenance.props,
        expectedMotionOptions: capture.provenance.motionOptions,
        expectedClock: capture.provenance.clock,
      })
    ).resolves.toBe(capture.provenance);
  });

  it.each(["build", "sequence", "motionOptions", "clock", "rig", "props"])(
    "rejects stale %s on resume",
    async (part) => {
      const capture = await fixture();
      const expected = {
        expectedBuildId: capture.provenance.build.id,
        expectedSequence: capture.sequence,
        expectedRig: capture.provenance.rig,
        expectedProps: capture.provenance.props,
        expectedMotionOptions: capture.provenance.motionOptions,
        expectedClock: capture.provenance.clock,
      };
      if (part === "build") expected.expectedBuildId = "e".repeat(64);
      if (part === "sequence")
        expected.expectedSequence = { steps: [{ duration: 1, letter: "B" }] };
      if (part === "motionOptions")
        expected.expectedMotionOptions = {
          ...capture.provenance.motionOptions,
          showEffects: true,
        };
      if (part === "clock")
        expected.expectedClock = {
          ...capture.provenance.clock,
          frameCount: 31,
        };
      if (part === "rig")
        expected.expectedRig = {
          ...capture.provenance.rig,
          sourceSHA256: "e".repeat(64),
        };
      if (part === "props")
        expected.expectedProps = {
          ...capture.provenance.props,
          assets: [{ path: "/staff.glb", sha256: "e".repeat(64) }],
        };
      await expect(
        validateCaptureProvenance(capture, expected)
      ).rejects.toThrow(/provenance/);
    }
  );

  it("never verifies old captures without provenance", async () => {
    const capture = await fixture();
    delete (capture as { provenance?: unknown }).provenance;
    await expect(validateCaptureProvenance(capture)).rejects.toThrow(/schema/);
  });
});

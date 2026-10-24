import { describe, expect, it } from "vitest";
import {
  buildId,
  sha256,
  stableStringify,
} from "../../../unreal/Shared/Tools/capture-provenance.mjs";
import {
  createRuntimeMotionBundle,
  runtimeMotionTiming,
  runtimeMotionSampleTime,
  sourceGlbJson,
} from "../../../unreal/Shared/Tools/runtime-motion-bundle.mjs";
import { nativePropFrame } from "../../../unreal/Shared/Tools/native-prop-frame.mjs";
import { nativePropVariants } from "../../../unreal/Shared/Tools/native-prop-catalog.mjs";

const identity = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
const rigSHA256 = "c".repeat(64);

async function fixture(duration = 2 / 30) {
  const sequence = { steps: [{ duration, letter: "A" }] };
  const { frameCount } = runtimeMotionTiming(sequence);
  const sampleTime = (index: number) => runtimeMotionSampleTime(index, duration, frameCount);
  const build = {
    sourceCommit: "abc",
    sourceSHA256: "a".repeat(64),
    outputSHA256: "b".repeat(64),
  };
  const frame = (index: number) => ({
    frame: index,
    timeSeconds: sampleTime(index),
    performerWorld: identity,
    bones: [
      { name: "Root", parent: null, rootParentWorld: {
        ...identity, scale: [0.5, 0.5, 0.5],
      }, component: { ...identity, position: [sampleTime(index), 0, 0] } },
      { name: "Finger", parent: "Root", component: {
        ...identity, position: [sampleTime(index), 1, 0],
      } },
    ],
    leftHandWorld: [0, 0, 0], rightHandWorld: [0, 0, 0],
    leftProp: { propRootWorld: identity, rotatedBodyWorld: identity },
    rightProp: { propRootWorld: identity, rotatedBodyWorld: identity },
  });
  const capture = {
    schema: "flow-fest-native-performance-v1",
    captureRevision: "clock-isolated-body-v3",
    character: "x-bot",
    propType: "staff",
    fps: 30,
    scoreUnitsPerSecond: 1,
    sequence,
    frames: Array.from({ length: frameCount }, (_, index) => frame(index)),
    terminalFrame: frame(frameCount),
    provenance: {
      schema: "tka-performance-capture-v1",
      build: { ...build, id: await buildId(build) },
      sequenceSHA256: await sha256(stableStringify(sequence)),
      rig: { characterId: "x-bot", sourcePath: "/rig.glb", sourceSHA256: rigSHA256 },
      props: { family: "staff", buildSHA256: build.outputSHA256,
        assets: [{ path: "/staff.glb", sha256: "d".repeat(64) }] },
      motionOptions: { bodyClearance: null, enableLocomotion: true,
        enableFootPlanting: true, playbackSpeed: 1, phaseOffsetSteps: 0,
        showEffects: false },
      clock: { fps: 30, frameCount, durationSeconds: duration, scoreUnitsPerSecond: 1,
        loopClosure: "first-frame-at-duration" },
    },
  };
  const sourceGlb = { nodes: [
    { name: "Root", scale: [2, 2, 2], children: [1] },
    { name: "Finger", translation: [0, 1, 0] },
  ] };
  return { capture, sourceGlb };
}

describe("portable runtime motion bundle", () => {
  it("binds a selected plane to bundle identity while preserving legacy wall identity", async () => {
    const { capture, sourceGlb } = await fixture();
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    const wall = await createRuntimeMotionBundle(capture, options);
    expect(wall).not.toHaveProperty("capturePlane");
    const legacyIdentity = {
      characterId: wall.characterId, propId: wall.propId,
      rigSHA256, sequenceSHA256: wall.sequenceSHA256, loop: false,
    };
    expect(wall.bundleIdentitySHA256).toBe(await sha256(stableStringify(legacyIdentity)));
    for (const plane of ["wheel", "floor"]) {
      Object.assign(capture.provenance.motionOptions, { capturePlane: plane });
      const bundle = await createRuntimeMotionBundle(capture, options);
      expect(bundle.capturePlane).toBe(plane);
      expect(bundle.bundleIdentitySHA256).toBe(await sha256(stableStringify({
        ...legacyIdentity, capturePlane: plane,
      })));
      expect(bundle.bundleIdentitySHA256).not.toBe(wall.bundleIdentitySHA256);
    }
    Object.assign(capture.provenance.motionOptions, { capturePlane: "wall" });
    expect((await createRuntimeMotionBundle(capture, options)).bundleIdentitySHA256)
      .toBe(wall.bundleIdentitySHA256);
    for (const plane of ["unknown", null, 0]) {
      Object.assign(capture.provenance.motionOptions, { capturePlane: plane });
      await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("Invalid capture plane");
    }
  });

  it("preserves hidden-hand frames and defaults legacy visibility without losing transforms", async () => {
    const { capture, sourceGlb } = await fixture();
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    const legacy = await createRuntimeMotionBundle(capture, options);
    expect(legacy.frames.map(frame => frame.propVisibility)).toEqual([[true, true], [true, true], [true, true]]);
    Object.assign(capture.frames[0]!, { propVisibility: [false, true] });
    Object.assign(capture.frames[1]!, { propVisibility: [true, false] });
    Object.assign(capture.terminalFrame, { propVisibility: [false, false] });
    const hidden = await createRuntimeMotionBundle(capture, options);
    expect(hidden.frames.map(frame => frame.propVisibility)).toEqual([[false, true], [true, false], [false, false]]);
    expect(hidden.frames.map(frame => frame.prop)).toEqual(legacy.frames.map(frame => frame.prop));
    expect(await sha256(stableStringify(hidden))).not.toBe(await sha256(stableStringify(legacy)));
    for (const invalid of [null, false, [], [true], [true, false, true], [0, true], [true, "false"]]) {
      Object.assign(capture.frames[0]!, { propVisibility: invalid });
      await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("Invalid prop visibility at frame 0");
    }
  });

  it("records actual palm attachment and rejects detached v4 captures", async () => {
    const { capture, sourceGlb } = await fixture();
    capture.captureRevision = "monotonic-grip-validated-v4";
    Object.assign(capture.provenance.motionOptions, {
      contactMode: "prop-authoritative",
      reachPolicy: "paired-body-final-socket-v1",
    });
    for (const frame of [...capture.frames, capture.terminalFrame]) {
      Object.assign(frame, {
        gripAttachment: {
          leftPalmWorld: [0.001, 0, 0],
          rightPalmWorld: [0, 0, 0],
          leftRenderedGripWorld: [0, 0, 0],
          rightRenderedGripWorld: [0, 0, 0],
        },
      });
      Object.assign(frame.leftProp, { correctionWorld: identity });
      Object.assign(frame.rightProp, { correctionWorld: identity });
    }
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    const bundle = await createRuntimeMotionBundle(capture, options);
    expect(bundle.gripValidation).toMatchObject({
      maxErrorCm: 0.1,
      limitCm: 0.2,
      sideSamples: 6,
    });
    capture.frames[0]!.propVisibility = [false, true];
    capture.frames[0]!.gripAttachment.leftPalmWorld = [10, 0, 0];
    const hidden = await createRuntimeMotionBundle(capture, options);
    expect(hidden.gripValidation.sideSamples).toBe(5);
    expect(hidden.gripValidation.maxErrorCm).toBe(0.1);
    capture.frames[0]!.gripAttachment.leftRenderedGripWorld = null;
    expect((await createRuntimeMotionBundle(capture, options)).gripValidation.sideSamples).toBe(5);
    capture.frames[0]!.gripAttachment.leftPalmWorld = null;
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("Missing actual palm");
    capture.frames[0]!.gripAttachment.leftPalmWorld = [10, 0, 0];
    capture.frames[0]!.propVisibility = [true, true];
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("Missing actual palm");
    capture.frames[0]!.gripAttachment.leftRenderedGripWorld = [0, 0, 0];
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("Detached palm");
    capture.frames[0]!.gripAttachment.leftPalmWorld = [0.001, 0, 0];
    Object.assign(capture.provenance.motionOptions, { contactMode: "legacy" });
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow(
      "strict palm contact policy"
    );
    Object.assign(capture.provenance.motionOptions, {
      contactMode: "prop-authoritative",
    });
    Object.assign(capture.frames[0]!.leftProp, {
      correctionWorld: { ...identity, position: [1, 0, 0] },
    });
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow(
      "Prop root differs"
    );
    Object.assign(capture.frames[0]!.leftProp, { correctionWorld: identity });
    Object.assign(capture.frames[0]!, {
      gripAttachment: {
        leftPalmWorld: [0.003, 0, 0],
        leftRenderedGripWorld: [0, 0, 0],
      },
    });
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow(
      "Detached palm"
    );
  });

  it("preserves independent dynamic palm calibration and validates every v5 sample", async () => {
    const { capture, sourceGlb } = await fixture();
    capture.captureRevision = "monotonic-dynamic-grip-v5";
    Object.assign(capture.provenance.motionOptions, {
      contactMode: "prop-authoritative", reachPolicy: "paired-body-final-socket-v1",
    });
    const samples = [...capture.frames, capture.terminalFrame];
    for (const frame of samples) {
      Object.assign(frame, {
        palmLocal: [0.01, 0.02, 0.03, -0.01, 0.02, 0.03], gripRelaxation: 0.75,
        gripAttachment: { leftPalmWorld: [0, 0, 0], rightPalmWorld: [0, 0, 0],
          leftRenderedGripWorld: [0, 0, 0], rightRenderedGripWorld: [0, 0, 0] },
      });
      Object.assign(frame.leftProp, { correctionWorld: identity });
      Object.assign(frame.rightProp, { correctionWorld: identity });
    }
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    const bundle = await createRuntimeMotionBundle(capture, options);
    expect(bundle.frames.at(-1)).toMatchObject({
      palmLocal: [0.01, 0.02, 0.03, -0.01, 0.02, 0.03], gripRelaxation: 0.75,
    });
    for (const invalid of [undefined, NaN, -0.01, 1.01]) {
      Object.assign(capture.terminalFrame, { gripRelaxation: invalid });
      await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("dynamic grip");
    }
    Object.assign(capture.terminalFrame, { gripRelaxation: 0 });
    for (const palmLocal of [undefined, [0, 0, 0], [0.501, 0, 0, 0, 0, 0], [NaN, 0, 0, 0, 0, 0]]) {
      Object.assign(capture.terminalFrame, { palmLocal });
      await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("dynamic grip");
    }
  });

  it("preserves the renderer length and accepts legacy captures without it", async () => {
    const { capture, sourceGlb } = await fixture();
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    expect(await createRuntimeMotionBundle(capture, options)).not.toHaveProperty("effectivePropLengthCm");
    for (const frame of [...capture.frames, capture.terminalFrame])
      Object.assign(frame, { effectivePropLengthCm: 87.770825 });
    expect((await createRuntimeMotionBundle(capture, options)).effectivePropLengthCm).toBe(87.770825);
    Object.assign(capture.frames[1]!, { effectivePropLengthCm: 90 });
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("length changed");
    for (const invalid of [0, -1, NaN, Infinity, 1001, "90", null]) {
      Object.assign(capture.frames[0]!, { effectivePropLengthCm: invalid });
      await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow("effective prop length");
    }
  });

  it.each([0.25, 1.01, 0.001])("keeps authored duration %s and exact terminal with bounded uniform intervals", async duration => {
    const { capture, sourceGlb } = await fixture(duration);
    const count = Math.ceil(duration * 30);
    expect(capture.frames).toHaveLength(count);
    const interval = duration / count;
    expect(interval).toBeLessThanOrEqual(1 / 30);
    for (let index = 0; index < count; index++)
      expect(capture.frames[index]!.timeSeconds).toBeCloseTo(index * interval, 12);
    expect(capture.terminalFrame.timeSeconds).toBe(duration);
    const options = { sourceGlb, sourceRigSHA256: rigSHA256 };
    const once = await createRuntimeMotionBundle(capture, { ...options, loop: false });
    expect(once.frameCount).toBe(count + 1);
    expect(once.durationSeconds).toBe(duration);
    expect(once.frames.at(-1).bones[0][0]).toBe(Math.round(duration * 1e5) / 1e5);
    const { terminalFrame, ...loopCapture } = capture;
    const loop = await createRuntimeMotionBundle(loopCapture, { ...options, loop: true });
    expect(loop.frameCount).toBe(count);
    expect(loop.durationSeconds).toBe(duration);
    expect(loop.frames.at(-1).bones[0][0]).toBe(Math.round((count - 1) * interval * 1e5) / 1e5);
  });

  it("rejects a fixed-30 fractional clock, stale timing provenance and excessive durations", async () => {
    const { capture, sourceGlb } = await fixture(.25);
    const options = { sourceGlb, sourceRigSHA256: rigSHA256, loop: false };
    capture.frames[1]!.timeSeconds = 1 / 30;
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow(/clock changed/i);
    capture.frames[1]!.timeSeconds = .25 / 8;
    capture.provenance.clock.durationSeconds = .3;
    await expect(createRuntimeMotionBundle(capture, options)).rejects.toThrow(/clock duration/i);
    expect(runtimeMotionTiming({ steps: [{ duration: 600 }] }).frameCount).toBe(18000);
    for (const duration of [0, -1, Infinity, 600.001])
      expect(() => runtimeMotionTiming({ steps: [{ duration }] })).toThrow();
  });

  it("accepts preserved whole-frame capture clocks without added metadata", async () => {
    const { capture, sourceGlb } = await fixture();
    // 31/30 * 30 rounds above 31 in IEEE doubles; keep its exact legacy count.
    expect(runtimeMotionTiming({ steps: [{ duration: 31 / 30 }] }).frameCount).toBe(31);
    const { durationSeconds, ...legacyClock } = capture.provenance.clock;
    const legacyCapture = { ...capture, provenance: { ...capture.provenance, clock: legacyClock } };
    expect(capture.frames.map(frame => frame.timeSeconds)).toEqual([0, 1 / 30]);
    const bundle = await createRuntimeMotionBundle(legacyCapture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    });
    expect(bundle.durationSeconds).toBe(2 / 30);
    expect(bundle.frameCount).toBe(3);
  });

  it("matches GLTFLoader bone names while rejecting ambiguous source names", async () => {
    const { capture, sourceGlb } = await fixture();
    sourceGlb.nodes[0].name = "Ro:ot";
    sourceGlb.nodes[1].name = "Fin:ger";
    const bundle = await createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    });
    expect(bundle.skeleton.bones.map((bone: { name: string }) => bone.name))
      .toEqual(["Root", "Finger"]);
    sourceGlb.nodes.push({ name: "Root", scale: [1, 1, 1], children: [] });
    await expect(createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    })).rejects.toThrow(/Duplicate GLB node Root/);
  });
  it("preserves exact native build identity independently of its motion family", async () => {
    const { capture, sourceGlb } = await fixture();
    const exactCapture = { ...capture, nativePropId: "staff:default" };
    const bundle = await createRuntimeMotionBundle(exactCapture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    });
    expect(bundle.propId).toBe("staff:default");
    expect(bundle.propFamily).toBe("staff");
    const changed = await createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    });
    expect(bundle.bundleIdentitySHA256).not.toBe(changed.bundleIdentitySHA256);
    expect(nativePropVariants("triangle").find(variant => variant.id === "side")?.triangleGrip).toBe("side");
    expect(nativePropVariants("fan").find(variant => variant.id === "day_white_covered"))
      .toMatchObject({ fanBuild: "day", fanFrameColor: "white", fanCover: "covered" });
  });
  it("reads the exact binary glTF source used for rest calibration", () => {
    const json = new TextEncoder().encode('{"nodes":[{"name":"Root"}]} ');
    const bytes = new Uint8Array(20 + json.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, bytes.length, true);
    view.setUint32(12, json.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    bytes.set(json, 20);
    expect(sourceGlbJson(bytes).nodes[0].name).toBe("Root");
    view.setUint32(8, bytes.length + 1, true);
    expect(() => sourceGlbJson(bytes)).toThrow(/complete binary glTF/);
  });

  it("keeps full performer-space TRS, source bind scale and native prop frames", async () => {
    const { capture, sourceGlb } = await fixture();
    const bundle = await createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    });
    expect(bundle.schema).toBe("flow-arts-runtime-motion-v1");
    expect(bundle.loop).toBe(false);
    expect(bundle.frameCount).toBe(3);
    expect(bundle.durationSeconds).toBeCloseTo(2 / 30);
    expect(bundle.skeleton.space).toBe("three-performer-meters");
    expect(bundle.skeleton.bones.map((bone: { name: string }) => bone.name)).toEqual(["Root", "Finger"]);
    expect(bundle.skeleton.bones[0].rest.slice(7)).toEqual([2, 2, 2]);
    expect(bundle.skeleton.bones[0].bind.slice(7)).toEqual([1, 1, 1]);
    expect(bundle.skeleton.bones[1].bind.slice(0, 3)).toEqual([0, 1, 0]);
    expect(bundle.frames[1].bones[1]).toEqual([1 / 30, 1, 0, 0, 0, 0, 1, 1, 1, 1]
      .map(value => Math.round(value * 1e5) / 1e5));
    expect(bundle.frames[0].prop).toHaveLength(28);
    expect(bundle.frames[0].prop).toEqual(nativePropFrame(capture.frames[0]));
  });

  it("rejects stale rigs and incomplete finger tracks", async () => {
    const { capture, sourceGlb } = await fixture();
    await expect(createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: "e".repeat(64),
    })).rejects.toThrow(/rig hash/i);
    capture.frames[1].bones.pop();
    await expect(createRuntimeMotionBundle(capture, {
      sourceGlb, sourceRigSHA256: rigSHA256, loop: false,
    })).rejects.toThrow(/incomplete captured bone/i);
  });
});

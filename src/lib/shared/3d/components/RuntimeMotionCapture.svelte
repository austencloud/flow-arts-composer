<script lang="ts">
  import { onMount } from "svelte";
  import { yieldToScheduler } from "#lib/shared/foundation/utils/background-scheduling.js";
  import { Canvas, T } from "@threlte/core";
  import { PropType, type Plane, type PropBuild } from "@austencloud/scene-3d";
  import type { CharacterId } from "../domain/character-model.js";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import type { PerformerHandDistance } from "#lib/shared/3d/domain/performer-hand-distance.js";
  import type { CaptureReachInputPolicy } from "../domain/performer-orbit-fit.js";
  import CanvasLifecycle from "./CanvasLifecycle.svelte";
  import NativeCaptureScene from "../native-capture/NativeCaptureScene.svelte";
  import { nativePropId } from "../unreal/domain/native-prop-selection.js";
  import { captureWarmupTimes, normalizeCaptureSequence } from "../native-capture/capture-score-time.js";
  import { buildId, sha256, stableStringify } from "../../../../../unreal/Shared/Tools/capture-provenance.mjs";
  import { createRuntimeMotionBundle, runtimeMotionSampleTime, runtimeMotionTiming, sourceGlbJson } from "../../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { CapturedPoseClip } from "../native-capture/captured-pose-player.js";

  interface MotionBundle extends Record<string, unknown> {
    characterId: string;
    propId: string;
    propFamily: string;
    sequenceSHA256: string;
    effectivePropLengthCm?: number;
  }

  interface Props {
    sequence: SequenceData;
    character?: CharacterId;
    propType?: PropType;
    propBuild?: PropBuild;
    effectId?: string;
    effortId?: EffortId;
    staffLengthCm?: number | null;
    handDistance?: PerformerHandDistance;
    captureReachInputPolicy?: CaptureReachInputPolicy;
    capturePlane?: "wall" | "wheel" | "floor";
    leftPlane?: Plane;
    rightPlane?: Plane;
    beatPlaneOverrides?: ReadonlyMap<number, { left?: Plane; right?: Plane }>;
    leftFlipped?: boolean;
    rightFlipped?: boolean;
    onComplete: (bundle: MotionBundle, pose: CapturedPoseClip) => void;
    onError: (message: string) => void;
    onProgress: (phase: "warming" | "capturing", frame: number, total: number) => void;
  }
  let {
    sequence,
    character = "x-bot",
    propType = PropType.FIRE_DOUBLE_STAFF,
    propBuild,
    effectId = "fire",
    effortId,
    staffLengthCm,
    handDistance,
    captureReachInputPolicy,
    capturePlane: requestedCapturePlane,
    leftPlane,
    rightPlane,
    beatPlaneOverrides,
    leftFlipped,
    rightFlipped,
    onComplete,
    onError,
    onProgress,
  }: Props = $props();
  const capturePlane = $derived(
    requestedCapturePlane ?? (leftPlane === rightPlane &&
      (leftPlane === "wall" || leftPlane === "wheel" || leftPlane === "floor")
      ? leftPlane
      : "wall")
  );
  const normalizedSequence = normalizeCaptureSequence(sequence);
  let scene: NativeCaptureScene;
  let rigReady = $state(false);
  let rigError: string | null = null;
  let cancelled = false;

  function alive(): void {
    if (cancelled) throw new Error("Capture cancelled");
  }

  async function assetBytes(path: string): Promise<ArrayBuffer> {
    const response = await fetch(path);
    alive();
    if (!response.ok) throw new Error(`Capture asset unavailable: ${path}`);
    const bytes = await response.arrayBuffer();
    alive();
    return bytes;
  }

  async function run(callbacks: Pick<Props, "onComplete" | "onError" | "onProgress">): Promise<void> {
    try {
      const deadline = performance.now() + 45_000;
      while (!rigReady || !scene?.hasRenderedRig()) {
        alive();
        if (rigError) throw new Error(`Capture motion rig failed: ${rigError}`);
        if (performance.now() > deadline) throw new Error(`${character} capture rig did not become ready`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      alive();
      scene.pauseAutoLoop();
      const normalized = normalizedSequence;
      if (!normalized.steps?.length || normalized.steps.length > 1024)
        throw new Error("Motion capture needs 1–1024 timed steps");
      const { durationSeconds, frameCount } = runtimeMotionTiming(normalized);
      await scene.settleCapturePose(captureWarmupTimes(true, durationSeconds, frameCount), durationSeconds,
        (frame, total) => { alive(); callbacks.onProgress("warming", frame, total); });
      alive();

      const settings = scene.captureSettings();
      const rigBytes = await assetBytes(settings.rigPath);
      const rigSHA256 = await sha256(rigBytes);
      const sourceBytes = await assetBytes(import.meta.url);
      const sourceSHA256 = await sha256(sourceBytes);
      const build = {
        sourceCommit: "composer-live-module",
        sourceSHA256,
        outputSHA256: sourceSHA256,
      };
      const provenance = {
        schema: "tka-performance-capture-v1",
        build: { id: await buildId(build), ...build },
        sequenceSHA256: await sha256(stableStringify(normalized)),
        rig: { characterId: settings.character, sourcePath: settings.rigPath, sourceSHA256: rigSHA256 },
        props: {
          family: settings.propType,
          buildSHA256: sourceSHA256,
          assets: await Promise.all(settings.propPaths.map(async (path: string) => ({
            path, sha256: await sha256(await assetBytes(path)),
          }))),
        },
        motionOptions: settings.motionOptions,
        clock: {
          fps: 30, frameCount,
          ...(durationSeconds === frameCount / 30 ? {} : { durationSeconds }),
          scoreUnitsPerSecond: 1,
          loopClosure: "first-frame-at-duration",
        },
      };
      alive();
      const frames = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        alive();
        frames.push(await scene.sampleFrame(frame, false,
          runtimeMotionSampleTime(frame, durationSeconds, frameCount)));
        alive();
        if ((frame + 1) % 4 === 0 || frame + 1 === frameCount) {
          callbacks.onProgress("capturing", frame + 1, frameCount);
        }
        await yieldToScheduler();
        alive();
      }
      const selectedNativePropId = nativePropId(settings.propType, settings.propBuild, {
        leftFlipped, rightFlipped,
      });
      const capture = {
        schema: "flow-fest-native-performance-v1",
        captureRevision: "monotonic-dynamic-grip-v5",
        source: "LiveSequencePerformer3D production generator",
        character: settings.character, role: "RuntimeMotion", propType: settings.propType,
        effectId: settings.effectId, fps: 30, scoreUnitsPerSecond: 1,
        scoreSteps: normalized.steps.length, sequence: normalized, provenance,
        nativePropId: selectedNativePropId,
        coordinateSystem: "Three.js: meters, +Y up; bone TRS is local to parent; performer and prop TRS are world-space",
        propTransform: "correctionWorld includes post-IK grip correction; renderedMeshes records each actual final mesh world TRS, including intrinsic GLB orientation and scale",
        frames,
      };
      const bundle = await createRuntimeMotionBundle(capture, {
        sourceGlb: sourceGlbJson(rigBytes), sourceRigSHA256: rigSHA256, loop: true,
      });
      alive();
      callbacks.onComplete(bundle as MotionBundle, { frames, durationSeconds, loop: true });
    } catch (error) {
      if (!cancelled) callbacks.onError(error instanceof Error ? error.message : String(error));
    }
  }

  onMount(() => {
    // Parent props can be reactive getters from a keyed @const. Keep the
    // callbacks owned by this capture even if that derived later invalidates.
    const callbacks = { onComplete, onError, onProgress };
    void run(callbacks);
    return () => { cancelled = true; };
  });
</script>

<div class="capture-canvas" aria-hidden="true">
  <Canvas>
    <CanvasLifecycle />
    <T.PerspectiveCamera makeDefault position={[0, 1.6, 5]} />
    <T.AmbientLight intensity={2} />
    <NativeCaptureScene bind:this={scene} {character} {propType} {propBuild}
      {effectId} {effortId} {staffLengthCm} {handDistance} {captureReachInputPolicy} {leftPlane} {rightPlane}
      {beatPlaneOverrides} {leftFlipped} {rightFlipped} {capturePlane}
      sequence={normalizedSequence} onReady={() => { rigReady = true; }}
      onMotionError={(message) => { rigError = message; }} />
  </Canvas>
</div>

<style>
  .capture-canvas { position: absolute; width: 1px; height: 1px; overflow: hidden; pointer-events: none; }
</style>

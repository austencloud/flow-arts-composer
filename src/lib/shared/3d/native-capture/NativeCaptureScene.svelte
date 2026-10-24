<script lang="ts">
  import { tick } from "svelte";
  import { useRenderer, useScheduler, useThrelte } from "@threlte/core";
  import type { Scene, WebGLRenderer } from "three";
  import {
    resolveThrelteRenderer,
    resolveThrelteScene,
  } from "#lib/shared/3d/scene-boot/threlte-handles.js";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import {
    getCharacterModelPath,
    type CharacterId,
  } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType as AppPropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    PROP_MODEL_REGISTRY,
    propFinishState,
    Plane,
    type PropBuild,
    type PropType as ScenePropType,
  } from "@austencloud/scene-3d";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import type { CaptureReachInputPolicy } from "#lib/shared/3d/domain/performer-orbit-fit.js";
  import { captureHandDistanceKey, type PerformerHandDistance } from "#lib/shared/3d/domain/performer-hand-distance.js";
  import { captureNativeFrame, productionRigReady } from "./native-capture.js";
  import { scoreAtCaptureTime } from "./capture-score-time.js";
  import { primeCaptureScheduler, runCaptureScheduler } from "./capture-scheduler.js";
  import { captureGripAttachment, assertCaptureGripAttachment } from "./capture-grip.js";

  interface Props {
    character: CharacterId;
    propType: ScenePropType;
    effectId: string;
    propBuild?: PropBuild;
    leftFlipped?: boolean;
    rightFlipped?: boolean;
    effortId?: EffortId;
    staffLengthCm?: number | null;
    handDistance?: PerformerHandDistance;
    captureReachInputPolicy?: CaptureReachInputPolicy;
    leftPlane?: Plane;
    rightPlane?: Plane;
    beatPlaneOverrides?: ReadonlyMap<number, { left?: Plane; right?: Plane }>;
    sequence: SequenceData;
    capturePlane?: "wall" | "wheel" | "floor";
    onReady: () => void;
    onMotionError?: (message: string) => void;
  }
  const props: Props = $props();
  const capturedPropBuild = props.propBuild ?? propFinishState.build;
  const capturedEffortId = props.effortId ?? "linear";
  const capturedLeftPlane: Plane = props.leftPlane ?? props.capturePlane ?? Plane.WALL;
  const capturedRightPlane: Plane = props.rightPlane ?? props.capturePlane ?? Plane.WALL;
  const id = "native-export";
  const motionOptions = {
    contactMode: "prop-authoritative",
    reachPolicy: "paired-body-final-socket-v1",
    ...(props.captureReachInputPolicy === "viewer"
      ? { captureReachInputPolicy: "viewer" }
      : {}),
    bodyClearance: null,
    enableLocomotion: true,
    enableFootPlanting: true,
    playbackSpeed: 1,
    phaseOffsetSteps: 0,
    showEffects: false,
    ...(props.capturePlane && props.capturePlane !== "wall" ? { capturePlane: props.capturePlane } : {}),
    propBuild: capturedPropBuild,
    ...(props.leftFlipped ? { leftFlipped: true } : {}),
    ...(props.rightFlipped ? { rightFlipped: true } : {}),
    ...(props.staffLengthCm != null ? { staffLengthCm: props.staffLengthCm } : {}),
    ...(props.handDistance ? { handDistance: captureHandDistanceKey(props.handDistance) } : {}),
    effortId: capturedEffortId,
    leftPlane: capturedLeftPlane,
    rightPlane: capturedRightPlane,
    ...(props.beatPlaneOverrides?.size
      ? { beatPlaneOverrides: [...props.beatPlaneOverrides.entries()].sort(([a], [b]) => a - b) }
      : {}),
  } as const;
  const { renderer: rendererValue, scene: sceneValue, camera } = useThrelte();
  const { autoRenderTask } = useRenderer<WebGLRenderer>();
  const renderer = resolveThrelteRenderer(rendererValue);
  const scene = resolveThrelteScene(sceneValue) as Scene;
  const { scheduler, resetFrameInvalidation } = useScheduler();
  let performer: LiveSequencePerformer3D;
  let captureClockOriginMs = 0;
  let gripRevision = 0;
  let gripAttachment: ReturnType<typeof captureGripAttachment> | undefined;

  // The rig must not accumulate an arbitrary number of live idle/mixer frames
  // while its asynchronous assets load. Manual capture owns the first frame.
  renderer.setAnimationLoop(null);

  export function pauseAutoLoop(): void {
    renderer.setAnimationLoop(null);
    autoRenderTask.stop();
    captureClockOriginMs = primeCaptureScheduler(scheduler, performance.now());
  }

  export function hasRenderedRig(): boolean {
    return productionRigReady(scene, id);
  }

  // Capture advances the scene with a manual clock and stops Threlte's render
  // task. Present only the completed pose so the visible viewport stays useful.
  export function renderPreview(): void {
    renderer.render(scene, camera.current);
  }

  export function captureSettings() {
    const model =
      PROP_MODEL_REGISTRY[props.propType as keyof typeof PROP_MODEL_REGISTRY];
    return {
      rigPath: getCharacterModelPath(props.character),
      propPaths: [
        ...new Set(
          [
            ...(model ? [model.modelUrl, model.rightHandModelUrl] : []),
          ].filter((path): path is string => typeof path === "string")
        ),
      ],
      character: props.character,
      propType: props.propType,
      effectId: props.effectId,
      propBuild: capturedPropBuild,
      motionOptions,
    };
  }

  export async function settleCapturePose(
    loopWarmupTimes: readonly number[] = [], loopDurationSeconds = 0,
    onWarmupProgress?: (frame: number, total: number) => void
  ): Promise<void> {
    performer.seekScore(0);
    await tick();
    const frameMs = 1000 / 30;
    // Settle the renderer IK blend before recording its first pose.
    const warmupFrames = 90;
    const totalWarmupFrames = warmupFrames + loopWarmupTimes.length;
    async function reportWarmup(frame: number): Promise<void> {
      if (frame % 4 === 0 || frame === totalWarmupFrames)
        onWarmupProgress?.(frame, totalWarmupFrames);
      // Every pose can take substantial CPU. Let the browser handle input
      // before the next pose while keeping the exact capture samples.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    for (let step = 1; step <= warmupFrames; step += 1) {
      runCaptureScheduler(scheduler, captureClockOriginMs + step * frameMs);
      resetFrameInvalidation();
      await tick();
      await reportWarmup(step);
    }
    captureClockOriginMs += warmupFrames * frameMs;
    // The first recorded loop frame must inherit the elbow route from the
    // preceding authored cycle, just as the live performer does.
    for (const [index, timeSeconds] of loopWarmupTimes.entries()) {
      performer.seekScore(scoreAtCaptureTime(props.sequence.steps, timeSeconds));
      await tick();
      const ms = captureClockOriginMs + timeSeconds * 1000;
      runCaptureScheduler(scheduler, ms);
      resetFrameInvalidation();
      await tick();
      runCaptureScheduler(scheduler, ms);
      resetFrameInvalidation();
      await reportWarmup(warmupFrames + index + 1);
    }
    if (loopWarmupTimes.length) captureClockOriginMs += loopDurationSeconds * 1000;
  }

  export async function sampleFrame(
    frame: number,
    terminal = false,
    timeSeconds = frame / 30
  ) {
    const elapsedScore = scoreAtCaptureTime(props.sequence.steps, timeSeconds);
    // seekScore wraps an exact sequence endpoint to its first pose. A one-shot
    // capture samples immediately before that wrap and holds it at the end.
    const score = terminal ? elapsedScore - 1e-8 : elapsedScore;
    performer.seekScore(score);
    await tick();
    const ms = captureClockOriginMs + (timeSeconds === frame / 30
      ? frame * (1000 / 30) : timeSeconds * 1000);
    runCaptureScheduler(scheduler, ms);
    resetFrameInvalidation();
    // The first pass applies score-driven state; the second settles IK and grip correction.
    await tick();
    const previousGripRevision = gripRevision;
    runCaptureScheduler(scheduler, ms);
    resetFrameInvalidation();
    const propVisibility = performer.capturePropVisibility();
    assertCaptureGripAttachment(gripAttachment, gripRevision > previousGripRevision, propVisibility, { frame, score });
    return { ...captureNativeFrame(scene, id, frame, score, gripAttachment, propVisibility), timeSeconds,
      effectivePropLengthCm: performer.captureEffectivePropLengthCm(),
      gripAttachment };
  }
</script>

<LiveSequencePerformer3D
  bind:this={performer}
  {id}
  position={{ x: 0, y: 0, z: 0 }}
  facingAngle={0}
  characterId={props.character}
  propType={props.propType as unknown as AppPropType}
  effectId={props.effectId}
  propBuild={capturedPropBuild}
  leftPropFlipped={props.leftFlipped}
  rightPropFlipped={props.rightFlipped}
  effortId={capturedEffortId}
  propLengthCm={props.staffLengthCm}
  handDistance={props.handDistance}
  captureReachInputPolicy={props.captureReachInputPolicy}
  leftPlane={capturedLeftPlane}
  rightPlane={capturedRightPlane}
  beatPlaneOverrides={props.beatPlaneOverrides}
  sequence={props.sequence}
  capturePlane={props.capturePlane}
  active={false}
  playbackSpeed={motionOptions.playbackSpeed}
  phaseOffsetSteps={motionOptions.phaseOffsetSteps}
  showEffects={motionOptions.showEffects}
  enableLocomotion={motionOptions.enableLocomotion}
  enableFootPlanting={motionOptions.enableFootPlanting}
  bodyClearance={motionOptions.bodyClearance}
  onMotionReady={props.onReady}
  onMotionError={props.onMotionError}
  onCollisionEvents={(_events, _diagnostics, gripDiagnostics) => {
    gripAttachment = captureGripAttachment(gripDiagnostics);
    gripRevision += 1;
  }}
/>

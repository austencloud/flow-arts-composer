<script lang="ts">
  import { tick } from "svelte";
  import { useScheduler, useThrelte } from "@threlte/core";
  import type { Scene } from "three";
  import {
    resolveThrelteRenderer,
    resolveThrelteScene,
  } from "#lib/shared/3d/scene-boot/threlte-handles.js";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType as AppPropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PropType as ScenePropType } from "@austencloud/scene-3d";
  import { captureNativeFrame, productionRigReady } from "./native-capture.js";

  interface Props {
    character: CharacterId;
    propType: ScenePropType;
    effectId: "fire" | "led";
    sequence: SequenceData;
    onReady: () => void;
  }
  const props: Props = $props();
  const id = "native-export";
  const {
    renderer: rendererValue,
    scene: sceneValue,
    autoRenderTask,
  } = useThrelte();
  const renderer = resolveThrelteRenderer(rendererValue);
  const scene = resolveThrelteScene(sceneValue) as Scene;
  const { scheduler, resetFrameInvalidation } = useScheduler();
  let performer: LiveSequencePerformer3D;

  export function pauseAutoLoop(): void {
    renderer.setAnimationLoop(null);
    autoRenderTask.stop();
  }

  export function hasRenderedRig(): boolean {
    return productionRigReady(scene, id);
  }

  export async function sampleFrame(
    frame: number
  ): Promise<ReturnType<typeof captureNativeFrame>> {
    const score = frame / 30;
    performer.seekScore(score);
    await tick();
    const ms = frame * (1000 / 30);
    scheduler.run(ms);
    resetFrameInvalidation();
    // The first pass applies score-driven state; the second settles IK and grip correction.
    await tick();
    scheduler.run(ms);
    resetFrameInvalidation();
    return captureNativeFrame(scene, id, frame, score);
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
  sequence={props.sequence}
  active={false}
  playbackSpeed={1}
  phaseOffsetSteps={0}
  showEffects={false}
  enableLocomotion={true}
  enableFootPlanting={true}
  onReady={props.onReady}
/>

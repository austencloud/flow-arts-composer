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
  import type { FlowFestPerformerRole } from "../flow-fest-sim/flow-fest-performer-sequences.js";
  import { FLOW_FEST_PERFORMER_PROFILES } from "../flow-fest-sim/flow-fest-performer-sequences.js";
  import { captureNativeFrame } from "./native-capture.js";

  interface Props {
    character: CharacterId;
    role: FlowFestPerformerRole;
    sequence: SequenceData;
    onReady: () => void;
  }
  const props: Props = $props();
  const profile = $derived(FLOW_FEST_PERFORMER_PROFILES[props.role]);
  const id = "native-export";
  const { renderer: rendererValue, scene: sceneValue } = useThrelte();
  const renderer = resolveThrelteRenderer(rendererValue);
  const scene = resolveThrelteScene(sceneValue) as Scene;
  const { scheduler, resetFrameInvalidation } = useScheduler();
  let performer: LiveSequencePerformer3D;

  export function pauseAutoLoop(): void {
    renderer.setAnimationLoop(null);
  }

  export function hasRenderedRig(): boolean {
    const root = scene.getObjectByName(`PERFORMER_${id}`);
    let skinned = false;
    root?.traverse((object) => {
      if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
    });
    return skinned;
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
  propType={profile.propType}
  effectId={profile.effectId}
  sequence={props.sequence}
  active={false}
  playbackSpeed={1}
  phaseOffsetSteps={0}
  showEffects={false}
  enableLocomotion={true}
  enableFootPlanting={true}
  onReady={props.onReady}
/>

<script lang="ts">
  import { useStage, useTask, useThrelte } from "@threlte/core";
  import { onDestroy } from "svelte";
  import {
    CapturedPosePlayer,
    type CapturedPoseClip,
  } from "../native-capture/captured-pose-player";
  import { productionRigReady } from "../native-capture/native-capture";
  import { resolveThrelteScene } from "../scene-boot/threlte-handles";
  import { usePropEffectStages } from "../effects/prop-effect-stages";

  let {
    performerId,
    clip,
    sampleTime,
  }: {
    performerId: string;
    clip: CapturedPoseClip;
    sampleTime: () => number;
  } = $props();
  const { scene: sceneValue, mainStage, scheduler } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const restoreStage = useStage(Symbol("restore-live-pose"), {
    before: mainStage,
  });
  const { pose: playbackStage } = usePropEffectStages();
  let player: CapturedPosePlayer | undefined;

  // The live solver must never start from a pose supplied by the renderer.
  useTask(() => player?.restore(), { stage: restoreStage });
  useTask(
    () => {
      if (player && !player.isAttached()) {
        player.restore();
        player = undefined;
      }
      if (
        !player &&
        productionRigReady(scene, performerId) &&
        CapturedPosePlayer.canBind(scene, performerId)
      ) {
        player = new CapturedPosePlayer(scene, performerId, clip);
      }
      player?.apply(sampleTime());
    },
    { stage: playbackStage }
  );
  onDestroy(() => {
    player?.restore();
    scheduler.removeStage(restoreStage.key);
  });
</script>

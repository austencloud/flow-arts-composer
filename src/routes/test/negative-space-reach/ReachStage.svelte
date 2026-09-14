<script lang="ts">
  import { T } from "@threlte/core";
  import {
    STAGE,
    userProportionsState,
    setViewerVisibilityContext,
  } from "@austencloud/scene-3d";
  import type { CharacterId } from "$lib/shared/3d/domain/character-model";
  import LiveSequencePerformer3D from "../../../lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { ISOLATION_STAFF_LENGTH_CM } from "./isolation-loop";

  interface Props {
    id: string;
    phase: number;
    active: boolean;
    torsoYaw: number;
    sequence: SequenceData;
    characterId: CharacterId;
    onReady?: () => void;
  }
  let { id, phase, active, torsoYaw, sequence, characterId, onReady }: Props =
    $props();
  setViewerVisibilityContext({
    showProps: true,
    showGrid: true,
    showAvatar: true,
    showEffects: false,
    blueMotion: false,
    redMotion: true,
  });
</script>

<T.AmbientLight intensity={1.15} />
<T.DirectionalLight position={[2.4, 4.5, 3.8]} intensity={1.7} castShadow />
<T.DirectionalLight position={[-3, 2.2, 1]} intensity={0.65} color="#99c7ff" />
<T.Mesh position={[0, -userProportionsState.groundY, STAGE.AVATAR_GRID_OFFSET]}
  ><T.SphereGeometry args={[0.025, 12, 8]} /><T.MeshBasicMaterial
    color="#aeb8c9"
  /></T.Mesh
>
<LiveSequencePerformer3D
  {onReady}
  {id}
  position={{ x: 0, y: 0, z: 0 }}
  facingAngle={0}
  {characterId}
  propType={PropType.FIRE_DOUBLE_STAFF}
  propLengthCm={ISOLATION_STAFF_LENGTH_CM}
  {sequence}
  effectId="led"
  phaseOffsetSteps={phase}
  playbackSpeed={0.32}
  {active}
  weldGrip={false}
  showEffects={false}
  enableLocomotion={true}
  enableFootPlanting={false}
  authoredUpperBodyStance={{ yawRad: torsoYaw }}
/>

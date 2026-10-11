<script lang="ts">
  /**
   * Scene contents for the elemental-motif harness. Six stations in a line,
   * each running its room's VTG modality with the avatar and (optionally) the
   * props hidden, so the only thing in the air is the effect trace.
   *
   * Mounts the museum's own station adapter rather than a bespoke rig — what
   * reads well here is what will read in the room.
   */
  import { T } from "@threlte/core";
  import MotifStation from "./MotifStation.svelte";
  import { ELEMENT_MOTIFS, motifPosition } from "./element-motifs";
  import SceneEffectsCoordinator3D from "#lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte";
  import { SceneEffectsManager3D } from "#lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.js";
  import { setSceneEffectsContext } from "#lib/shared/3d/effects/scene-effects/scene-effects-context.js";

  interface Props {
    /** Per-room effect override, keyed by roomId. */
    effects: Record<string, string>;
    showProps: boolean;
    playing: boolean;
    /** Draw the accent ring under each station. */
    showRings: boolean;
    /**
     * Solo mode: render only this room, alone at the origin. One effect framed
     * by itself reads far better than six competing in a line — and a single
     * oversized emitter can't occlude its neighbours while you judge it.
     */
    soloRoomId?: string | null;
  }
  const props: Props = $props();
  const sceneEffectsManager = setSceneEffectsContext(new SceneEffectsManager3D());

  const shown = $derived(
    props.soloRoomId
      ? ELEMENT_MOTIFS.filter((m) => m.roomId === props.soloRoomId)
      : ELEMENT_MOTIFS,
  );
  const count = $derived(shown.length);
</script>

<SceneEffectsCoordinator3D manager={sceneEffectsManager} />

<!-- Dim key so the effects carry the frame rather than competing with lighting. -->
<T.AmbientLight intensity={0.18} color="#0e1420" />
<T.DirectionalLight position={[6, 12, 8]} intensity={0.35} color="#c8d4ff" />

{#each shown as motif, i (motif.roomId)}
  {@const pos = motifPosition(i, count)}

  {#if props.showRings}
    <T.Mesh position.x={pos.x} position.y={0.01} position.z={pos.z} rotation.x={-Math.PI / 2}>
      <T.RingGeometry args={[2.4, 2.6, 64]} />
      <T.MeshBasicMaterial color={motif.color} transparent opacity={0.35} />
    </T.Mesh>
  {/if}

  <MotifStation
    stationId={`motif-${motif.roomId}`}
    worldX={pos.x}
    worldZ={pos.z}
    sequenceId={motif.sequenceId}
    effectId={props.effects[motif.roomId] ?? motif.defaultEffect}
    showProps={props.showProps}
    playing={props.playing}
  />
{/each}

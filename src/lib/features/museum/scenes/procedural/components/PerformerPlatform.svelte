<script lang="ts">

// propInterpolator and sequenceConverter are now module-level functions
  /**
   * PerformerPlatform - Museum exhibit slot with animated performer.
   *
   * Uses PerformerRig for unified avatar + prop + grid hierarchy.
   * Platform disc is a sibling outside the rig (independent of groundOffset).
   */
  import { T } from "@threlte/core";
  import { Color } from "three";
  import type { ExhibitSlot } from "../domain/museum-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { PerformerRig } from "@austencloud/scene-3d";
  import { Plane } from "@austencloud/scene-3d";
  import { PlaneMode } from "@austencloud/scene-3d";
  import { createCharacterInstanceState, makeStandaloneDeps } from "$lib/shared/3d/state/character-instance-state.svelte";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { museumPropPair } from "$lib/features/museum/services/museum-prop-pair";
  interface Props {
    slot: ExhibitSlot;
    isPopulated: boolean;
    playerPosition: { x: number; y: number; z: number };
    sequence?: SequenceData | null;
  }

  let { slot, isPopulated, playerPosition, sequence = null }: Props = $props();

  const propPair = $derived(museumPropPair(sequence, settingsService.settings));

  const ACTIVATION_DISTANCE = 15; // meters
  const PLATFORM_HEIGHT = 0.3;    // matches cylinder geometry
  const platformColor = new Color(0x6b5b4f);

  // Avatar3D positions feet at groundY (below rig origin). Offset by -groundY
  // to bring feet to floor level, then add platform height to stand on top.
  const groundOffset = $derived(-userProportionsState.groundY + PLATFORM_HEIGHT + slot.position.y);

  const isActive = $derived.by(() => {
    const dx = playerPosition.x - slot.position.x;
    const dz = playerPosition.z - slot.position.z;
    return Math.sqrt(dx * dx + dz * dz) < ACTIVATION_DISTANCE;
  });

  // Create performer animation state (slot identity is stable per instance)
  const performerState = $derived.by(() =>
    createCharacterInstanceState(
      {
        id: `museum-performer-${slot.id}`,
        positionX: slot.position.x,
        positionZ: slot.position.z,
      },
      makeStandaloneDeps()
    )
  );

  // Load sequence when it becomes available
  $effect(() => {
    if (sequence) {
      performerState.loadSequence(sequence);
      performerState.loop = true;
      performerState.play();
    }
  });

  // Cleanup on destroy
  $effect(() => {
    return () => performerState.destroy();
  });
</script>

{#if slot.type === "performer"}
  <!-- Station group - positioned at world coords -->
  <T.Group position.x={slot.position.x} position.z={slot.position.z}>
    <!-- Circular platform at floor level (outside rig - independent of groundOffset) -->
    <T.Mesh
      position.y={slot.position.y + 0.15}
      receiveShadow
    >
      <T.CylinderGeometry args={[1.0, 1.1, 0.3, 32]} />
      <T.MeshStandardMaterial color={platformColor} roughness={0.85} />
    </T.Mesh>

    <!-- Animated performer on platform -->
    {#if isPopulated && isActive && sequence}
      <PerformerRig
        position={{ x: 0, z: 0 }}
        facingAngle={slot.rotationY}
        planeMode={PlaneMode.WALL}
        avatarState={performerState}
        showGrid={false}
        visiblePlanes={new Set([Plane.WALL])}
        leftPropType={toScenePropType(propPair.leftPropType)}
        rightPropType={toScenePropType(propPair.rightPropType)}
        {groundOffset}
      />
    {:else if isPopulated && isActive}
      <!-- Capsule placeholder when sequence data not yet loaded -->
      <T.Mesh position.y={slot.position.y + 1.2}>
        <T.CapsuleGeometry args={[0.25, 0.9, 8, 16]} />
        <T.MeshStandardMaterial color={0xa78bfa} opacity={0.6} transparent />
      </T.Mesh>
    {/if}
  </T.Group>
{/if}

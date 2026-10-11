<script lang="ts">
  /**
   * Review-only overlay for the approved Keeper's Hollow fire-court revision.
   *
   * Geometry comes from scripts/winter-fire-court-graybox-r1.json through the
   * isolated Blender source. The production Winter environment remains the
   * terrain and scenery owner until this spatial gate is approved.
   */
  import { T } from "@threlte/core";
  import { useGltf } from "@threlte/extras";
  import { onDestroy } from "svelte";
  import { userProportionsState } from "@austencloud/scene-3d";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { Object3D } from "three";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    GGGG_CW,
    GHGH,
    HHHH_CCW,
  } from "#lib/shared/combination/domain/demo-fixtures.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import WinterFireCourtAudience, {
    type FireCourtFriendPlacement,
  } from "./WinterFireCourtAudience.svelte";
  import WinterFireCourtPerformer from "./WinterFireCourtPerformer.svelte";

  const graybox = useGltf(
    "/models/winter/review/winter-fire-court-graybox-r1.glb"
  );
  const groundY = $derived(userProportionsState.groundY);
  const courtSurfaceElevation = 0.12;

  interface SpinnerProfile {
    id: string;
    characterId: CharacterId;
    propType: PropType;
    sequence: SequenceData;
  }

  const spinnerProfiles: SpinnerProfile[] = [
    {
      id: "spinner-1",
      characterId: "ch12",
      propType: PropType.POI,
      sequence: GHGH,
    },
    {
      id: "spinner-2",
      characterId: "ch21",
      propType: PropType.STAFF,
      sequence: GGGG_CW,
    },
    {
      id: "spinner-3",
      characterId: "ch34",
      propType: PropType.FAN,
      sequence: HHHH_CCW,
    },
  ];
  const friendIds = [
    ...spinnerProfiles.map(({ id }) => id),
    "observer-1",
    "observer-2",
    "observer-3",
    "observer-4",
    "standing-1",
    "standing-2",
    "standing-3",
  ];
  let readyFriendIds = $state<string[]>([]);

  const friendPlacements = $derived.by((): FireCourtFriendPlacement[] => {
    const root = $graybox?.scene;
    if (!root) return [];
    const placements: FireCourtFriendPlacement[] = [];
    root.traverse((child: Object3D) => {
      const id = child.userData.tka_friend_id as string | undefined;
      const role = child.userData.tka_friend_role as string | undefined;
      if (!id || !role) return;
      placements.push({
        id,
        role: role as FireCourtFriendPlacement["role"],
        x: child.position.x,
        z: child.position.z,
        facingAngle:
          ((child.userData.tka_facing_degrees as number) * Math.PI) / 180,
        surfaceElevation:
          (child.userData.tka_surface_elevation as number | undefined) ??
          courtSurfaceElevation,
      });
    });
    return placements.sort((left, right) => left.id.localeCompare(right.id));
  });
  const spinnerPlacements = $derived(
    friendPlacements.filter(({ role }) => role === "spinner")
  );
  const audiencePlacements = $derived(
    friendPlacements.filter(({ role }) => role !== "spinner")
  );

  function markFriendReady(id: string): void {
    if (readyFriendIds.includes(id)) return;
    readyFriendIds = [...readyFriendIds, id];
  }

  $effect(() => {
    const root = $graybox?.scene;
    if (!root) return;
    const ready = readyFriendIds;
    root.traverse((child: Object3D) => {
      const friendId = friendIds.find((id) => child.name.includes(id));
      if (friendId) child.visible = !ready.includes(friendId);
    });
  });

  onDestroy(() => {
    const root = $graybox?.scene;
    root?.traverse((child: Object3D) => {
      if (friendIds.some((id) => child.name.includes(id))) child.visible = true;
    });
  });
</script>

{#if $graybox}
  <T is={$graybox.scene} position.y={groundY} />
{/if}

{#each spinnerPlacements as spinner (spinner.id)}
  {@const profile = spinnerProfiles.find(({ id }) => id === spinner.id)}
  {#if profile}
    <WinterFireCourtPerformer
      stationId={spinner.id}
      worldX={spinner.x}
      worldZ={spinner.z}
      facingAngle={spinner.facingAngle}
      surfaceElevation={courtSurfaceElevation}
      characterId={profile.characterId}
      propType={profile.propType}
      sequence={profile.sequence}
      onReady={() => markFriendReady(spinner.id)}
    />
  {/if}
{/each}

<WinterFireCourtAudience
  placements={audiencePlacements}
  onReady={markFriendReady}
/>

<T.PointLight
  position={[-13, groundY + 2.1, -7]}
  color="#ff4b16"
  intensity={28}
  distance={17}
  decay={2}
/>

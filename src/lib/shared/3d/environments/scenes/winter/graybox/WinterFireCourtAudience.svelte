<script lang="ts">
  /**
   * The seven non-performing friends around Keeper's fire court.
   *
   * Every friend uses the same deployed character renderer as the main performer
   * and watches the active court. There is no audience furniture or
   * prop-storage station competing with the performance.
   */
  import { userProportionsState } from "@austencloud/scene-3d";
  import {
    Character3D,
    type CharacterId,
  } from "#lib/shared/3d/domain/character-model.js";

  export interface FireCourtFriendPlacement {
    id: string;
    role: "spinner" | "standing";
    x: number;
    z: number;
    facingAngle: number;
    surfaceElevation: number;
  }

  interface Props {
    placements: FireCourtFriendPlacement[];
    onReady?: (id: string) => void;
  }

  interface AudienceProfile {
    id: string;
    characterId: CharacterId;
  }

  const props: Props = $props();
  const groundY = $derived(userProportionsState.groundY);
  const audienceProfiles = new Map<string, AudienceProfile>([
    ["observer-1", { id: "observer-1", characterId: "ch18" }],
    ["observer-2", { id: "observer-2", characterId: "ch24" }],
    ["observer-3", { id: "observer-3", characterId: "ch10" }],
    ["observer-4", { id: "observer-4", characterId: "ch44" }],
    ["standing-1", { id: "standing-1", characterId: "ch07" }],
    ["standing-2", { id: "standing-2", characterId: "ch22" }],
    ["standing-3", { id: "standing-3", characterId: "ch41" }],
  ]);
</script>

{#each props.placements as friend (friend.id)}
  {@const profile = audienceProfiles.get(friend.id)}
  {#if profile}
    <Character3D
      id={`winter-fire-court-${friend.id}`}
      avatarId={profile.characterId}
      leftPropState={null}
      rightPropState={null}
      position={{
        x: friend.x,
        y: groundY + friend.surfaceElevation,
        z: friend.z,
      }}
      facingAngle={friend.facingAngle}
      isActive={false}
      isMoving={false}
      enableLocomotion={true}
      enableFootPlanting={true}
      onModelSwapped={() => props.onReady?.(friend.id)}
    />
  {/if}
{/each}

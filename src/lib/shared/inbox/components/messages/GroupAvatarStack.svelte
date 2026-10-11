<!--
  GroupAvatarStack.svelte

  Stacked avatar display for group conversations.
  Shows overlapping avatars with a "+N" indicator for overflow.
  Can display a custom group avatar instead.
  Uses RobustAvatar for reliable image loading with fallbacks.
-->
<script lang="ts">
  import type { ParticipantInfo } from "#lib/shared/messaging/domain/models/conversation-models.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";

  interface Props {
    participants: ParticipantInfo[];
    customAvatar?: string;
    maxVisible?: number;
    size?: number;
  }

  let {
    participants,
    customAvatar,
    maxVisible = 3,
    size = 44,
  }: Props = $props();

  const visibleParticipants = $derived(participants.slice(0, maxVisible));
  const overflowCount = $derived(
    Math.max(0, participants.length - maxVisible)
  );
  const hasOverflow = $derived(overflowCount > 0);

  // Calculate individual avatar size based on container size
  const avatarSize = $derived(Math.round(size * 0.65));
  const overlap = $derived(Math.round(avatarSize * 0.3));
</script>

{#if customAvatar}
  <!-- Custom group avatar -->
  <div class="custom-avatar" style="width: {size}px; height: {size}px;">
    <RobustAvatar
      src={customAvatar}
      alt="Group avatar"
      customSize={size}
    />
    <span class="group-indicator">
      <i class="fas fa-users" aria-hidden="true"></i>
    </span>
  </div>
{:else}
  <!-- Stacked participant avatars -->
  <div
    class="avatar-stack"
    style="height: {size}px; min-width: {avatarSize + (visibleParticipants.length - 1 + (hasOverflow ? 1 : 0)) * (avatarSize - overlap)}px;"
  >
    {#each visibleParticipants as participant, i}
      <div
        class="avatar-wrapper"
        style="
          width: {avatarSize}px;
          height: {avatarSize}px;
          z-index: {maxVisible - i};
          right: {i * (avatarSize - overlap)}px;
        "
        title={participant.displayName}
      >
        <RobustAvatar
          src={participant.avatar}
          name={participant.displayName}
          alt=""
          customSize={avatarSize}
        />
      </div>
    {/each}

    {#if hasOverflow}
      <div
        class="avatar-wrapper overflow"
        style="
          width: {avatarSize}px;
          height: {avatarSize}px;
          z-index: 0;
          right: {visibleParticipants.length * (avatarSize - overlap)}px;
        "
      >
        <span class="overflow-count">+{overflowCount}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .custom-avatar {
    position: relative;
    border-radius: 50%;
    overflow: visible;
    flex-shrink: 0;
  }

  .group-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--theme-accent, var(--semantic-info));
    border: 2px solid var(--theme-panel-bg);
    border-radius: 50%;
    color: white;
    font-size: 8px;
    z-index: 1;
  }

  .avatar-stack {
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .avatar-wrapper {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid var(--theme-panel-bg);
    overflow: hidden;
  }

  /* RobustAvatar inside wrapper needs to fill the space */
  .avatar-wrapper :global(.robust-avatar) {
    width: 100% !important;
    height: 100% !important;
  }

  .avatar-wrapper.overflow {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(4px);
  }

  .overflow-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text);
  }
</style>

<!--
  CollaboratorAvatars.svelte

  Stacked avatar display for video collaborators (Instagram-style).
  Shows overlapping avatars with a "+N" indicator for overflow.
-->
<script lang="ts">
  import type { VideoCollaborator } from "../domain/collaborative-video";

  const {
    collaborators,
    maxVisible = 3,
    size = "md",
    onclick,
  }: {
    collaborators: readonly VideoCollaborator[];
    maxVisible?: number;
    size?: "sm" | "md" | "lg";
    onclick?: () => void;
  } = $props();

  const visibleCollaborators = $derived(collaborators.slice(0, maxVisible));
  const overflowCount = $derived(
    Math.max(0, collaborators.length - maxVisible)
  );
  const hasOverflow = $derived(overflowCount > 0);

  const sizeClasses = {
    sm: "size-sm",
    md: "size-md",
    lg: "size-lg",
  };
</script>

<button
  class="collaborator-avatars {sizeClasses[size]}"
  class:clickable={!!onclick}
  {onclick}
  type="button"
  aria-label="{collaborators.length} collaborator{collaborators.length !== 1
    ? 's'
    : ''}"
>
  <div class="avatar-stack">
    {#each visibleCollaborators as collaborator, i}
      <div
        class="avatar"
        class:creator={collaborator.role === "creator"}
        style="z-index: {maxVisible - i}"
        title={collaborator.displayName || "Collaborator"}
      >
        {#if collaborator.avatarUrl}
          <img src={collaborator.avatarUrl} alt="" />
        {:else}
          <span class="initials">
            {(collaborator.displayName || "?").charAt(0).toUpperCase()}
          </span>
        {/if}
        {#if collaborator.role === "creator"}
          <span class="creator-indicator">
            <i class="fas fa-crown" aria-hidden="true"></i>
          </span>
        {/if}
      </div>
    {/each}

    {#if hasOverflow}
      <div class="avatar overflow" style="z-index: 0">
        <span class="overflow-count">+{overflowCount}</span>
      </div>
    {/if}
  </div>
</button>

<style>
  .collaborator-avatars {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    cursor: default;
  }

  .collaborator-avatars.clickable {
    cursor: pointer;
  }

  .collaborator-avatars.clickable:hover .avatar {
    transform: translateY(-2px);
  }

  .avatar-stack {
    display: flex;
    flex-direction: row-reverse;
  }

  .avatar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      var(--semantic-info) 0%,
      var(--theme-accent-strong) 100%
    );
    border: 2px solid rgba(20, 20, 30, 1);
    overflow: hidden;
    transition: transform var(--duration-normal) var(--ease-standard);
  }

  .avatar:not(:last-child) {
    margin-left: -8px;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .initials {
    font-weight: 600;
    color: white;
    text-transform: uppercase;
  }

  .avatar.creator {
    border-color: var(--semantic-warning);
  }

  .creator-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--semantic-warning);
    border-radius: 50%;
    color: #1f2937;
  }

  .avatar.overflow {
    background: rgba(255, 255, 255, 0.1);
  }

  .overflow-count {
    font-weight: 600;
    color: var(--text-primary);
  }

  /* Size variants */
  .size-sm .avatar {
    width: 24px;
    height: 24px;
  }

  .size-sm .avatar:not(:last-child) {
    margin-left: -6px;
  }

  .size-sm .initials {
    font-size: 0.65rem;
  }

  .size-sm .overflow-count {
    font-size: 0.6rem;
  }

  .size-sm .creator-indicator {
    width: 10px;
    height: 10px;
    font-size: 0.4rem;
  }

  .size-md .avatar {
    width: 32px;
    height: 32px;
  }

  .size-md .initials {
    font-size: 0.75rem;
  }

  .size-md .overflow-count {
    font-size: 0.7rem;
  }

  .size-md .creator-indicator {
    width: 12px;
    height: 12px;
    font-size: 0.45rem;
  }

  .size-lg .avatar {
    width: 44px;
    height: 44px;
  }

  .size-lg .avatar:not(:last-child) {
    margin-left: -12px;
  }

  .size-lg .initials {
    font-size: 1rem;
  }

  .size-lg .overflow-count {
    font-size: 0.85rem;
  }

  .size-lg .creator-indicator {
    width: 16px;
    height: 16px;
    font-size: 0.55rem;
  }
</style>

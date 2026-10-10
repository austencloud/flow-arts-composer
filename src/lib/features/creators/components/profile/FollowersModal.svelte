<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import AvatarImage from "#lib/shared/browse/components/AvatarImage.svelte";
  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

  type ListType = "followers" | "following";

  let {
    open = $bindable(false),
    listType,
    users,
    isLoading,
    onUserClick,
  }: {
    open: boolean;
    listType: ListType;
    users: readonly UserProfile[];
    isLoading: boolean;
    onUserClick: (user: UserProfile) => void;
  } = $props();

  const title = $derived(listType === "followers" ? "Followers" : "Following");
  const icon = $derived(listType === "followers" ? "fa-users" : "fa-user-plus");
  const emptyTitle = $derived(listType === "followers" ? "No Followers Yet" : "Not Following Anyone");
  const emptyMessage = $derived(
    listType === "followers"
      ? "This user doesn't have any followers yet"
      : "This user isn't following anyone yet"
  );

  function handleUserClick(user: UserProfile) {
    open = false;
    onUserClick(user);
  }
</script>

<BaseModal bind:open size="md" animation="pop">
  {#snippet header()}
    <ModalHeader
      {title}
      icon={icon}
      showClose
      onClose={() => (open = false)}
    />
  {/snippet}

  <div class="followers-list">
    {#if isLoading}
      <PanelState type="loading" message="Loading {listType}..." />
    {:else if users.length === 0}
      <PanelState
        type="empty"
        icon={icon}
        title={emptyTitle}
        message={emptyMessage}
      />
    {:else}
      <div class="user-list">
        {#each users as user (user.id)}
          <button
            class="user-card"
            onclick={() => handleUserClick(user)}
            aria-label="View profile of {user.displayName}"
          >
            <div class="user-avatar">
              <AvatarImage src={user.avatar} alt={user.displayName} name={user.displayName} size={48} />
            </div>
            <div class="user-info">
              <h4 class="user-name">{user.displayName}</h4>
              <p class="user-username">@{user.username}</p>
            </div>
            <div class="user-stats">
              <span class="user-stat">
                <i class="fas fa-list" aria-hidden="true"></i>
                {user.sequenceCount}
              </span>
              <span class="user-stat">
                <i class="fas fa-users" aria-hidden="true"></i>
                {user.followerCount}
              </span>
            </div>
            <i class="fas fa-chevron-right user-arrow" aria-hidden="true"></i>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</BaseModal>

<style>
  .followers-list {
    padding: 16px;
  }

  .user-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .user-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
    width: 100%;
  }

  .user-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
    transform: translateX(4px);
  }

  .user-avatar {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
  }

  .user-info {
    flex: 1;
    min-width: 0;
  }

  .user-name {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-username {
    margin: 2px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-stats {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
  }

  .user-stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .user-stat i {
    font-size: var(--font-size-compact);
  }

  .user-arrow {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    flex-shrink: 0;
    transition: transform var(--duration-normal) ease;
  }

  .user-card:hover .user-arrow {
    transform: translateX(4px);
  }

  @media (prefers-reduced-motion: reduce) {
    .user-card {
      transition: none;
    }

    .user-card:hover {
      transform: none;
    }

    .user-arrow,
    .user-card:hover .user-arrow {
      transition: none;
      transform: none;
    }
  }
</style>

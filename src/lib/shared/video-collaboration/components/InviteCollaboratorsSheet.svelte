<!--
  InviteCollaboratorsSheet.svelte

  Bottom sheet for inviting collaborators to a video (Instagram-style).
  Allows searching users and sending collaboration invites.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { inviteCollaborator } from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { CollaborativeVideo } from "../domain/collaborative-video";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import AvatarImage from "#lib/shared/browse/components/AvatarImage.svelte";

  const {
    show = false,
    video,
    onClose,
    onInviteSent,
  }: {
    show?: boolean;
    video: CollaborativeVideo;
    onClose?: () => void;
    onInviteSent?: () => void;
  } = $props();

  // Services
  const hapticService = getHapticFeedback();

  // Search state
  let searchQuery = $state("");
  let searchResults = $state<EnhancedUserProfile[]>([]);
  let isSearching = $state(false);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Invite state
  let sendingInviteTo = $state<string | null>(null);
  let inviteError = $state<string | null>(null);

  // Derived: users already collaborating or invited
  const existingUserIds = $derived(
    new Set([
      ...video.collaborators.map((c) => c.userId),
      ...video.pendingInvites
        .filter((i) => i.status === "pending")
        .map((i) => i.userId),
    ])
  );

  // Search effect with debounce
  $effect(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    if (!searchQuery.trim()) {
      searchResults = [];
      isSearching = false;
      return;
    }

    isSearching = true;
    searchDebounceTimer = setTimeout(async () => {
      try {
        // TODO: implement searchUsers in user-repository module
        searchResults = [];
      } catch (e) {
        console.error("Search failed:", e);
        searchResults = [];
      } finally {
        isSearching = false;
      }
    }, 300);
  });

  async function handleInvite(user: EnhancedUserProfile) {
    if (sendingInviteTo) return;

    sendingInviteTo = user.id;
    inviteError = null;
    hapticService?.trigger("selection");

    try {
      await inviteCollaborator(
        video.id,
        user.id,
        user.displayName
      );
      hapticService?.trigger("success");

      searchResults = searchResults.filter((u: EnhancedUserProfile) => u.id !== user.id);

      onInviteSent?.();
    } catch (e) {
      console.error("Failed to send invite:", e);
      inviteError = e instanceof Error ? e.message : "Failed to send invite";
      hapticService?.trigger("error");
    } finally {
      sendingInviteTo = null;
    }
  }

  function handleClose() {
    hapticService?.trigger("selection");
    searchQuery = "";
    searchResults = [];
    inviteError = null;
    onClose?.();
  }
</script>

<Drawer
  isOpen={show}
  labelledBy="invite-collaborators-title"
  onclose={handleClose}
  closeOnBackdrop={true}
  showHandle={true}
  placement="bottom"
  class="invite-sheet"
>
  <div class="invite-sheet__container">
    <!-- Header -->
    <header class="invite-sheet__header">
      <div class="header-content">
        <i class="fas fa-user-plus header-icon" aria-hidden="true"></i>
        <h2 id="invite-collaborators-title">Invite Collaborators</h2>
      </div>
      <button class="close-button" onclick={handleClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Content -->
    <div class="invite-sheet__content">
      <!-- Search Input -->
      <div class="search-group">
        <div class="search-input-wrapper">
          <i class="fas fa-search search-icon" aria-hidden="true"></i>
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search users by name..."
            autocomplete="off"
            autocapitalize="off"
          />
          {#if isSearching}
            <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"
            ></i>
          {/if}
        </div>
      </div>

      <!-- Error Message -->
      {#if inviteError}
        <div class="error-banner" role="alert">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{inviteError}</span>
        </div>
      {/if}

      <!-- Current Collaborators -->
      <div class="section">
        <h3 class="section-title">
          <i class="fas fa-users" aria-hidden="true"></i>
          Current Collaborators ({video.collaborators.length})
        </h3>
        <div class="collaborators-list">
          {#each video.collaborators as collaborator}
            <div class="collaborator-item">
              <div class="user-avatar">
                <AvatarImage
                  src={collaborator.avatarUrl}
                  name={collaborator.displayName || "User"}
                  alt=""
                  size={40}
                />
              </div>
              <div class="user-info">
                <span class="user-name"
                  >{collaborator.displayName || "Unknown"}</span
                >
                <span class="user-role"
                  >{collaborator.role === "creator"
                    ? "Creator"
                    : "Collaborator"}</span
                >
              </div>
              {#if collaborator.role === "creator"}
                <span class="creator-badge">
                  <i class="fas fa-crown" aria-hidden="true"></i>
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Pending Invites -->
      {#if video.pendingInvites.filter((i) => i.status === "pending").length > 0}
        <div class="section">
          <h3 class="section-title">
            <i class="fas fa-clock" aria-hidden="true"></i>
            Pending Invites
          </h3>
          <div class="collaborators-list">
            {#each video.pendingInvites.filter((i) => i.status === "pending") as invite}
              <div class="collaborator-item pending">
                <div class="user-avatar">
                  <i class="fas fa-user" aria-hidden="true"></i>
                </div>
                <div class="user-info">
                  <span class="user-name">{invite.displayName || "User"}</span>
                  <span class="user-role">Invite pending</span>
                </div>
                <span class="pending-badge">
                  <i class="fas fa-hourglass-half" aria-hidden="true"></i>
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Search Results -->
      {#if searchQuery.trim()}
        <div class="section">
          <h3 class="section-title">
            <i class="fas fa-search" aria-hidden="true"></i>
            Search Results
          </h3>
          {#if searchResults.length > 0}
            <div class="search-results">
              {#each searchResults as user}
                <div class="search-result-item">
                  <div class="user-avatar">
                    {#if user.avatar}
                      <img src={user.avatar} alt="" />
                    {:else}
                      <i class="fas fa-user" aria-hidden="true"></i>
                    {/if}
                  </div>
                  <div class="user-info">
                    <span class="user-name">{user.displayName}</span>
                    {#if user.username}
                      <span class="user-username">@{user.username}</span>
                    {/if}
                  </div>
                  <button
                    class="invite-button"
                    onclick={() => handleInvite(user)}
                    disabled={sendingInviteTo === user.id}
                  >
                    {#if sendingInviteTo === user.id}
                      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                    {:else}
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      Invite
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          {:else if !isSearching}
            <p class="no-results">No users found matching "{searchQuery}"</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</Drawer>

<style>
  :global(.invite-sheet) {
    --sheet-z-index: var(--z-modal);
  }

  .invite-sheet__container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: 85vh;
    background: linear-gradient(
      135deg,
      rgba(20, 20, 30, 0.98) 0%,
      rgba(30, 30, 45, 0.98) 100%
    );
    border-radius: 24px 24px 0 0;
    overflow: hidden;
  }

  .invite-sheet__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: rgba(255, 255, 255, 0.03);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.25rem;
    color: var(--semantic-info);
  }

  .invite-sheet__header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border: none;
    background: var(--theme-card-bg);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
  }

  .invite-sheet__content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Search */
  .search-group {
    position: relative;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 1rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .loading-icon {
    position: absolute;
    right: 1rem;
    color: var(--text-secondary);
  }

  .search-input-wrapper input {
    width: 100%;
    padding: 0.875rem 1rem 0.875rem 2.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--text-primary);
    font-size: 1rem;
    transition: all var(--duration-normal) ease;
  }

  .search-input-wrapper input:focus {
    outline: none;
    border-color: rgba(59, 130, 246, 0.5);
    background: var(--theme-card-bg);
  }

  .search-input-wrapper input::placeholder {
    color: var(--text-secondary);
  }

  /* Error */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: var(--semantic-error);
    font-size: 0.9rem;
  }

  /* Sections */
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-title i {
    font-size: 0.8rem;
  }

  /* Collaborators List */
  .collaborators-list,
  .search-results {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .collaborator-item,
  .search-result-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    transition: all var(--duration-normal) ease;
  }

  .collaborator-item:hover,
  .search-result-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .collaborator-item.pending {
    opacity: 0.7;
  }

  .user-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-avatar i {
    font-size: 1rem;
    color: var(--text-secondary);
  }

  .user-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .user-name {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-role,
  .user-username {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .creator-badge {
    color: var(--semantic-warning);
    font-size: 0.9rem;
  }

  .pending-badge {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  /* Invite Button */
  .invite-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .invite-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .invite-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .no-results {
    text-align: center;
    color: var(--text-secondary);
    font-size: 0.9rem;
    padding: 1rem;
    margin: 0;
  }

  @media (max-width: 640px) {
    .invite-sheet__header {
      padding: 0.75rem 1rem;
    }

    .invite-sheet__content {
      padding: 1rem;
    }
  }
</style>

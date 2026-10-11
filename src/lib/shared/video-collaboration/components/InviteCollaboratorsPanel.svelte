<!--
  InviteCollaboratorsPanel.svelte

  Side panel for inviting collaborators to a video, with inline playback
  and a selectable invite message.
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
    placement = "right",
    video,
    onClose,
    onInviteSent,
  }: {
    show?: boolean;
    placement?: "right" | "bottom";
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

  // Message state
  const messageOptions = [
    "Want to collaborate on this performance?",
    "Loved this take - join me on the collab.",
    "I added you to this video. Want to jump in?",
  ];
  let selectedMessage = $state(messageOptions[0]);
  let useCustomMessage = $state(false);
  let customMessage = $state("");

  function handleMessageSelect(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    if (value === "__custom__") {
      useCustomMessage = true;
      return;
    }
    useCustomMessage = false;
    selectedMessage = value;
  }

  function currentMessage(): string | undefined {
    const message = useCustomMessage
      ? customMessage.trim()
      : (selectedMessage ?? "").trim();
    return message.length > 0 ? message : undefined;
  }

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
        user.displayName,
        currentMessage()
      );
      hapticService?.trigger("success");

      searchResults = searchResults.filter((u) => u.id !== user.id);

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
  {placement}
  class="invite-collaborators-panel"
>
  <div class="invite-panel">
    <!-- Header -->
    <header class="invite-panel__header">
      <div class="header-content">
        <i class="fas fa-user-plus header-icon" aria-hidden="true"></i>
        <h2 id="invite-collaborators-title">Invite Collaborators</h2>
      </div>
      <button class="close-button" onclick={handleClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Video Preview -->
    <section class="video-preview">
      <video src={video.videoUrl} controls playsinline>
        <track kind="captions" />
      </video>
      <div class="video-meta">
        <span class="video-title"
          >{video.sequenceName || "Performance video"}</span
        >
        <span class="video-subtitle">Invite collaborators to this take.</span>
      </div>
    </section>

    <!-- Message Selection -->
    <section class="message-section">
      <h3 class="section-title">
        <i class="fas fa-comment-dots" aria-hidden="true"></i>
        Invite Message
      </h3>
      <div class="message-controls">
        <select
          class="message-select"
          value={useCustomMessage ? "__custom__" : selectedMessage}
          onchange={handleMessageSelect}
        >
          {#each messageOptions as option}
            <option value={option}>{option}</option>
          {/each}
          <option value="__custom__">Custom message...</option>
        </select>
        <label class="custom-toggle">
          <input type="checkbox" bind:checked={useCustomMessage} />
          Custom
        </label>
      </div>
      {#if useCustomMessage}
        <textarea
          class="message-textarea"
          bind:value={customMessage}
          rows="2"
          maxlength="200"
          placeholder="Write a short note..."
        ></textarea>
        <div class="char-count">{customMessage.length}/200</div>
      {/if}
    </section>

    <!-- Error Message -->
    {#if inviteError}
      <div class="error-banner" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{inviteError}</span>
      </div>
    {/if}

    <!-- Current Collaborators -->
    <section class="section">
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
    </section>

    <!-- Pending Invites -->
    {#if video.pendingInvites.filter((i) => i.status === "pending").length > 0}
      <section class="section">
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
      </section>
    {/if}

    <!-- Search Input -->
    <section class="section">
      <h3 class="section-title">
        <i class="fas fa-search" aria-hidden="true"></i>
        Find Collaborators
      </h3>
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
          <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"></i>
        {/if}
      </div>
      {#if searchQuery.trim()}
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
      {/if}
    </section>
  </div>
</Drawer>

<style>
  .invite-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--theme-panel-bg);
    overflow-y: auto;
  }

  .invite-panel__header {
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

  .invite-panel__header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
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

  .video-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .video-preview video {
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 12px;
  }

  .video-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .video-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .video-subtitle {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .message-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .message-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .message-select {
    flex: 1;
    min-width: 240px;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--theme-card-bg);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .custom-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .message-textarea {
    width: 100%;
    padding: 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--theme-card-bg);
    color: var(--text-primary);
    font-size: 0.85rem;
    font-family: inherit;
    resize: none;
  }

  .char-count {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-align: right;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
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

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem 1.5rem 0;
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: var(--semantic-error);
    font-size: 0.9rem;
  }

  @media (max-width: 640px) {
    .invite-panel__header {
      padding: 0.75rem 1rem;
    }

    .video-preview,
    .message-section,
    .section {
      padding: 0.75rem 1rem;
    }
  }
</style>

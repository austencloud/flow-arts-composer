<!--
  VideoCollaboratorsDetail.svelte

  Detailed list of collaborators for video detail views.
  Shows all collaborators with roles and join dates.
-->
<script lang="ts">
  import type {
    CollaborativeVideo,
    VideoCollaborator,
  } from "../domain/collaborative-video";
  import { getAuthSync } from "#lib/shared/auth/firebase.js";

  const {
    video,
    onRemoveCollaborator,
    onInviteClick,
  }: {
    video: CollaborativeVideo;
    onRemoveCollaborator?: (userId: string) => void;
    onInviteClick?: () => void;
  } = $props();

  const currentUserId = $derived(getAuthSync().currentUser?.uid);
  const isCreator = $derived(currentUserId === video.creatorId);

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function canRemove(collaborator: VideoCollaborator): boolean {
    if (collaborator.role === "creator") return false;
    // Creator can remove anyone, users can remove themselves
    return isCreator || collaborator.userId === currentUserId;
  }
</script>

<div class="collaborators-detail">
  <div class="header">
    <h3>
      <i class="fas fa-users" aria-hidden="true"></i>
      Contributors
      <span class="count">({video.collaborators.length})</span>
    </h3>
    {#if isCreator}
      <button class="invite-btn" onclick={onInviteClick}>
        <i class="fas fa-user-plus" aria-hidden="true"></i>
        Invite
      </button>
    {/if}
  </div>

  <div class="collaborators-list">
    {#each video.collaborators as collaborator}
      <div class="collaborator-row">
        <div class="avatar">
          {#if collaborator.avatarUrl}
            <img src={collaborator.avatarUrl} alt="" />
          {:else}
            <span class="initials">
              {(collaborator.displayName || "?").charAt(0).toUpperCase()}
            </span>
          {/if}
        </div>

        <div class="info">
          <div class="name-row">
            <span class="name">{collaborator.displayName || "Unknown"}</span>
            {#if collaborator.role === "creator"}
              <span class="role-badge creator">
                <i class="fas fa-crown" aria-hidden="true"></i>
                Creator
              </span>
            {:else}
              <span class="role-badge">Collaborator</span>
            {/if}
          </div>
          <span class="joined">Joined {formatDate(collaborator.joinedAt)}</span>
        </div>

        {#if canRemove(collaborator) && onRemoveCollaborator}
          <button
            class="remove-btn"
            onclick={() => onRemoveCollaborator?.(collaborator.userId)}
            aria-label={collaborator.userId === currentUserId
              ? "Leave collaboration"
              : "Remove collaborator"}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Pending Invites Section -->
  {#if video.pendingInvites.filter((i) => i.status === "pending").length > 0 && isCreator}
    <div class="pending-section">
      <h4>
        <i class="fas fa-clock" aria-hidden="true"></i>
        Pending Invites
      </h4>
      <div class="pending-list">
        {#each video.pendingInvites.filter((i) => i.status === "pending") as invite}
          <div class="pending-row">
            <div class="avatar pending">
              <i class="fas fa-user" aria-hidden="true"></i>
            </div>
            <div class="info">
              <span class="name">{invite.displayName || "User"}</span>
              <span class="joined">Invited {formatDate(invite.invitedAt)}</span>
            </div>
            <span class="pending-badge">
              <i class="fas fa-hourglass-half" aria-hidden="true"></i>
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .collaborators-detail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .header h3 i {
    color: var(--text-secondary);
  }

  .count {
    color: var(--text-secondary);
    font-weight: 400;
  }

  .invite-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    background: linear-gradient(135deg, var(--semantic-info) 0%, #2563eb 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .invite-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .collaborators-list,
  .pending-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .collaborator-row,
  .pending-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: linear-gradient(
      135deg,
      var(--semantic-info) 0%,
      var(--theme-accent-strong) 100%
    );
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
  }

  .avatar.pending {
    background: rgba(255, 255, 255, 0.1);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar .initials {
    font-size: 0.9rem;
    font-weight: 600;
    color: white;
  }

  .avatar i {
    color: var(--text-secondary);
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .name {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: var(--theme-card-bg);
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .role-badge.creator {
    background: rgba(251, 191, 36, 0.15);
    color: var(--semantic-warning);
  }

  .role-badge.creator i {
    font-size: 0.6rem;
  }

  .joined {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: none;
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .remove-btn:hover {
    background: rgba(239, 68, 68, 0.15);
    color: var(--semantic-error);
  }

  .pending-section {
    margin-top: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pending-section h4 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.75rem 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .pending-badge {
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
</style>

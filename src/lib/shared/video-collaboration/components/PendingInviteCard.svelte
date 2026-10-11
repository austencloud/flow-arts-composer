<!--
  PendingInviteCard.svelte

  Card displaying a pending collaboration invite with accept/decline actions.
  Used in notifications or a dedicated invites list.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { acceptInvite, declineInvite } from "#lib/shared/video-collaboration/services/collaborative-video-manager.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import {
    getCreatorDisplayName,
    type CollaborativeVideo,
  } from "../domain/collaborative-video";

  const {
    video,
    onAccepted,
    onDeclined,
  }: {
    video: CollaborativeVideo;
    onAccepted?: () => void;
    onDeclined?: () => void;
  } = $props();

  const hapticService = getHapticFeedback();

  let isProcessing = $state(false);
  let error = $state<string | null>(null);

  // Get the creator info
  const creator = $derived(
    video.collaborators.find((c) => c.role === "creator")
  );

  async function handleAccept() {
    if (isProcessing) return;

    isProcessing = true;
    error = null;
    hapticService?.trigger("selection");

    try {
      await acceptInvite(video.id);
      hapticService?.trigger("success");
      onAccepted?.();
    } catch (e) {
      console.error("Failed to accept invite:", e);
      error = e instanceof Error ? e.message : "Failed to accept";
      hapticService?.trigger("error");
    } finally {
      isProcessing = false;
    }
  }

  async function handleDecline() {
    if (isProcessing) return;

    isProcessing = true;
    error = null;
    hapticService?.trigger("selection");

    try {
      await declineInvite(video.id);
      hapticService?.trigger("warning");
      onDeclined?.();
    } catch (e) {
      console.error("Failed to decline invite:", e);
      error = e instanceof Error ? e.message : "Failed to decline";
      hapticService?.trigger("error");
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="invite-card">
  <!-- Video Thumbnail -->
  <div class="thumbnail">
    {#if video.thumbnailUrl}
      <img src={video.thumbnailUrl} alt="Video thumbnail" />
    {:else}
      <div class="thumbnail-placeholder">
        <i class="fas fa-video" aria-hidden="true"></i>
      </div>
    {/if}
  </div>

  <!-- Info -->
  <div class="info">
    <div class="invite-header">
      <i class="fas fa-user-plus invite-icon" aria-hidden="true"></i>
      <span class="invite-label">Collaboration Invite</span>
    </div>

    <p class="invite-message">
      <strong>{getCreatorDisplayName(video) ?? "Someone"}</strong> invited you to
      collaborate on a video
      {#if video.sequenceName}
        for <strong>"{video.sequenceName}"</strong>
      {/if}
    </p>

    {#if error}
      <p class="error-message">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        {error}
      </p>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <button
        class="btn btn-accept"
        onclick={handleAccept}
        disabled={isProcessing}
      >
        {#if isProcessing}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-check" aria-hidden="true"></i>
          Accept
        {/if}
      </button>
      <button
        class="btn btn-decline"
        onclick={handleDecline}
        disabled={isProcessing}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        Decline
      </button>
    </div>
  </div>
</div>

<style>
  .invite-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    transition: all var(--duration-normal) ease;
  }

  .invite-card:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .thumbnail {
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--theme-card-bg);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 1.5rem;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .invite-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .invite-icon {
    color: var(--semantic-info);
    font-size: 0.9rem;
  }

  .invite-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--semantic-info);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .invite-message {
    margin: 0;
    font-size: 0.9rem;
    color: var(--text-primary);
    line-height: 1.4;
  }

  .invite-message strong {
    color: var(--text-primary);
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0;
    font-size: 0.8rem;
    color: var(--semantic-error);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-accept {
    background: linear-gradient(
      135deg,
      var(--semantic-success) 0%,
      #059669 100%
    );
    color: white;
  }

  .btn-accept:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .btn-decline {
    background: var(--theme-card-bg);
    color: var(--text-secondary);
    border: 1px solid var(--theme-stroke);
  }

  .btn-decline:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.1);
    color: var(--semantic-error);
    border-color: rgba(239, 68, 68, 0.3);
  }

  @media (max-width: 480px) {
    .invite-card {
      flex-direction: column;
    }

    .thumbnail {
      width: 100%;
      height: 120px;
    }

    .actions {
      flex-direction: column;
    }

    .btn {
      justify-content: center;
    }
  }
</style>

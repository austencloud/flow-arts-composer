<!--
  ArtifactPublicationQueuePanel.svelte

  Admin view of everything currently public in Explore (Browse Phase 3,
  publish-first model). There is no approval gate — owners publish directly.
  This feed lists live artifacts newest-first so moderation can skim recent
  publications and take down anything that breaks the rules.
-->
<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { onMount } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import {
    PUBLIC_ARTIFACT_TYPES,
    publicationRequestId,
    type PublicArtifactEnvelope,
  } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import { removePublication } from "#lib/shared/artifact-revisions/services/artifact-publication-review.js";
  import { listPublicArtifacts } from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";

  let liveArtifacts = $state<PublicArtifactEnvelope[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  let processingId = $state<string | null>(null);
  let showRemoveModal = $state(false);
  let removingArtifact = $state<PublicArtifactEnvelope | null>(null);
  let removeReason = $state("");

  const currentUser = $derived(authState.user);

  onMount(() => {
    void loadFeed();
  });

  function publishedAtMillis(artifact: PublicArtifactEnvelope): number {
    const value = artifact.publishedAt as
      | { toMillis?: () => number }
      | Date
      | null
      | undefined;
    if (value instanceof Date) return value.getTime();
    return value?.toMillis?.() ?? 0;
  }

  async function loadFeed() {
    isLoading = true;
    error = null;
    try {
      const lists = await Promise.all(
        PUBLIC_ARTIFACT_TYPES.map((type) => listPublicArtifacts(type))
      );
      liveArtifacts = lists
        .flat()
        .sort((a, b) => publishedAtMillis(b) - publishedAtMillis(a));
    } catch (e) {
      console.error("[ArtifactPublicationQueue] Failed to load:", e);
      error = "Failed to load public visuals";
    } finally {
      isLoading = false;
    }
  }

  function openRemoveModal(artifact: PublicArtifactEnvelope) {
    removingArtifact = artifact;
    removeReason = "";
    showRemoveModal = true;
  }

  function closeRemoveModal() {
    showRemoveModal = false;
    removingArtifact = null;
    removeReason = "";
  }

  async function handleRemove() {
    if (!currentUser || !removingArtifact) return;
    const requestId = publicationRequestId(
      removingArtifact.artifactId,
      removingArtifact.currentRevisionId
    );
    processingId = requestId;
    try {
      await removePublication(
        requestId,
        { uid: currentUser.uid },
        removeReason.trim() || undefined
      );
      liveArtifacts = liveArtifacts.filter(
        (a) => a.artifactId !== removingArtifact?.artifactId
      );
      closeRemoveModal();
    } catch (e) {
      const failure = e instanceof Error ? e : new Error(String(e));
      getErrorHandler().showUserError({
        message: "Couldn't remove this artifact. Try again.",
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "admin",
          tab: "publications",
          action: "removePublication",
        },
      });
    } finally {
      processingId = null;
    }
  }

  function formatDate(timestamp: unknown): string {
    if (!timestamp) return "Unknown";
    const date =
      timestamp instanceof Date
        ? timestamp
        : ((timestamp as { toDate?: () => Date }).toDate?.() ??
          new Date(timestamp as string));
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<div class="publication-queue-panel">
  <header class="panel-header">
    <div class="header-content">
      <h2>
        <i class="fas fa-globe" aria-hidden="true"></i>
        Public Visuals
      </h2>
      <p class="subtitle">
        Everything currently live in Explore, newest first. Remove anything
        that breaks the rules — removal is permanent for that exact content.
      </p>
    </div>
    {#if !isLoading && !error}
      <span class="live-count" aria-label="{liveArtifacts.length} live">
        {liveArtifacts.length} live
      </span>
    {/if}
  </header>

  <div class="panel-body">
    {#if isLoading}
      <div class="loading" role="status">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Loading public visuals...</span>
      </div>
    {:else if error}
      <div class="error" role="alert">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
        <button class="retry-button" onclick={() => void loadFeed()}>
          Retry
        </button>
      </div>
    {:else if liveArtifacts.length === 0}
      <div class="empty">
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>Nothing is public yet</span>
        <p>Visuals people share appear here the moment they go live.</p>
      </div>
    {:else}
      <div class="entries-list themed-scrollbar">
        {#each liveArtifacts as artifact (artifact.artifactId)}
          {@const liveRequestId = publicationRequestId(
            artifact.artifactId,
            artifact.currentRevisionId
          )}
          <div
            class="entry-card"
            class:processing={processingId === liveRequestId}
          >
            <div class="entry-header">
              {#if artifact.posterUrl}
                <img
                  src={artifact.posterUrl}
                  alt="Artifact poster"
                  class="entry-thumbnail"
                />
              {:else}
                <div class="entry-thumbnail placeholder">
                  <i class="fas fa-image" aria-hidden="true"></i>
                </div>
              {/if}
              <div class="entry-info">
                <h3 class="entry-title">{artifact.title}</h3>
                <p class="entry-meta">
                  <span class="type-badge">{artifact.artifactType}</span>
                  By {artifact.ownerDisplayName}
                </p>
                <p class="entry-date">
                  Published {formatDate(artifact.publishedAt)}
                </p>
              </div>
            </div>

            <div class="entry-actions">
              <button
                class="action-btn reject"
                onclick={() => openRemoveModal(artifact)}
                disabled={processingId === liveRequestId}
              >
                <i class="fas fa-eye-slash" aria-hidden="true"></i>
                Remove from public
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if removingArtifact}
  <BaseModal
    bind:open={showRemoveModal}
    onclose={closeRemoveModal}
    size="sm"
    animation="pop"
    labelledBy="remove-publication-title"
  >
    {#snippet header()}
      <ModalHeader
        title="Remove from Public"
        subtitle="Removing: {removingArtifact?.title ?? ''}"
        icon="fa-eye-slash"
        iconColor="#ef4444"
        onClose={closeRemoveModal}
        id="remove-publication-title"
      />
    {/snippet}

    <div class="review-modal-body">
      <p class="modal-note">
        This takes the artifact down for everyone, permanently for this exact
        content. The creator keeps their private copy and can share an edited
        version.
      </p>
      <label for="remove-publication-reason" class="field-label">
        Reason (optional, visible to the creator)
      </label>
      <textarea
        id="remove-publication-reason"
        bind:value={removeReason}
        placeholder="Explain why this artifact is being removed..."
        rows="3"
        class="reason-input"
      ></textarea>
    </div>

    {#snippet footer()}
      <ModalFooter align="end">
        <button class="secondary" onclick={closeRemoveModal}>Cancel</button>
        <button
          class="danger"
          onclick={() => void handleRemove()}
          disabled={processingId !== null}
        >
          Remove
        </button>
      </ModalFooter>
    {/snippet}
  </BaseModal>
{/if}

<style>
  .publication-queue-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-content h2 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-content h2 i {
    color: var(--theme-accent, #22d3ee);
  }

  .subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    max-width: 52ch;
  }

  .live-count {
    padding: 0.375rem 0.875rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 18%,
      transparent
    );
    border-radius: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-accent, #22d3ee);
    white-space: nowrap;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    color: var(--theme-text-dim);
    text-align: center;
    padding: 2rem;
  }

  .error {
    color: var(--semantic-error);
  }

  .retry-button {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .retry-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .empty i {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .entries-list {
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .entry-card {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    transition: all var(--duration-fast) ease;
  }

  .entry-card.processing {
    opacity: 0.6;
    pointer-events: none;
  }

  .entry-header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .entry-thumbnail {
    width: 96px;
    height: 64px;
    border-radius: 0.5rem;
    object-fit: cover;
    background: var(--theme-card-hover-bg);
    flex-shrink: 0;
  }

  .entry-thumbnail.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    font-size: 1.5rem;
  }

  .entry-info {
    flex: 1;
    min-width: 0;
  }

  .entry-title {
    margin: 0 0 0.25rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--theme-text);
    overflow-wrap: anywhere;
  }

  .entry-meta,
  .entry-date {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-dim);
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .type-badge {
    padding: 0.125rem 0.5rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 18%,
      transparent
    );
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--theme-accent, #22d3ee);
    text-transform: capitalize;
  }

  .entry-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.reject {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .action-btn.reject:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
  }

  .review-modal-body {
    padding: var(--modal-padding, 24px);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .modal-note {
    margin: 0 0 0.5rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    line-height: 1.45;
  }

  .field-label {
    display: block;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text);
  }

  .reason-input {
    width: 100%;
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-family: inherit;
    resize: vertical;
  }

  .reason-input:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
    }

    .entry-actions {
      flex-direction: column;
    }

    .action-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>

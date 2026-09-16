<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import DeleteConfirmDialog from "../DeleteConfirmDialog.svelte";
  import { getPerformanceWorkspaceContext } from "./context/performance-workspace-context";
  import {
    formatPerformanceDate,
    formatPerformanceDuration,
    performanceCreatorName,
    performanceTimingLabel,
  } from "./performance-video-copy";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    resolveHandLabeling,
    type HandLabeling,
  } from "$lib/shared/video-collaboration/domain/hand-labeling";

  interface Props {
    isOwned: boolean;
    isLoggedIn?: boolean;
    canUpload?: boolean;
  }

  let { isOwned, isLoggedIn = false, canUpload = false }: Props = $props();
  const workspace = getPerformanceWorkspaceContext();
</script>

<aside
  class="performance-inspector"
  data-performance-inspector
  aria-label="Performance details and selection"
>
  <header class="inspector-header">
    <div>
      <span class="eyebrow">Performances</span>
      <h2>
        {workspace.videos.length} performance{workspace.videos.length === 1
          ? ""
          : "s"}
      </h2>
    </div>
    {#if canUpload}
      <PanelButton variant="primary" onclick={workspace.requestUpload}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        Add
      </PanelButton>
    {/if}
  </header>

  {#if workspace.store.loading}
    <div class="inspector-message" role="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      Loading performances…
    </div>
  {:else if workspace.store.error}
    <div class="inspector-message error" role="alert">
      <span>{workspace.store.error}</span>
      <PanelButton onclick={() => workspace.store.reload()}>
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        Try again
      </PanelButton>
    </div>
  {:else if workspace.selectedVideo}
    <section
      class="selected-details"
      aria-labelledby="selected-performance-title"
    >
      <div class="selected-copy">
        <span class="eyebrow">Selected performance</span>
        <h3 id="selected-performance-title">
          {performanceCreatorName(workspace.selectedVideo)}
        </h3>
        <p>
          {formatPerformanceDate(workspace.selectedVideo.createdAt)} · {performanceTimingLabel(
            workspace.selectedVideo
          )}
        </p>
        {#if workspace.selectedVideo.description}
          <p class="description">{workspace.selectedVideo.description}</p>
        {/if}
        {#if workspace.selectedVideo.creatorId === authState.user?.uid}
          <div class="hand-labeling">
            <span class="eyebrow" id="hand-labeling-label"
              >Read the card as</span
            >
            <SegmentedControl
              options={[
                { value: "mirror-me", label: "Mirror me" },
                { value: "as-performed", label: "As performed" },
              ]}
              value={resolveHandLabeling(workspace.selectedVideo)}
              onchange={(value: HandLabeling) =>
                void workspace.persistHandLabeling(value)}
              size="sm"
              color="accent"
              semantics="radiogroup"
              ariaLabelledby="hand-labeling-label"
            />
          </div>
        {/if}
      </div>

      {#if workspace.selectedVideo.creatorId === authState.user?.uid}
        <div class="selected-actions">
          {#if canUpload}
            <PanelButton
              onclick={() =>
                workspace.startMapping(workspace.selectedVideo!.id)}
            >
              <i class="fas fa-music" aria-hidden="true"></i>
              {workspace.selectedVideo.beatMap ? "Edit timing" : "Map timing"}
            </PanelButton>
          {/if}
          {#if isOwned}
            <button
              type="button"
              class="delete-performance"
              onclick={() =>
                workspace.requestDelete(workspace.selectedVideo!.id)}
            >
              <i class="fas fa-trash-alt" aria-hidden="true"></i>
              Delete
            </button>
          {/if}
        </div>
      {/if}
    </section>

    <section
      class="performance-collection"
      aria-labelledby="performance-list-title"
    >
      <div class="list-heading">
        <h3 id="performance-list-title">All performances</h3>
        <span>{workspace.videos.length}</span>
      </div>
      <div class="performance-list-items">
        {#each workspace.videos as video (video.id)}
          <button
            type="button"
            class="performance-option"
            class:selected={video.id === workspace.selectedVideo.id}
            onclick={() => workspace.selectVideo(video.id)}
            aria-pressed={video.id === workspace.selectedVideo.id}
          >
            <span class="option-thumbnail">
              {#if video.thumbnailUrl}
                <img src={video.thumbnailUrl} alt="" />
              {:else}
                <i class="fas fa-play" aria-hidden="true"></i>
              {/if}
              <small>{formatPerformanceDuration(video.duration)}</small>
            </span>
            <span class="option-copy">
              <strong>{performanceCreatorName(video)}</strong>
              <small>{performanceTimingLabel(video)}</small>
            </span>
          </button>
        {/each}
      </div>
    </section>
  {:else}
    <div class="inspector-message empty">
      <span class="empty-mark" aria-hidden="true">
        <i class="fas fa-video"></i>
      </span>
      <div>
        <h3>No performances yet</h3>
        <p>Share the first human take of this sequence.</p>
      </div>
      {#if canUpload}
        <PanelButton
          variant="primary"
          onclick={workspace.requestUpload}
          fullWidth
        >
          <i class="fas fa-upload" aria-hidden="true"></i>
          Perform this sequence
        </PanelButton>
      {:else if !isLoggedIn}
        <span class="sign-in-hint">Sign in to perform this sequence</span>
      {/if}
    </div>
  {/if}

  {#if workspace.pendingDeleteVideo}
    <DeleteConfirmDialog
      isDeleting={workspace.isDeleting}
      positioning="absolute"
      title="Delete performance?"
      body={workspace.deleteError ||
        `${performanceCreatorName(workspace.pendingDeleteVideo)}'s performance from ${formatPerformanceDate(workspace.pendingDeleteVideo.createdAt)} will be permanently removed. This cannot be undone.`}
      onConfirm={workspace.confirmDelete}
      onCancel={workspace.cancelDelete}
    />
  {/if}
</aside>

<style>
  .performance-inspector {
    container-type: inline-size;
    position: relative;
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #fff);
  }

  .inspector-header,
  .selected-details,
  .list-heading {
    padding: clamp(0.9rem, 2cqw, 1.35rem);
  }

  .inspector-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .eyebrow {
    display: block;
    color: var(--theme-accent, #818cf8);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  .inspector-header h2 {
    margin-top: 0.2rem;
    font-size: clamp(1.25rem, 4cqw, 2rem);
    line-height: 1.1;
  }

  .selected-details {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .selected-copy {
    min-width: 0;
  }

  .selected-copy h3 {
    margin-top: 0.25rem;
    font-size: clamp(1.05rem, 3cqw, 1.4rem);
  }

  .selected-copy p,
  .inspector-message,
  .option-copy strong {
    font-size: var(--font-size-min, 14px);
  }

  .selected-copy p {
    margin-top: 0.35rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
  }

  .selected-copy .description {
    color: var(--theme-text, #fff);
  }

  .hand-labeling {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }

  .selected-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .delete-performance {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #f87171) 55%, transparent);
    border-radius: 0.5rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 9%,
      transparent
    );
    color: var(--semantic-error, #f87171);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .delete-performance:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 16%,
      transparent
    );
  }

  .performance-collection {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
  }

  .list-heading {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.75rem;
  }

  .list-heading h3 {
    font-size: var(--font-size-min, 14px);
  }

  .list-heading span {
    display: grid;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .performance-list-items {
    display: grid;
    min-height: 0;
    flex: 1;
    grid-template-columns: 1fr;
    align-content: start;
    gap: 0.5rem;
    overflow-y: auto;
    padding: 0 0.75rem 0.9rem;
  }

  .performance-option {
    display: grid;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    grid-template-columns: clamp(5.5rem, 26cqw, 8rem) minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.75rem;
    background: transparent;
    color: var(--theme-text, #fff);
    text-align: left;
    cursor: pointer;
  }

  .performance-option:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .performance-option.selected {
    border-color: var(--theme-accent, #818cf8);
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 12%,
      transparent
    );
  }

  .option-thumbnail {
    position: relative;
    display: grid;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    place-items: center;
    border-radius: 0.5rem;
    background: #050507;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .option-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .option-thumbnail small {
    position: absolute;
    right: 0.3rem;
    bottom: 0.3rem;
    padding: 0.15rem 0.3rem;
    border-radius: 0.3rem;
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .option-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
  }

  .option-copy strong,
  .option-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-copy small {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: var(--font-size-compact, 12px);
  }

  .inspector-message {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    text-align: center;
  }

  .inspector-message h3 {
    color: var(--theme-text, #fff);
    font-size: 1.1rem;
  }

  .inspector-message p {
    margin-top: 0.25rem;
  }

  .empty-mark {
    display: grid;
    width: 3.5rem;
    height: 3.5rem;
    place-items: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-accent, #818cf8);
  }

  .sign-in-hint {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-min, 14px);
  }

  @container (max-width: 31rem) {
    .inspector-header,
    .selected-details {
      align-items: stretch;
      flex-direction: column;
    }

    .selected-actions {
      justify-content: flex-start;
    }
  }

  @media (max-height: 34rem) {
    .inspector-header,
    .selected-details,
    .list-heading {
      padding-block: 0.6rem;
    }

    .selected-details {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .selected-copy .description {
      display: none;
    }
  }
</style>

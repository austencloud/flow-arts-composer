<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";
  import { getPerformanceWorkspaceContext } from "./context/performance-workspace-context";
  import { formatPerformanceDuration } from "./performance-video-copy";

  interface Props {
    sequence: SequenceData;
    onSaveToLibrary?: () => void | Promise<void>;
  }

  let { sequence, onSaveToLibrary }: Props = $props();
  const workspace = getPerformanceWorkspaceContext();
  let readyVideoId = $state<string | null>(null);
  let saveMenuHost: VisualSequenceSaveContextMenuHost | undefined = $state();

  const selectedVisualReady = $derived(
    !!workspace.selectedVideo &&
      (!!workspace.selectedVideo.thumbnailUrl ||
        workspace.selectedVideo.id === readyVideoId)
  );

  const stageState = $derived(
    workspace.store.loading
      ? "loading"
      : workspace.store.error
        ? "error"
        : workspace.videos.length === 0
          ? "empty"
          : selectedVisualReady
            ? "ready"
            : "preparing"
  );

  $effect(() => {
    const selectedId = workspace.selectedVideo?.id ?? null;
    if (selectedId !== readyVideoId) readyVideoId = null;
  });

  function handleContextMenu(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (!target?.closest("video")) return;
    event.preventDefault();
    saveMenuHost?.openContextMenu(event.clientX, event.clientY);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="performance-stage"
  data-performance-stage
  data-performance-stage-state={stageState}
  data-performance-ready={stageState !== "loading" &&
    stageState !== "preparing"}
  oncontextmenu={handleContextMenu}
  aria-label={t("viewer_ui_selected_performance")}
>
  {#if workspace.store.loading}
    <div class="stage-message" role="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <strong>Preparing performances</strong>
      <span>Loading the takes attached to this sequence.</span>
    </div>
  {:else if workspace.store.error}
    <div class="stage-message error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <strong>Performances could not be loaded</strong>
      <span>{workspace.store.error}</span>
      <PanelButton onclick={() => workspace.store.reload()}>
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        Try again
      </PanelButton>
    </div>
  {:else if !workspace.selectedVideo}
    <div class="stage-message empty">
      <span class="empty-mark" aria-hidden="true">
        <i class="fas fa-video"></i>
      </span>
      <strong>No performance selected</strong>
      <span>The first shared take will play here.</span>
    </div>
  {:else}
    <div
      class="media-frame"
      style="--performance-ratio: {workspace.selectedVideoAspectRatio}"
    >
      {#key workspace.selectedVideo.id}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          {@attach (player) => {
            workspace.adoptPlayer(player);
            return () => workspace.adoptPlayer(null);
          }}
          src={workspace.selectedVideo.videoUrl}
          poster={workspace.selectedVideo.thumbnailUrl}
          class="performance-player"
          controls
          playsinline
          preload="auto"
          ontimeupdate={(event) =>
            workspace.reportPlayerTime(event.currentTarget.currentTime)}
          onloadedmetadata={(event) => {
            const player = event.currentTarget;
            readyVideoId = workspace.selectedVideo!.id;
            workspace.rememberVideoAspectRatio(
              workspace.selectedVideo!.id,
              player.videoWidth,
              player.videoHeight
            );
          }}
          onloadeddata={() => {
            readyVideoId = workspace.selectedVideo!.id;
          }}
        ></video>
      {/key}
      <span class="duration-badge">
        {formatPerformanceDuration(workspace.selectedVideo.duration)}
      </span>
      {#if workspace.playheadLabel}
        <span class="playhead-badge">{workspace.playheadLabel}</span>
      {/if}
    </div>
  {/if}

  <VisualSequenceSaveContextMenuHost
    bind:this={saveMenuHost}
    {sequence}
    {onSaveToLibrary}
  />
</section>

<style>
  .performance-stage {
    container-type: size;
    position: relative;
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    place-items: center;
    overflow: hidden;
    background: #050507;
    color: var(--theme-text, #fff);
  }

  .media-frame {
    position: relative;
    width: min(100cqw, calc(100cqh * var(--performance-ratio, 1.7778)));
    height: min(100cqh, calc(100cqw / var(--performance-ratio, 1.7778)));
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: var(--performance-ratio, 16 / 9);
    background: #050507;
  }

  .performance-player {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #050507;
  }

  .duration-badge,
  .playhead-badge {
    position: absolute;
    padding: 0.3rem 0.55rem;
    border-radius: 0.4rem;
    background: rgba(0, 0, 0, 0.76);
    color: #fff;
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .duration-badge {
    right: 0.75rem;
    bottom: 0.75rem;
  }

  .playhead-badge {
    top: 0.75rem;
    left: 0.75rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #818cf8) 55%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 24%,
      rgba(0, 0, 0, 0.76)
    );
  }

  .stage-message {
    display: flex;
    width: min(28rem, calc(100% - 2rem));
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .stage-message > i,
  .empty-mark {
    display: grid;
    width: 3.5rem;
    height: 3.5rem;
    place-items: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-accent, #818cf8);
    font-size: 1.25rem;
  }

  .stage-message strong {
    color: var(--theme-text, #fff);
    font-size: clamp(1rem, 2.5cqw, 1.35rem);
  }

  .stage-message.error > i {
    color: var(--semantic-error, #f87171);
  }

  @container (max-height: 20rem) {
    .stage-message {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      text-align: left;
    }

    .stage-message > i,
    .empty-mark {
      grid-row: 1 / 3;
    }
  }
</style>

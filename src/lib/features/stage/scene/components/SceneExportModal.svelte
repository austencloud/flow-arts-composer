<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ExportPopover from "#lib/shared/sequence-viewer/components/ExportPopover.svelte";
  import VideoPreviewPanel from "#lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte";
  import type { SceneVideoExportState } from "../services/create-scene-video-export.svelte";
  import RenderFilmCard from "#lib/shared/sequence-viewer/components/record-scene/RenderFilmCard.svelte";
  import type { Scene3DFilm } from "#lib/features/scene-3d-collection/domain/scene-3d-collection-types.js";

  interface Props {
    open: boolean;
    sequence: SequenceData;
    bpm: number;
    exporter: SceneVideoExportState;
    onClose: () => void;
    /** Present when this modal was opened to re-render a recorded camera
     *  performance. The film replaces the current static angle, and the card's
     *  quality presets replace the full export settings. */
    film?: Scene3DFilm | undefined;
  }

  let {
    open = $bindable(),
    sequence,
    bpm,
    exporter,
    onClose,
    film = undefined,
  }: Props = $props();

  const state = $derived(exporter.state);
  const progressPercent = $derived(
    Math.round(Math.max(0, Math.min(1, state.progress?.progress ?? 0)) * 100)
  );
  const progressLabel = $derived.by(() => {
    if (state.isCancelling) return "Cancelling render";
    switch (state.progress?.stage) {
      case "capturing":
        return "Rendering frames";
      case "encoding":
        return "Encoding video";
      case "complete":
        return "Finishing video";
      default:
        return "Preparing scene";
    }
  });

  function close(): void {
    if (state.isExporting) return;
    exporter.dismissPreview();
    exporter.clearError();
    onClose();
  }

  async function render(): Promise<void> {
    exporter.clearError();
    await exporter.render(sequence, bpm, film);
  }
</script>

<BaseModal
  bind:open
  onclose={close}
  size="md"
  class="scene-export-modal"
  labelledBy="scene-export-title"
>
  {#snippet header()}
    <div class="modal-header">
      <div>
        <span class="eyebrow">3D Studio</span>
        <h2 id="scene-export-title">Export video</h2>
      </div>
      <button
        type="button"
        class="close-button"
        onclick={close}
        disabled={state.isExporting}
        aria-label="Close export"
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="export-body">
    {#if state.previewBlobUrl}
      <VideoPreviewPanel
        blobUrl={state.previewBlobUrl}
        onDismiss={() => exporter.dismissPreview()}
        onRedownload={() => void exporter.save(sequence)}
        saveLabel="Save"
      />
    {:else}
      <div class="shot-summary">
        <i class="fas {film ? 'fa-clapperboard' : 'fa-video'}" aria-hidden="true"></i>
        <div>
          <strong>{film ? "Render this recording" : "Export the current shot"}</strong>
          <span>
            {film
              ? "The camera path you recorded, at whatever quality you pick."
              : "Your camera angle, performers, effects, and environment."}
          </span>
        </div>
      </div>

      {#if !film}
        <ExportPopover />
      {/if}

      {#if state.error}
        <p class="export-error" role="alert">{state.error}</p>
      {/if}

      {#if state.isExporting}
        <div class="export-progress" aria-live="polite">
          <div class="progress-copy">
            <span>{progressLabel}</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span style:width={`${progressPercent}%`}></span>
          </div>
          <button
            type="button"
            class="cancel-button"
            onclick={exporter.cancel}
            disabled={state.isCancelling}
            aria-label={state.isCancelling
              ? "Cancelling render"
              : "Cancel render"}
          >
            {state.isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        </div>
      {:else if film}
        <RenderFilmCard
          presentation="inline"
          durationSeconds={film.durationSeconds}
          exportOptions={exporter.options}
          title="Quality"
          renderLabel="Render film"
          discardLabel="Cancel"
          onRender={() => void render()}
          onDiscard={close}
        />
      {:else}
        <button
          type="button"
          class="render-button"
          onclick={() => void render()}
        >
          <i class="fas fa-clapperboard" aria-hidden="true"></i>
          Render 3D video
        </button>
      {/if}
    {/if}
  </div>
</BaseModal>

<style>
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
  }

  .modal-header > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  .eyebrow {
    color: var(--theme-accent, #22d3ee);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 1.125rem;
  }

  .close-button,
  .cancel-button,
  .render-button {
    min-width: 44px;
    min-height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    cursor: pointer;
  }

  .close-button {
    display: grid;
    width: 44px;
    padding: 0;
    place-items: center;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .close-button:disabled {
    cursor: wait;
    opacity: 0.4;
  }

  .export-body {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 1.125rem;
    padding: 0.25rem 1rem 1rem;
  }

  .shot-summary {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.875rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-accent, #22d3ee);
  }

  .shot-summary > i {
    font-size: 1.35rem;
  }

  .shot-summary > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
  }

  .shot-summary strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
  }

  .shot-summary span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.4;
  }

  .render-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 62%,
      transparent
    );
    background: var(--theme-accent, #22d3ee);
    color: #061014;
    font-weight: 800;
  }

  .export-progress {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .progress-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .progress-track {
    height: 0.5rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #3575e2, #ed1c24);
  }

  .cancel-button {
    align-self: center;
    min-width: 7.5rem;
    padding: 0.625rem 1rem;
    background: transparent;
    color: var(--theme-text, #fff);
  }

  .cancel-button:disabled {
    cursor: wait;
    opacity: 0.62;
  }

  .export-error {
    margin: 0;
    color: var(--semantic-error, #f87171);
    font-size: var(--font-size-min, 0.875rem);
  }

  button:focus-visible {
    outline: 3px solid var(--theme-accent, #22d3ee);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-track span {
      transition: none;
    }
  }
</style>

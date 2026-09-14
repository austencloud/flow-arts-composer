<!--
  Movement Map - describing the anatomy Level 1 requires, one instant at a time.

  Three stages. Setup picks the footage and the sequence. Timing reuses the
  canonical StepMapEditor rather than growing a second way to align video to
  steps - that capability already has an owner, and the annotation phase math
  reads the StepMap it produces. Annotate is the new work.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import StepMapEditor from "$lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte";
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { getMovementAnnotationStore } from "./services/movement-annotation-store";
  import { createMovementMapState } from "./state/movement-map-state.svelte";
  import { setMovementMapContext } from "./context/movement-map-context";
  import {
    buildCorpusExport,
    corpusFilename,
    parseCorpusImport,
  } from "./domain/corpus-export";
  import SetupView from "./components/SetupView.svelte";
  import AnnotateView from "./components/AnnotateView.svelte";

  const movementMap = createMovementMapState(getMovementAnnotationStore());
  setMovementMapContext({ state: movementMap });

  let importInput = $state<HTMLInputElement | undefined>();
  let importError = $state<string | null>(null);

  onMount(() => {
    void movementMap.loadSpace();
    void movementMap.loadAnnotations();
  });

  onDestroy(() => movementMap.teardown());

  // A status line that never clears would sit there claiming a save that
  // happened a hundred observations ago.
  $effect(() => {
    if (!movementMap.statusMessage) return;
    const timer = setTimeout(() => movementMap.clearStatus(), 2400);
    return () => clearTimeout(timer);
  });

  function onTimingSaved(stepMap: StepMap): void {
    movementMap.setStepMap(stepMap);
    movementMap.goToStage("annotate");
  }

  function exportCorpus(): void {
    if (!movementMap.space || !movementMap.coverage) return;
    const payload = buildCorpusExport(
      movementMap.annotations,
      movementMap.space,
      movementMap.coverage
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = corpusFilename();
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImportChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importError = null;
    try {
      const incoming = parseCorpusImport(await file.text());
      await movementMap.importAnnotations(incoming);
    } catch (cause) {
      importError =
        cause instanceof Error ? cause.message : "That file could not be read.";
    } finally {
      input.value = "";
    }
  }
</script>

<div class="lab">
  <header class="lab-header">
    <i class="fas fa-person-running" aria-hidden="true"></i>
    <h2>Movement Map</h2>
    <span class="badge">Level 1</span>

    {#if movementMap.coverage}
      <span class="progress" role="status">
        {movementMap.coverage.mapped}/{movementMap.coverage.total} movements mapped
      </span>
    {/if}

    <div class="corpus-actions">
      {#if movementMap.statusMessage}
        <span class="saved" role="status">{movementMap.statusMessage}</span>
      {/if}
      <input
        bind:this={importInput}
        type="file"
        accept="application/json"
        class="visually-hidden"
        onchange={onImportChosen}
      />
      <button type="button" onclick={() => importInput?.click()}>
        <i class="fas fa-file-import" aria-hidden="true"></i>
        <span>Import</span>
      </button>
      <button
        type="button"
        onclick={exportCorpus}
        disabled={movementMap.annotations.length === 0}
      >
        <i class="fas fa-file-export" aria-hidden="true"></i>
        <span>Export {movementMap.annotations.length || ""}</span>
      </button>
    </div>
  </header>

  {#if importError}
    <p class="import-error" role="alert">{importError}</p>
  {/if}

  <div class="body">
    {#if movementMap.stage === "setup"}
      <SetupView />
    {:else if movementMap.stage === "timing" && movementMap.video && movementMap.sequence}
      <StepMapEditor
        videoUrl={movementMap.video.url}
        videoDuration={movementMap.video.duration}
        steps={movementMap.sequence.steps}
        startPosition={movementMap.sequence.startPosition ??
          movementMap.sequence.startingPosition}
        bpm={60}
        initialStepMap={movementMap.stepMap ?? undefined}
        draftKey={`movement:${movementMap.sequence.id}:${movementMap.video.id}`}
        onSave={async (stepMap) => onTimingSaved(stepMap)}
        onClose={() => movementMap.goToStage("setup")}
      />
    {:else if movementMap.stage === "annotate" && movementMap.stepMap}
      <AnnotateView />
    {:else}
      <div class="fallback">
        <p>Pick footage and a sequence to start.</p>
        <button type="button" onclick={() => movementMap.goToStage("setup")}>
          Back to setup
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #fff);
  }

  .lab-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .lab-header i {
    font-size: 1.125rem;
    color: var(--theme-accent, #6366f1);
  }

  .lab-header h2 {
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .badge {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
  }

  .progress {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-variant-numeric: tabular-nums;
  }

  .corpus-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
  }

  .saved {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--semantic-success, #22c55e);
    font-weight: 600;
  }

  .corpus-actions button,
  .fallback button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    cursor: pointer;
  }

  .corpus-actions button:hover:not(:disabled),
  .fallback button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #6366f1);
  }

  .corpus-actions button:focus-visible,
  .fallback button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .corpus-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .import-error {
    margin: 0;
    padding: 0.5rem 1rem;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--semantic-red, #ef4444);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.55));
  }

  @media (min-width: 162.5rem) {
    .lab-header {
      gap: 1rem;
      padding: 1.25rem 2rem;
    }

    .lab-header i,
    .lab-header h2 {
      font-size: 1.5rem;
    }
  }
</style>

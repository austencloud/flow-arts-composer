<script lang="ts">
  import type { ScanCellWarmState } from "#lib/features/choreo-card/state/scan-cell-warm-state.svelte.js";
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import ProgressBar from "#lib/shared/components/loading/ProgressBar.svelte";

  interface Props {
    state: ScanCellWarmState;
    selectedCode: string | null;
  }

  let { state, selectedCode }: Props = $props();

  const progressPercent = $derived.by(() => {
    const progress = state.progress;
    if (!progress || progress.total === 0) return 0;
    return (progress.done / progress.total) * 100;
  });

  const scopeLabel = $derived.by(() => {
    const scope = state.scope;
    if (!scope) return "Legacy QR cards";
    if (scope.kind === "code") return `Card ${scope.code}`;
    if (scope.kind === "failed") {
      return `${scope.count.toLocaleString()} failed card${scope.count === 1 ? "" : "s"}`;
    }
    return "All legacy QR cards";
  });

  const progressLabel = $derived.by(() => {
    const progress = state.progress;
    if (!progress) return state.running ? "Loading card list…" : "";

    const count = `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`;
    const failures = progress.failed
      ? ` · ${progress.failed.toLocaleString()} failed`
      : "";

    if (state.cancellationRequested)
      return `Stopping after ${count}${failures}`;
    if (state.running) return `${count} cards${failures}`;
    if (progress.cancelled) return `Stopped after ${count} cards${failures}`;
    if (progress.failed) return `Finished ${count} cards${failures}`;
    return `${progress.done.toLocaleString()} cards ready`;
  });

  const actionPhase = $derived(
    state.running ? "running" : selectedCode ? "selected" : "idle"
  );
  const statusPhase = $derived(
    state.error
      ? "error"
      : state.progress || state.running
        ? "progress"
        : "idle"
  );
</script>

<section class="cache-maintenance" aria-labelledby="scan-cache-title">
  <div class="cache-copy">
    <span class="cache-icon" aria-hidden="true">
      <i class="fas fa-cloud-arrow-up"></i>
    </span>
    <div>
      <h3 id="scan-cache-title">Legacy preview cache</h3>
      <p>Pre-render legacy QR cards so scanners download pictographs only.</p>
    </div>
  </div>

  <div class="action-stage">
    <Crossfade key={actionPhase} animateHeight>
      <div class="cache-actions">
        {#if state.running}
          <AdminActionButton
            variant="warning"
            icon="fa-stop"
            disabled={state.cancellationRequested}
            onclick={state.cancel}
          >
            {state.cancellationRequested ? "Stopping…" : "Stop"}
          </AdminActionButton>
        {:else}
          {#if selectedCode}
            <AdminActionButton
              variant="secondary"
              icon="fa-cloud-arrow-up"
              onclick={() => state.startCode(selectedCode)}
            >
              Warm {selectedCode}
            </AdminActionButton>
          {/if}
          <AdminActionButton
            variant="info"
            icon="fa-layer-group"
            onclick={state.startAll}
          >
            Warm all legacy cards
          </AdminActionButton>
        {/if}
      </div>
    </Crossfade>
  </div>

  <div class="status-stage">
    <Crossfade key={statusPhase} animateHeight>
      {#if state.error}
        <p class="cache-error" role="alert">{state.error}</p>
      {:else if state.progress || state.running}
        <div class="cache-progress" aria-live="polite">
          <div class="progress-copy">
            <strong>{scopeLabel}</strong>
            <span>{progressLabel}</span>
          </div>
          <ProgressBar
            percent={progressPercent}
            label={state.progress?.current
              ? `Current: ${state.progress.current}`
              : undefined}
            showPercent={Boolean(state.progress?.total)}
          />
          {#if !state.running && (state.progress?.failedCodes.length ?? 0) > 0}
            <div class="retry-row">
              <span>
                Retry the {state.progress?.failedCodes.length.toLocaleString()} failed
                card{state.progress?.failedCodes.length === 1 ? "" : "s"}.
              </span>
              <AdminActionButton
                variant="secondary"
                icon="fa-rotate-right"
                onclick={state.retryFailed}
              >
                Retry failed
              </AdminActionButton>
            </div>
          {/if}
        </div>
      {:else}
        <p class="cache-idle">No cache job is running.</p>
      {/if}
    </Crossfade>
  </div>
</section>

<style>
  .cache-maintenance {
    container-type: inline-size;
    display: grid;
    grid-template-columns: minmax(250px, 1fr) auto;
    align-items: center;
    gap: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    padding: 10px var(--spacing-md, 16px) 12px;
  }

  .cache-copy,
  .cache-actions,
  .progress-copy,
  .retry-row {
    display: flex;
    align-items: center;
  }

  .cache-copy {
    gap: 10px;
    min-width: 0;
  }

  .cache-icon {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 13%, transparent);
    color: var(--theme-accent, #34d399);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
  }

  .cache-copy p,
  .progress-copy span,
  .retry-row span,
  .cache-idle {
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
  }

  .cache-copy p {
    margin-top: 2px;
  }

  .action-stage {
    min-width: 0;
  }

  .cache-actions {
    justify-content: flex-end;
    gap: var(--spacing-sm, 8px);
  }

  .status-stage {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .cache-progress {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .progress-copy,
  .retry-row {
    justify-content: space-between;
    gap: var(--spacing-md, 16px);
  }

  .progress-copy strong {
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-copy span {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
  }

  .retry-row {
    margin-top: 2px;
  }

  .cache-error {
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm, 14px);
  }

  @container (max-width: 720px) {
    .cache-maintenance {
      grid-template-columns: 1fr;
    }

    .cache-actions {
      justify-content: stretch;
      flex-wrap: wrap;
    }

    .cache-actions :global(.admin-action-btn) {
      flex: 1 1 180px;
    }

    .status-stage {
      grid-column: auto;
    }

    .progress-copy,
    .retry-row {
      align-items: stretch;
      flex-direction: column;
      gap: 4px;
    }

    .retry-row :global(.admin-action-btn) {
      align-self: flex-start;
    }
  }
</style>

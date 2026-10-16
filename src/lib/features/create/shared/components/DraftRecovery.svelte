<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import StepGrid from "../workspace-panel/sequence-display/components/StepGrid.svelte";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import { deriveWordFromBeats } from "#lib/shared/foundation/services/word-deriver.js";
  import type { DraftRecoveryController } from "../state/create-module/draft-recovery-controller.svelte";

  let {
    controller,
    surface,
  }: {
    controller: DraftRecoveryController;
    surface: "status" | "control" | "dialog";
  } = $props();
  const status = $derived(controller.status?.status ?? "idle");
  const needsReview = $derived(status === "recovery" || status === "conflict");
  const labels = {
    idle: "Drafts save on this device",
    saving: "Saving…",
    saved: "Saved on this device",
    error: "Not saved. Your work is still open.",
    recovery: "An unfinished draft is available",
    conflict: "Another tab changed this draft",
  };
  const modeNames = {
    construct: "Construct",
    generate: "Generate",
    assemble: "Assemble",
  };
  const title = $derived(
    controller.dialogKind === "conflict"
      ? "Choose a version"
      : controller.dialogKind === "recovery"
        ? "Recover your draft"
        : "Saved drafts"
  );
  function savedTime(value: number) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(value);
  }
</script>

{#if surface === "control" && controller.mode}
  <button
    type="button"
    class="draft-control"
    class:attention={status === "error" || needsReview}
    disabled={controller.busy}
    onclick={() => controller.showDrafts()}
    aria-label={needsReview ? "Review draft" : "Saved drafts"}
    aria-haspopup="dialog"
    title="{needsReview ? 'Review draft' : 'Saved drafts'} — {labels[status]}"
    data-testid="drafts-control"
  >
    <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
    {#if status === "error" || needsReview}
      <span class="attention-dot" aria-hidden="true"></span>
    {/if}
    <span class="sr-only" role="status" aria-live="polite"
      >{labels[status]}</span
    >
  </button>
{/if}

{#if surface === "status" && controller.mode && (status === "error" || needsReview)}
  <div
    class="draft-status"
    class:attention={status === "error" || needsReview}
    data-testid="draft-save-status"
  >
    <span class="status-label" role="status" aria-live="polite"
      >{labels[status]}</span
    >
    <div class="status-actions">
      {#if status === "error"}
        <button disabled={controller.busy} onclick={() => controller.retry()}
          >Retry save</button
        >
      {/if}
      <button
        disabled={controller.busy}
        onclick={() => controller.showDrafts()}
      >
        {needsReview ? "Review draft" : "Saved drafts"}
      </button>
    </div>
  </div>
{/if}

{#if surface === "dialog"}
  <BaseModal
    open={controller.open}
    onclose={() => controller.close()}
    closeOnBackdrop={!controller.busy}
    closeOnEscape={!controller.busy}
    size="lg"
    labelledBy="draft-recovery-title"
    describedBy="draft-recovery-description"
  >
    <section
      class="draft-dialog"
      data-testid="draft-recovery-dialog"
      aria-busy={controller.busy}
    >
      <header>
        <p class="mode-label">{modeNames[controller.dialogMode]}</p>
        <h2 id="draft-recovery-title">{title}</h2>
        <p id="draft-recovery-description">
          {#if controller.dialogKind === "conflict"}
            Choose the version you want to continue editing. The others stay
            available.
          {:else if controller.dialogKind === "recovery"}
            Your workspace could not be reopened, but a saved draft is available
            on this device.
          {:else if controller.dialogMode !== "assemble"}
            Continue a saved version with its editing history.
          {:else}
            Continue a saved version.
          {/if}
        </p>
      </header>

      {#if controller.message}
        <p class="recovery-error" role="alert">{controller.message}</p>
      {/if}

      <div class="versions">
        {#each controller.versions as version, index (version.id)}
          {@const sequence = version.workspace.currentSequence}
          {@const start =
            version.workspace.selectedStartPlacement ??
            sequence?.startPlacement ??
            null}
          {@const steps = sequence?.steps ?? []}
          {@const word = deriveWordFromBeats(steps) || sequence?.word || ""}
          <article class="version" data-testid="draft-version">
            <div class="version-heading">
              <p class="version-recency">
                {index === 0 ? "Most recent save" : "Earlier save"}
              </p>
              <h3>
                {word ||
                  sequence?.name ||
                  (start ? "Starting position" : "Empty draft")}
              </h3>
              <p>
                {steps.length}
                {steps.length === 1 ? "step" : "steps"} ·
                <time datetime={new Date(version.savedAt).toISOString()}
                  >{savedTime(version.savedAt)}</time
                >
              </p>
            </div>
            {#if steps.length || start}
              <div
                class="version-preview"
                role="img"
                aria-label={`${word || "Starting position"}, ${steps.length} ${steps.length === 1 ? "step" : "steps"}. Saved sequence preview.`}
              >
                <div class="preview-content" inert>
                  <StepGrid
                    {steps}
                    startPlacement={start}
                    gridJoin={sequence ? sequenceGridJoin(sequence) : null}
                    sequenceWord={word}
                    sizingProfile="preview"
                    fitAllSteps={true}
                    stepIdentityPrefix={`draft-${version.id}`}
                    autoFocusSelectedStep={false}
                  />
                </div>
              </div>
            {/if}
            <button
              class="continue"
              disabled={controller.busy}
              onclick={() => controller.recover(version.id)}
            >
              Continue this version
            </button>
          </article>
        {:else}
          <p class="empty">
            {controller.busy
              ? "Reading saved drafts…"
              : "No saved drafts yet. Your sequence will appear here after you start building."}
          </p>
        {/each}
      </div>
    </section>
    {#snippet footer()}
      <footer>
        <button disabled={controller.busy} onclick={() => controller.close()}
          >Close</button
        >
        {#if controller.dialogKind !== "history"}
          <button
            disabled={controller.busy}
            onclick={() => controller.startFresh()}>Start a new draft</button
          >
        {/if}
      </footer>
    {/snippet}
  </BaseModal>
{/if}

<style>
  .draft-control {
    pointer-events: auto;
    position: relative;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: 0 0 var(--min-touch-target, 44px);
    padding: 0;
    border-radius: 50%;
    font-size: var(--font-size-lg, 18px);
  }
  .attention-dot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--semantic-warning, #fbbf24);
    border: 2px solid var(--theme-panel-bg);
  }
  .draft-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    flex-shrink: 0;
    color: var(--theme-text-secondary, #cbd5e1);
    background: var(--theme-panel-bg, #18202f);
    border-bottom: 1px solid var(--theme-stroke, #475569);
    font-size: 14px;
  }
  .status-label {
    min-width: 0;
  }
  .status-actions {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
  }
  .attention .status-label {
    color: var(--theme-text, #f8fafc);
    font-weight: 600;
  }
  button {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--theme-stroke, #475569);
    border-radius: 8px;
    background: var(--theme-card-bg, #263247);
    color: var(--theme-text, #f8fafc);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--theme-panel-hover-bg, #334155);
  }
  button:focus-visible {
    outline: 2px solid var(--theme-accent, #a5b4fc);
    outline-offset: 3px;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .status-actions button {
    border-color: transparent;
    background: transparent;
  }
  .draft-dialog {
    padding: clamp(16px, 3vw, 28px);
    color: var(--theme-text, #f8fafc);
  }
  header {
    margin-bottom: 20px;
  }
  .mode-label {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--theme-text-secondary, #cbd5e1);
  }
  h2 {
    font-size: clamp(22px, 3vw, 28px);
    line-height: 1.2;
    margin: 0 0 10px;
  }
  header > p:last-child {
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
    max-width: 60ch;
    color: var(--theme-text-secondary, #cbd5e1);
  }
  .versions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 16px;
  }
  .version {
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 14px;
    border: 1px solid var(--theme-stroke, #475569);
    border-radius: 12px;
    background: var(--theme-card-bg, #263247);
  }
  h3 {
    font-size: 20px;
    line-height: 1.3;
    overflow-wrap: anywhere;
    margin: 0 0 5px;
  }
  .version-heading p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--theme-text-secondary, #cbd5e1);
  }
  .version-heading .version-recency {
    margin-bottom: 8px;
    font-weight: 600;
  }
  .version-preview {
    height: 190px;
    min-width: 0;
    margin: 12px 0;
  }
  .preview-content {
    width: 100%;
    height: 100%;
  }
  .continue {
    width: 100%;
    margin-top: auto;
    background: var(--theme-panel-bg, #18202f);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px clamp(16px, 3vw, 28px);
    border-top: 1px solid var(--theme-stroke, #475569);
  }
  .empty,
  .recovery-error {
    font-size: 14px;
    line-height: 1.5;
  }
  .recovery-error {
    padding: 12px;
    border: 1px solid var(--theme-stroke, #475569);
    border-radius: 8px;
  }
  @media (max-width: 480px) {
    .draft-status {
      padding: 0 8px;
      flex-wrap: wrap;
    }
    .status-actions button {
      padding-inline: 8px;
    }
    .version-preview {
      height: 160px;
    }
  }
</style>

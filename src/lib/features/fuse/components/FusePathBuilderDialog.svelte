<script lang="ts">
  import GenerationSettingsOverlay from "$lib/features/create/generate/components/cards/GenerationSettingsOverlay.svelte";
  import GenerationSettingsDrawer from "$lib/features/create/generate/components/modals/GenerationSettingsDrawer.svelte";
  import BuilderMotionSettings from "$lib/features/assemble-lab/components/BuilderMotionSettings.svelte";
  import BuilderOrientationPicker from "$lib/features/assemble-lab/components/BuilderOrientationPicker.svelte";
  import InteractiveGrid from "$lib/features/assemble-lab/components/InteractiveGrid.svelte";
  import { createAssembleState } from "$lib/features/assemble-lab/state/assemble-state.svelte";
  import { startOrientationsForLevel } from "$lib/features/create/generate/domain/level-orientation-policy";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { getFuseContext } from "../context/fuse-context";
  import {
    buildFusePathSource,
    fuseBuilderTurnCounts,
    type BuiltFusePathResult,
  } from "../services/fuse-built-path";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    isOpen = $bindable(false),
    side,
    desktopModal = false,
    onClose,
  }: {
    isOpen?: boolean;
    side: FuseSide | null;
    desktopModal?: boolean;
    onClose?: () => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const builderState = createAssembleState();
  const resolvedSide = $derived<FuseSide>(side ?? "left");
  const sourceLabel = $derived(resolvedSide === "left" ? "Left" : "Right");
  const sourceColor = $derived(
    resolvedSide === "left"
      ? "var(--prop-blue, #2e8bf0)"
      : "var(--prop-red, #ed1c24)"
  );
  const activeHand = $derived(
    resolvedSide === "left" ? HandSide.LEFT : HandSide.RIGHT
  );
  const activeSteps = $derived(
    resolvedSide === "left" ? builderState.leftSteps : builderState.rightSteps
  );
  const targetLength = $derived(
    fuseState.appliedLength ?? fuseState.requestedLength
  );
  const allowedOrientations = $derived(
    startOrientationsForLevel(fuseState.generationLevel)
  );
  const turnCounts = $derived(
    fuseBuilderTurnCounts(fuseState.generationLevel, fuseState.maxTurnIntensity)
  );
  const atStepLimit = $derived(activeSteps.length >= targetLength);
  const levelSummary = $derived(
    fuseState.generationLevel === 1
      ? "Level 1 · no added turns"
      : `Level ${fuseState.generationLevel} · up to ${fuseState.maxTurnIntensity} turns`
  );

  let feedback = $state<string | null>(null);
  let submitting = $state(false);
  let wasOpen = false;
  let lastSubmission = "";

  function configureBuilder(): void {
    builderState.reset();
    if (builderState.gridMode !== fuseState.gridMode) {
      builderState.setGridMode(fuseState.gridMode);
    }
    if (builderState.activeHand !== activeHand) {
      builderState.switchToHand(activeHand);
    }
    builderState.setTurnCount(0);
    feedback = null;
    submitting = false;
    lastSubmission = "";
  }

  function closeBuilder(): void {
    isOpen = false;
    builderState.reset();
    feedback = null;
    submitting = false;
    lastSubmission = "";
    onClose?.();
  }

  function resetBuilder(): void {
    configureBuilder();
  }

  function blockPastLimit(): boolean {
    if (!atStepLimit) return false;
    feedback = `This path is already ${targetLength} steps. Undo the last step to change it.`;
    return true;
  }

  function stepSignature(): string {
    return activeSteps
      .map(
        (step) =>
          `${step.startPlacement}:${step.endPlacement}:${step.startOrientation}:${step.endOrientation}:${step.rotationDirection}:${step.turnCount}`
      )
      .join("|");
  }

  async function useBuiltPath(
    result: Extract<BuiltFusePathResult, { ok: true }>,
    signature: string
  ): Promise<void> {
    if (submitting || signature === lastSubmission) return;
    lastSubmission = signature;
    submitting = true;
    feedback = `Using this ${sourceLabel} path…`;
    await fuseState.setSource(resolvedSide, result.sequence, {
      kind: "custom",
      label: `${sourceLabel} built path`,
    });
    if (fuseState.error?.side === resolvedSide) {
      feedback = fuseState.error.message;
      submitting = false;
      return;
    }
    closeBuilder();
  }

  $effect(() => {
    if (isOpen && !wasOpen) configureBuilder();
    wasOpen = isOpen;
  });

  // Exact, seamless paths apply as soon as the final prop animation settles.
  // An open seam stays editable and explains what the final step must fix.
  $effect(() => {
    const steps = activeSteps;
    const phase = builderState.phase;
    const length = targetLength;
    if (!isOpen || submitting || phase === "animating") return;
    if (steps.length < length) {
      feedback = null;
      lastSubmission = "";
      return;
    }
    if (steps.length !== length) return;

    const result = buildFusePathSource({
      steps,
      expectedLength: length,
      gridMode: fuseState.gridMode,
      side: resolvedSide,
    });
    if (!result.ok) {
      feedback = result.message;
      return;
    }
    const signature = stepSignature();
    void useBuiltPath(result, signature);
  });
</script>

{#snippet builderContent()}
  <GenerationSettingsOverlay
    title="Build {sourceLabel} path"
    titleId="fuse-path-builder-title"
    closeLabel="Close path builder"
    onClose={closeBuilder}
  >
    {#snippet children()}
      <div
        class="path-builder"
        style:--builder-source-color={sourceColor}
        aria-busy={submitting}
      >
        <div class="builder-summary" aria-label="Path recipe">
          <span class="source-badge">{sourceLabel} path</span>
          <span
            ><strong>{activeSteps.length}</strong> / {targetLength} steps</span
          >
          <span>Level {fuseState.generationLevel}</span>
          <span>{fuseState.gridMode}</span>
          {#if fuseState.generationLevel > 1}
            <span>≤ {fuseState.maxTurnIntensity} turns</span>
          {/if}
        </div>

        <div class="builder-workspace">
          <div class="builder-stage">
            <InteractiveGrid
              {builderState}
              startAimEnabled={false}
              onStepCapExceeded={blockPastLimit}
            />
          </div>

          <aside class="builder-controls" aria-label="Step controls">
            <div class="instruction-card">
              <span class="step-kicker">
                {#if builderState.currentPosition === null}
                  Start
                {:else}
                  Step {Math.min(activeSteps.length + 1, targetLength)}
                {/if}
              </span>
              <h3>
                {#if builderState.currentPosition === null}
                  Choose a starting point
                {:else if atStepLimit}
                  Check the loop seam
                {:else}
                  Choose direction, then the next point
                {/if}
              </h3>
              <p>
                {#if builderState.currentPosition === null}
                  The selected {fuseState.gridMode.toLowerCase()} grid is locked to
                  the current Fuse recipe.
                {:else if atStepLimit}
                  A valid path applies automatically when its final location and
                  orientation match the start.
                {:else}
                  CW and CCW control the prop on this step. On an arc, that
                  choice determines pro-spin or anti-spin.
                {/if}
              </p>
            </div>

            {#if builderState.currentPosition !== null && activeSteps.length === 0}
              <div class="control-group">
                <span class="control-label">Starting orientation</span>
                <BuilderOrientationPicker
                  value={builderState.currentOrientation}
                  {allowedOrientations}
                  onchange={(orientation) =>
                    builderState.setOrientation(orientation)}
                />
              </div>
            {/if}

            {#if builderState.currentPosition !== null && !atStepLimit}
              <div class="control-group">
                <BuilderMotionSettings
                  turnCount={builderState.turnCount}
                  rotationDirection={builderState.rotationDirection}
                  onchangeTurnCount={(turns) =>
                    builderState.setTurnCount(turns)}
                  onchangeRotationDirection={(direction) =>
                    builderState.setRotationDirection(direction)}
                  {turnCounts}
                  showTurns={fuseState.generationLevel > 1}
                  stacked={true}
                />
              </div>
            {/if}

            <div
              class="completion-status"
              class:error={feedback && !submitting}
              role={feedback && !submitting ? "alert" : "status"}
              aria-live="polite"
            >
              <i
                class="fas {submitting
                  ? 'fa-spinner fa-spin'
                  : feedback
                    ? 'fa-circle-info'
                    : 'fa-link'}"
                aria-hidden="true"
              ></i>
              <span>
                {feedback ??
                  `${levelSummary}. The path applies at ${targetLength} closed steps.`}
              </span>
            </div>

            <div class="builder-actions">
              <PanelButton
                variant="secondary"
                disabled={!builderState.canUndo || submitting}
                onclick={() => builderState.undoStep()}
              >
                <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
                Undo
              </PanelButton>
              <PanelButton
                variant="secondary"
                disabled={activeSteps.length === 0 || submitting}
                onclick={resetBuilder}
              >
                <i class="fas fa-trash-can" aria-hidden="true"></i>
                Clear
              </PanelButton>
              <PanelButton
                variant="secondary"
                disabled={submitting}
                onclick={closeBuilder}
              >
                Cancel
              </PanelButton>
            </div>
          </aside>
        </div>
      </div>
    {/snippet}
  </GenerationSettingsOverlay>
{/snippet}

{#if desktopModal}
  <BaseModal
    bind:open={isOpen}
    onclose={closeBuilder}
    size="xl"
    animation="pop"
    class="fuse-path-builder-modal"
    labelledBy="fuse-path-builder-title"
  >
    <div class="path-builder-modal-content">
      {@render builderContent()}
    </div>
  </BaseModal>
{:else}
  <GenerationSettingsDrawer
    {isOpen}
    ariaLabel="Build a one-hand Fuse path"
    surface="panel"
    onClose={closeBuilder}
  >
    {#snippet children()}
      <div class="path-builder-drawer-content">
        {@render builderContent()}
      </div>
    {/snippet}
  </GenerationSettingsDrawer>
{/if}

<style>
  .path-builder-modal-content,
  .path-builder-drawer-content {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 8%, black);
  }

  .path-builder-modal-content {
    padding: 1rem 1.125rem 1.125rem;
  }

  .path-builder-modal-content > :global(.generation-settings-overlay),
  .path-builder-drawer-content > :global(.generation-settings-overlay) {
    position: static;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .path-builder {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--settings-spacing-md, 12px);
    min-width: 0;
    min-height: 0;
  }

  .builder-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 7px 9px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-md, 12px);
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  .builder-summary span {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  }

  .builder-summary .source-badge {
    border: 1px solid
      color-mix(in srgb, var(--builder-source-color) 55%, transparent);
    background: color-mix(
      in srgb,
      var(--builder-source-color) 15%,
      var(--theme-card-bg)
    );
    color: color-mix(in srgb, var(--builder-source-color) 70%, white);
    font-weight: 800;
  }

  .builder-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(20rem, 0.65fr);
    gap: var(--settings-spacing-lg, 16px);
    flex: 1;
    min-height: 0;
  }

  .builder-stage {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--builder-source-color) 38%, var(--theme-stroke));
    border-radius: var(--settings-radius-lg, 16px);
    background: var(--theme-card-bg);
    container-name: tool-panel;
    container-type: size;
  }

  .builder-controls {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 12px);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: clamp(12px, 1.2vw, 20px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 16px);
    background: var(--theme-card-bg);
  }

  .instruction-card {
    padding-bottom: var(--settings-spacing-md, 12px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .step-kicker,
  .control-label {
    color: color-mix(in srgb, var(--builder-source-color) 72%, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .instruction-card h3 {
    margin: 4px 0 0;
    color: var(--theme-text);
    font-size: var(--font-size-lg, 20px);
    line-height: 1.2;
  }

  .instruction-card p {
    margin: 7px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .completion-status {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    margin-top: auto;
    padding: 11px 12px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-success) 32%, var(--theme-stroke));
    border-radius: var(--settings-radius-md, 12px);
    background: color-mix(
      in srgb,
      var(--semantic-success) 8%,
      var(--theme-panel-bg)
    );
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
  }

  .completion-status i {
    margin-top: 3px;
    color: var(--semantic-success);
  }

  .completion-status.error {
    border-color: color-mix(
      in srgb,
      var(--semantic-warning) 48%,
      var(--theme-stroke)
    );
    background: color-mix(
      in srgb,
      var(--semantic-warning) 9%,
      var(--theme-panel-bg)
    );
  }

  .completion-status.error i {
    color: var(--semantic-warning);
  }

  .builder-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--settings-spacing-sm, 8px);
  }

  :global(dialog.fuse-path-builder-modal[data-size="xl"]) {
    width: min(90vw, 88rem);
    height: min(88dvh, 58rem);
    border: 1px solid var(--theme-stroke-strong);
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 8%, black);
  }

  :global(dialog.fuse-path-builder-modal .modal-body) {
    overflow: hidden;
  }

  @media (max-width: 1023px) {
    .path-builder-drawer-content {
      overflow: hidden;
    }

    .path-builder-drawer-content > :global(.generation-settings-overlay) {
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .path-builder {
      min-height: max-content;
    }

    .builder-workspace {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(18rem, 48dvh) auto;
    }

    .builder-stage {
      min-height: 18rem;
    }

    .builder-controls {
      overflow: visible;
    }
  }

  @media (max-width: 1023px) and (max-height: 520px) {
    .builder-workspace {
      grid-template-rows: minmax(10rem, 46dvh) auto;
    }

    .builder-stage {
      min-height: 10rem;
    }
  }

  @media (max-width: 520px) {
    .builder-summary {
      gap: 5px;
    }

    .builder-summary span {
      padding-inline: 8px;
    }

    .builder-workspace {
      grid-template-rows: minmax(16rem, 44dvh) auto;
      gap: 10px;
    }

    .builder-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .builder-actions :global(.panel-btn:last-child) {
      grid-column: 1 / -1;
    }
  }

  @media (min-width: 2600px) {
    :global(dialog.fuse-path-builder-modal[data-size="xl"]) {
      --font-size-min: 18px;
      --font-size-compact: 16px;
      --font-size-lg: 26px;
      --min-touch-target: 60px;
      width: min(76vw, 132rem);
      height: min(80dvh, 82rem);
    }

    .path-builder-modal-content {
      padding: 1.5rem 1.75rem 1.75rem;
    }

    .builder-workspace {
      grid-template-columns: minmax(0, 1.45fr) minmax(32rem, 0.55fr);
      gap: 24px;
    }

    .builder-controls {
      padding: 24px;
      gap: 18px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .path-builder,
    .builder-controls {
      scroll-behavior: auto;
    }
  }
</style>

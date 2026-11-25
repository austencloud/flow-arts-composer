<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GenerationSettingsOverlay from "#lib/features/create/generate/components/cards/GenerationSettingsOverlay.svelte";
  import GenerationSettingsDrawer from "#lib/features/create/generate/components/modals/GenerationSettingsDrawer.svelte";
  import BuilderMotionSettings from "#lib/features/assemble-lab/components/BuilderMotionSettings.svelte";
  import BuilderOrientationPicker from "#lib/features/assemble-lab/components/BuilderOrientationPicker.svelte";
  import InteractiveGrid from "#lib/features/assemble-lab/components/InteractiveGrid.svelte";
  import { createAssembleState } from "#lib/features/assemble-lab/state/assemble-state.svelte.js";
  import { startOrientationsForLevel } from "#lib/features/create/generate/domain/level-orientation-policy.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    HandSide,
    Orientation,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    Crossfade,
    flyFade,
    growFade,
    popIn,
  } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getFuseContext } from "../context/fuse-context";
  import {
    buildFusePathSource,
    fuseBuilderTurnCounts,
    type BuiltFusePathResult,
  } from "../services/fuse-built-path";
  import { resolveFuseBuilderArrangement } from "../services/fuse-workspace-split";
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
  // A built path is a new path for this hand, so it follows that hand's own
  // settings for new paths: its length, level, turns and grid.
  const recipe = $derived(fuseState.recipeFor(resolvedSide));
  const targetLength = $derived(recipe.requestedLength);
  const allowedOrientations = $derived(
    startOrientationsForLevel(recipe.generationLevel)
  );
  const turnCounts = $derived(
    fuseBuilderTurnCounts(recipe.generationLevel, recipe.maxTurnIntensity)
  );
  const atStepLimit = $derived(activeSteps.length >= targetLength);
  const statusText = $derived(
    recipe.generationLevel === 1
      ? t("fuse_builder_status_level_one", { count: targetLength })
      : t("fuse_builder_status_level_up_to", {
          level: recipe.generationLevel,
          turns: recipe.maxTurnIntensity,
          count: targetLength,
        })
  );

  // The screen's own box decides the layout: the same screen is a phone sheet,
  // a side panel or a desktop window.
  let boxWidth = $state(0);
  let boxHeight = $state(0);
  // A phone's sheet is as tall as its grid and these controls.
  const CONTROLS_HEIGHT_ESTIMATE = 184;
  let controlsHeight = $state(0);
  const arrangement = $derived.by(() => {
    if (boxWidth > 0 && boxHeight > 0) {
      return resolveFuseBuilderArrangement(boxWidth, boxHeight);
    }
    return desktopModal ? "roomy" : "stacked";
  });
  // A phone-sized box gives the grid the height the larger controls would take.
  const phoneControls = $derived(
    arrangement !== "roomy" && (boxWidth < 400 || boxHeight < 300)
  );
  const controlSize = $derived(phoneControls ? "phone" : "sm");

  const started = $derived(builderState.currentPosition !== null);
  const choosingOrientation = $derived(started && activeSteps.length === 0);
  const choosingMotion = $derived(started && !atStepLimit);
  const motionLabels = $derived({
    direction: t("create_transform_direction"),
    turns: t("shape_engine_turns"),
    clockwise: t("fuse_travel_cw"),
    counterclockwise: t("fuse_travel_ccw"),
  });
  const orientationLabels = $derived({
    [Orientation.IN]: t("create_ui_orientation_in_label"),
    [Orientation.OUT]: t("create_ui_orientation_out_label"),
    [Orientation.CLOCK]: t("create_ui_orientation_clock_label"),
    [Orientation.COUNTER]: t("create_ui_orientation_counter_label"),
  });
  const promptText = $derived.by(() => {
    if (!started) return t("fuse_builder_choose_start");
    return atStepLimit
      ? t("fuse_builder_check_seam")
      : t("fuse_builder_choose_direction");
  });
  const hintText = $derived.by(() => {
    if (!started) {
      return t(
        recipe.gridMode === GridMode.BOX
          ? "fuse_builder_grid_locked_box"
          : "fuse_builder_grid_locked_diamond"
      );
    }
    return atStepLimit
      ? t("fuse_builder_seam_hint")
      : t("fuse_builder_direction_hint");
  });

  let feedback = $state<string | null>(null);
  let submitting = $state(false);
  let wasOpen = false;
  let lastSubmission = "";

  function configureBuilder(): void {
    builderState.reset();
    if (builderState.gridMode !== recipe.gridMode) {
      builderState.setGridMode(recipe.gridMode);
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
    feedback = t("fuse_builder_past_limit", { count: targetLength });
    return true;
  }

  function stepSignature(): string {
    return activeSteps
      .map(
        (step) =>
          `${step.startLocation}:${step.endLocation}:${step.startOrientation}:${step.endOrientation}:${step.rotationDirection}:${step.turnCount}`
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
    feedback = t(
      resolvedSide === "left"
        ? "fuse_builder_using_left"
        : "fuse_builder_using_right"
    );
    await fuseState.setSource(resolvedSide, result.sequence, {
      kind: "custom",
      label: `${resolvedSide === "left" ? "Left" : "Right"} built path`,
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
      gridMode: recipe.gridMode,
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

{#snippet orientationPicker()}
  <BuilderOrientationPicker
    value={builderState.currentOrientation}
    {allowedOrientations}
    onchange={(orientation) => builderState.setOrientation(orientation)}
    size={controlSize}
    labels={orientationLabels}
    ariaLabel={t("fuse_builder_start_orientation")}
    fit
  />
{/snippet}

{#snippet motionSettings(stacked: boolean, showDirectionLabel: boolean)}
  <BuilderMotionSettings
    turnCount={builderState.turnCount}
    rotationDirection={builderState.rotationDirection}
    onchangeTurnCount={(turns) => builderState.setTurnCount(turns)}
    onchangeRotationDirection={(direction) =>
      builderState.setRotationDirection(direction)}
    {turnCounts}
    showTurns={recipe.generationLevel > 1}
    {stacked}
    {showDirectionLabel}
    size={controlSize}
    labels={motionLabels}
    fitTurns
  />
{/snippet}

{#snippet statusLine(text: string)}
  <i
    class="fas {submitting
      ? 'fa-spinner fa-spin'
      : feedback
        ? 'fa-circle-info'
        : 'fa-link'}"
    aria-hidden="true"
  ></i>
  <span>{text}</span>
{/snippet}

{#snippet undoButton()}
  <PanelButton
    size={phoneControls ? "compact" : "md"}
    disabled={!builderState.canUndo || submitting}
    onclick={() => builderState.undoStep()}
  >
    <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
    {t("fuse_builder_undo")}
  </PanelButton>
{/snippet}

{#snippet clearButton()}
  <PanelButton
    size={phoneControls ? "compact" : "md"}
    disabled={activeSteps.length === 0 || submitting}
    onclick={resetBuilder}
  >
    <i class="fas fa-trash-can" aria-hidden="true"></i>
    {t("fuse_builder_clear")}
  </PanelButton>
{/snippet}

{#snippet roomyControls()}
  <div class="instruction-card">
    <span class="step-kicker">
      {#if started}
        {t("fuse_builder_step", {
          number: Math.min(activeSteps.length + 1, targetLength),
        })}
      {:else}
        {t("fuse_builder_start")}
      {/if}
    </span>
    <h3>{promptText}</h3>
    <p>{hintText}</p>
  </div>

  {#if choosingOrientation}
    <div class="control-group" transition:growFade>
      <span class="control-label">{t("fuse_builder_start_orientation")}</span>
      {@render orientationPicker()}
    </div>
  {/if}

  {#if choosingMotion}
    <div class="control-group" transition:growFade>
      {@render motionSettings(true, true)}
    </div>
  {/if}

  <div
    class="completion-status boxed"
    class:error={feedback && !submitting}
    role={feedback && !submitting ? "alert" : "status"}
    aria-live="polite"
  >
    {@render statusLine(feedback ?? statusText)}
  </div>

  <div class="builder-actions">
    {@render undoButton()}
    {@render clearButton()}
    <PanelButton disabled={submitting} onclick={closeBuilder}>
      {t("fuse_action_cancel")}
    </PanelButton>
  </div>
{/snippet}

<!-- One line of what to do and one set of controls, in a box that keeps its
     height from the first tap to the last, so the grid never resizes. -->
{#snippet compactControls()}
  <div class="prompt-slot">
    <Crossfade
      key={choosingOrientation ? "orientation" : promptText}
      duration={DURATION.fast}
    >
      {#if choosingOrientation}
        <div class="control-group">
          <span class="control-label">
            {t("fuse_builder_start_orientation")}
          </span>
          {@render orientationPicker()}
        </div>
      {:else}
        <div class="prompt">
          <span class="step-kicker">
            {#if started}
              {activeSteps.length}
              {t("fuse_builder_of_steps", { count: targetLength })}
            {:else}
              {t("fuse_builder_start")}
            {/if}
          </span>
          <p>{promptText}</p>
        </div>
      {/if}
    </Crossfade>
  </div>

  <div class="motion-slot">
    <div
      class="motion-layer"
      class:away={!choosingMotion}
      inert={!choosingMotion}
    >
      {@render motionSettings(
        arrangement === "beside" || boxWidth < 600,
        !phoneControls && boxHeight >= 420
      )}
    </div>
    <div
      class="message-layer"
      role={feedback && !submitting ? "alert" : "status"}
      aria-live="polite"
    >
      {#if !choosingMotion}
        <div
          class="completion-status"
          class:error={feedback && !submitting}
          transition:flyFade={{ duration: DURATION.fast, y: 4 }}
        >
          {@render statusLine(
            feedback ?? (atStepLimit ? hintText : statusText)
          )}
        </div>
      {/if}
    </div>
  </div>

  {#if arrangement === "beside"}
    <div class="builder-actions">
      {@render undoButton()}
      {@render clearButton()}
    </div>
  {/if}
{/snippet}

{#snippet builderContent()}
  <GenerationSettingsOverlay
    title={t(
      resolvedSide === "left"
        ? "fuse_builder_title_left"
        : "fuse_builder_title_right"
    )}
    titleId="fuse-path-builder-title"
    closeLabel={t("fuse_builder_close")}
    onClose={closeBuilder}
  >
    {#snippet children()}
      <div
        class="path-builder"
        data-arrangement={arrangement}
        data-control-size={controlSize}
        style:--builder-source-color={sourceColor}
        aria-busy={submitting}
        bind:clientWidth={boxWidth}
        bind:clientHeight={boxHeight}
      >
        {#if arrangement === "roomy"}
          <div
            class="builder-summary"
            aria-label={t("fuse_builder_recipe_aria")}
          >
            <span class="source-badge"
              >{t(
                resolvedSide === "left"
                  ? "fuse_side_left_path"
                  : "fuse_side_right_path"
              )}</span
            >
            <span
              ><strong>{activeSteps.length}</strong>
              {t("fuse_builder_of_steps", { count: targetLength })}</span
            >
            <span
              >{t("fuse_level_number", { level: recipe.generationLevel })}</span
            >
            <span
              >{recipe.gridMode === GridMode.BOX
                ? t("fuse_builder_grid_box")
                : t("fuse_builder_grid_diamond")}</span
            >
            {#if recipe.generationLevel > 1}
              <span
                >{t("fuse_builder_max_turns", {
                  turns: recipe.maxTurnIntensity,
                })}</span
              >
            {/if}
          </div>
        {/if}

        <div class="builder-workspace">
          <div class="builder-stage">
            <InteractiveGrid
              {builderState}
              startAimEnabled={false}
              onStepCapExceeded={blockPastLimit}
            />
            {#if arrangement === "stacked"}
              <!-- Undo is off while the prop moves; the button stays in place. -->
              {#if started || builderState.canUndo}
                <div class="stage-action undo" transition:popIn>
                  {@render undoButton()}
                </div>
              {/if}
              {#if activeSteps.length > 0}
                <div class="stage-action clear" transition:popIn>
                  {@render clearButton()}
                </div>
              {/if}
            {/if}
          </div>

          <aside
            class="builder-controls"
            aria-label={t("fuse_builder_controls_aria")}
            bind:clientHeight={controlsHeight}
          >
            {#if arrangement === "roomy"}
              {@render roomyControls()}
            {:else}
              {@render compactControls()}
            {/if}
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
    ariaLabel={t("fuse_builder_drawer_aria")}
    surface="panel"
    fullHeightOnPhone
    fillShortScreen
    onClose={closeBuilder}
  >
    {#snippet children()}
      <div
        class="path-builder-drawer-content"
        style:--builder-controls-height="{controlsHeight ||
          CONTROLS_HEIGHT_ESTIMATE}px"
      >
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
    /* The close button sits on the edge, and its focus ring reaches past it. */
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .path-builder {
    --builder-label-inset: 0px;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--settings-spacing-md, 12px);
    min-width: 0;
    min-height: 0;
    container: path-builder / size;
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
    flex: 1;
    gap: var(--settings-spacing-lg, 16px);
    min-height: 0;
  }

  .builder-stage {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    container-name: tool-panel;
    container-type: size;
  }

  .builder-controls {
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 12px);
    min-width: 0;
    min-height: 0;
  }

  [data-arrangement="roomy"] .builder-workspace {
    grid-template-columns: minmax(0, 1.35fr) minmax(25rem, 0.65fr);
  }

  [data-arrangement="roomy"] .builder-stage {
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--builder-source-color) 38%, var(--theme-stroke));
    border-radius: var(--settings-radius-lg, 16px);
    background: var(--theme-card-bg);
  }

  [data-arrangement="roomy"] .builder-controls {
    overflow-y: auto;
    padding: clamp(12px, 1.2vw, 20px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 16px);
    background: var(--theme-card-bg);
  }

  /* A short window gives up the recipe line and the written hint before the
     controls would run out of height. */
  @container path-builder (max-height: 659px) {
    .builder-summary,
    .instruction-card p {
      display: none;
    }
  }

  [data-arrangement="stacked"] .builder-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 10px;
  }

  [data-arrangement="stacked"] .builder-controls {
    gap: 8px;
  }

  /* The grid takes the full height beside the controls, up to a little over
     half the width so a row of turns still fits next to it. */
  [data-arrangement="beside"] .builder-workspace {
    grid-template-columns: min(100cqb, 58cqi) minmax(0, 1fr);
  }

  [data-arrangement="beside"] .builder-actions {
    margin-top: auto;
  }

  /* The grid is the largest square at the top of its stage; its empty bottom
     corners hold the two actions. */
  .stage-action {
    --grid-side: min(100cqw, 100cqh);
    position: absolute;
    bottom: calc(100cqh - var(--grid-side) + 8px);
    z-index: 2;
  }

  .stage-action.undo {
    left: calc((100cqw - var(--grid-side)) / 2 + 8px);
  }

  .stage-action.clear {
    right: calc((100cqw - var(--grid-side)) / 2 + 8px);
  }

  .prompt-slot,
  .motion-slot {
    display: grid;
    flex: none;
    align-items: center;
    min-width: 0;
  }

  .prompt-slot {
    min-height: 72px;
  }

  [data-control-size="phone"] .prompt-slot {
    min-height: 62px;
  }

  .prompt p {
    margin: 2px 0 0;
    color: var(--theme-text);
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    line-height: 1.25;
    text-wrap: balance;
  }

  .step-kicker {
    font-variant-numeric: tabular-nums;
  }

  .prompt .step-kicker {
    display: block;
    line-height: 1.3;
  }

  /* Both layers share one cell: the controls keep their room while the message
     stands in for them, so the grid above holds its size. */
  .motion-slot {
    --builder-direction-width: 16rem;
    min-height: 64px;
  }

  /* Four lines, the longest message at this width, when there are no turns. */
  [data-control-size="phone"] .motion-slot {
    min-height: 80px;
  }

  .motion-layer,
  .message-layer {
    grid-area: 1 / 1;
    min-width: 0;
  }

  .message-layer {
    align-self: start;
  }

  .motion-layer {
    transition:
      opacity var(--transition-fast),
      visibility var(--transition-fast);
  }

  .motion-layer.away {
    visibility: hidden;
    opacity: 0;
  }

  .message-layer {
    pointer-events: none;
  }

  .instruction-card {
    padding-bottom: var(--settings-spacing-md, 12px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .step-kicker,
  .control-label {
    color: color-mix(in srgb, var(--builder-source-color) 52%, white);
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
    gap: 4px;
  }

  .control-label {
    line-height: 1.3;
  }

  .completion-status {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
  }

  .completion-status.boxed {
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
  }

  .completion-status i {
    margin-top: 3px;
    color: var(--semantic-success);
  }

  .completion-status.boxed.error {
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
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
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

  /* The sheet is as tall as its title, a full-width grid and the controls, and
     stops under the status bar; on a shorter phone the grid gives up the
     difference. 52px is the drawer's handle and padding. */
  @media (max-width: 480px) {
    .path-builder-drawer-content {
      height: min(
        calc(100vw + 30px + var(--builder-controls-height)),
        calc(
          100dvh - 52px - var(--safe-top, 0px) -
            env(safe-area-inset-bottom, 0px)
        )
      );
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

    [data-arrangement="roomy"] .builder-workspace {
      grid-template-columns: minmax(0, 1.45fr) minmax(32rem, 0.55fr);
      gap: 24px;
    }

    [data-arrangement="roomy"] .builder-controls {
      padding: 24px;
      gap: 18px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-layer {
      transition: none;
    }
  }
</style>

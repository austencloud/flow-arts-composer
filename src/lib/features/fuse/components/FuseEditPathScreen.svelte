<!--
  FuseEditPathScreen — one hand's path, on a screen of its own.

  The Fuse workspace is at its limit, so changing the path you are looking at
  happens here rather than in a popover over a busy card. Everything on this
  screen changes the path that is on screen; nothing here is a setting for new
  paths (those live beside Regenerate). The changes are Construct's sequence
  transforms, gated by Fuse so every result still closes as a LOOP.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
  import { loopStartPickTarget } from "#lib/features/create/shared/services/choose-start-analyzer.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { Crossfade, flyFade } from "#lib/shared/transitions/motion.js";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseSourceAdjustment } from "../state/fuse-state.svelte";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import {
    fuseEditColumnHoldsSections,
    resolveFuseEditArrangement,
    resolveFuseEditGrid,
    type FuseEditArrangement,
  } from "../services/fuse-workspace-split";
  import FuseLivePathGrid from "./FuseLivePathGrid.svelte";
  import FuseSoloLoopPicker from "./FuseSoloLoopPicker.svelte";
  import FuseVtgPathPicker from "./FuseVtgPathPicker.svelte";

  let {
    side,
    onClose,
    onBuildPath,
  }: {
    side: FuseSide;
    onClose: () => void;
    /** Opens the step-by-step builder for this hand. */
    onBuildPath: (side: FuseSide) => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  const source = $derived(side === "left" ? fuseState.left : fuseState.right);
  const sequence = $derived(source.sequence);
  const stepCount = $derived(sequence?.steps.length ?? 0);
  const isTransforming = $derived(fuseState.pendingSide === side);
  const busy = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const sideError = $derived(
    fuseState.error?.side === side ? fuseState.error.message : null
  );

  // A follower is rebuilt from the leading hand, so it has nothing to edit.
  // If the pair turns Linked with this hand following, the screen has no job.
  $effect(() => {
    if (fuseState.mode === "symmetry" && fuseState.previewDriverSide !== side) {
      onClose();
    }
  });

  // --- Choose start: tap the pose the LOOP should begin from. ---
  let picking = $state(false);

  async function chooseStartPose(stepIndex: number): Promise<void> {
    if (!picking) return;
    const step = loopStartPickTarget(stepCount, stepIndex + 1);
    picking = false;
    if (step !== null) {
      await fuseState.adjustSource(side, { kind: "first-step", step });
    }
  }

  function cancelPicking(): void {
    picking = false;
    void tick().then(() => doneButton?.querySelector("button")?.focus());
  }

  function apply(adjustment: FuseSourceAdjustment): void {
    picking = false;
    void fuseState.adjustSource(side, adjustment);
  }

  // --- The hand's path, fitted to its stage. ---
  let gridBox = $state<HTMLDivElement | null>(null);
  let gridW = $state(0);
  let gridH = $state(0);
  const gridFit = $derived(resolveFuseEditGrid(gridW, gridH, stepCount));

  $effect(() => {
    const el = gridBox;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box) return;
      gridW = Math.round(box.width);
      gridH = Math.round(box.height);
    });
    // The first observation arrives on observe(), measured inside the
    // padding, which is the grid's gutter.
    observer.observe(el);
    return () => observer.disconnect();
  });

  // --- The change tiles fit the column they are given. ---
  let changeBox = $state<HTMLDivElement | null>(null);
  let changeW = $state(0);
  let changeH = $state(0);
  let screenEl = $state<HTMLDivElement | null>(null);
  let arrangement = $state<FuseEditArrangement>("beside");
  // Two headed sections where the column is tall enough, otherwise all eight
  // tiles as one grid, which leaves no row part empty.
  const sections = $derived(
    arrangement === "beside" &&
      (changeH === 0 || fuseEditColumnHoldsSections(changeW, changeH))
  );
  const changeFitBox = $derived(
    sections && changeW > 0 && changeH > 0
      ? { width: changeW, height: changeH }
      : null
  );

  $effect(() => {
    const el = changeBox;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box) return;
      changeW = Math.round(box.width);
      changeH = Math.round(box.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  $effect(() => {
    const el = screenEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      arrangement = resolveFuseEditArrangement(el.clientWidth, el.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // --- Replace it: a different path for this hand altogether. ---
  let pickerOpen = $state(false);
  let vtgOpen = $state(false);

  async function openSavedLoops(): Promise<void> {
    await ensureGuestIdentity();
    pickerOpen = true;
  }

  async function handleLibrarySelect(selected: SequenceData): Promise<void> {
    await fuseState.setSource(side, selected, {
      kind: "library",
      id: selected.id,
      word: selected.word,
      name: selected.name,
    });
  }

  async function handleVtgSelect(
    selected: SequenceData,
    shapeLabel: string
  ): Promise<void> {
    await fuseState.setSource(side, selected, {
      kind: "vtg",
      label: shapeLabel,
    });
  }

  let doneButton = $state<HTMLElement | null>(null);

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || pickerOpen || vtgOpen) return;
    if (picking) {
      cancelPicking();
      return;
    }
    onClose();
  }

  onMount(() => {
    // Focus lands on Done, the way back, so Escape and Enter both work at once.
    void tick().then(() => doneButton?.querySelector("button")?.focus());
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="edit-screen {side} {arrangement}"
  bind:this={screenEl}
  role="region"
  aria-labelledby="fuse-edit-path-title"
  transition:flyFade={{ y: 14, duration: DURATION.normal }}
>
  <!-- While choosing the start, this bar holds the prompt and Cancel, so the
       path below keeps its size and nothing moves under the tap. -->
  <header class="edit-head" class:picking>
    <span class="hand-dot" aria-hidden="true"></span>
    <h2 id="fuse-edit-path-title" class:visually-hidden={picking}>
      {t(side === "left" ? "fuse_edit_title_left" : "fuse_edit_title_right")}
    </h2>
    <p class="pick-prompt" role="status" aria-live="polite">
      {#if picking}
        <strong>{t("fuse_edit_choose_start")}</strong>
        {t("fuse_edit_choose_start_hint")}
      {/if}
    </p>
    {#if picking}
      <div class="edit-done">
        <PanelButton variant="secondary" onclick={cancelPicking}>
          {t("fuse_action_cancel")}
        </PanelButton>
      </div>
    {:else}
      <span class="step-count">{t("fuse_steps_count", { count: stepCount })}</span>
      <div class="edit-done" bind:this={doneButton}>
        <PanelButton variant="primary" onclick={onClose}
          >{t("fuse_action_done")}</PanelButton
        >
      </div>
    {/if}
  </header>

  <div class="edit-body">
    <section class="path-stage" aria-label={t(
        side === "left" ? "fuse_side_left_path" : "fuse_side_right_path"
      )}
    >
      {#if sideError}
        <p class="stage-banner error" role="alert">{sideError}</p>
      {:else}
        <p class="stage-banner hint">
          {t("fuse_edit_hint")}
        </p>
      {/if}
      <div class="grid-box" bind:this={gridBox}>
        {#if sequence && gridW > 0}
          <!-- A transform travels inside the grid. Only a path of another
               length is a different grid, so it crosses over. -->
          <Crossfade key={stepCount} duration={DURATION.normal} fill>
            <FuseLivePathGrid
              {sequence}
              {side}
              columns={gridFit.stepColumns}
              cellSize={Math.max(1, Math.floor(gridFit.cellSize))}
              includeStart={true}
              showMandala={true}
              contextPlacement={gridFit.contextPlacement}
              animateEdits={true}
              leftPropType={settings.leftPropType}
              rightPropType={settings.rightPropType}
              onStepClick={picking
                ? (stepIndex) => void chooseStartPose(stepIndex)
                : undefined}
              posePicker={picking}
            />
          </Crossfade>
        {:else}
          <div class="grid-skeleton" aria-hidden="true"></div>
        {/if}
      </div>
    </section>

    <section class="change-panel" aria-label={t("fuse_edit_change_title")}>
      <span class="panel-label change-label">{t("fuse_edit_change_title")}</span>
      <div class="change-box" bind:this={changeBox}>
        <SequenceTransformActions
          fitBox={changeFitBox}
          hasSequence={sequence !== null && !busy}
          hasSelection={false}
          {isTransforming}
          canShiftStart={stepCount > 1}
          showEditInConstructor={false}
          isDesktopPanel={sections}
          singleSection={!sections}
          mobileColumns={arrangement === "stacked" ? 8 : 4}
          rotationDegrees={45}
          actionSubject={t(
            side === "left"
              ? "fuse_edit_subject_left"
              : "fuse_edit_subject_right"
          )}
          secondarySectionLabel={t("fuse_edit_order")}
          resetPlacement="transform"
          onRotateCCW={() => apply({ kind: "rotate", rotationSteps: -1 })}
          onRotateCW={() => apply({ kind: "rotate", rotationSteps: 1 })}
          onMirror={() => apply({ kind: "mirror" })}
          onFlip={() => apply({ kind: "flip" })}
          onInvert={() => apply({ kind: "invert" })}
          onReset={() => apply({ kind: "reset" })}
          onRewind={() => apply({ kind: "rewind" })}
          onShiftStart={() => (picking = !picking)}
        />
      </div>
    </section>

    <section class="replace-panel" aria-label={t("fuse_edit_replace_aria")}>
      <span class="panel-label">{t("fuse_edit_replace_title")}</span>
      <div class="replace-actions">
        <PanelButton
          variant="secondary"
          disabled={busy}
          onclick={() => void openSavedLoops()}
        >
          <i class="fas fa-book" aria-hidden="true"></i>
          {t("fuse_picker_saved_loop")}
        </PanelButton>
        <PanelButton
          variant="secondary"
          disabled={busy}
          onclick={() => (vtgOpen = true)}
        >
          <i class="fas fa-fan" aria-hidden="true"></i>
          {t("fuse_edit_a_shape")}
        </PanelButton>
        <PanelButton
          variant="secondary"
          disabled={busy}
          onclick={() => onBuildPath(side)}
        >
          <i class="fas fa-route" aria-hidden="true"></i>
          {t("fuse_edit_build_it")}
        </PanelButton>
      </div>
    </section>
  </div>
</div>

{#if pickerOpen}
  <FuseSoloLoopPicker
    open
    {side}
    length={source.recipe.requestedLength}
    onSelect={handleLibrarySelect}
    onClose={() => (pickerOpen = false)}
  />
{/if}

{#if vtgOpen}
  <FuseVtgPathPicker
    {side}
    onSelect={handleVtgSelect}
    onClose={() => (vtgOpen = false)}
  />
{/if}

<style>
  .edit-screen {
    --source-color: var(--prop-blue, #2196f3);
    position: absolute;
    z-index: 20;
    inset: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--settings-spacing-sm, 10px);
    padding: var(--settings-spacing-sm, 10px);
    overflow: hidden;
    /* Opaque: the workspace stays mounted underneath and must not show
       through. The themed panel colour over a theme-derived floor. */
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 6%, black);
  }

  .edit-screen.right {
    --source-color: var(--prop-red, #f44336);
  }

  .edit-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--min-touch-target, 48px);
    padding: 6px 8px 6px 14px;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 40%, var(--theme-stroke));
    border-radius: var(--settings-radius-lg, 20px);
    background: color-mix(
      in srgb,
      var(--source-color) 10%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.045))
    );
  }

  .edit-head.picking {
    border-color: color-mix(
      in srgb,
      var(--source-color) 70%,
      var(--theme-stroke)
    );
    background: color-mix(
      in srgb,
      var(--source-color) 18%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.045))
    );
  }

  .pick-prompt {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.25;
  }

  .pick-prompt strong {
    color: color-mix(in srgb, var(--source-color) 70%, white);
  }

  /* The prompt stays in the tree as a live region, so the screen reader hears
     it the moment picking starts; it just takes no room until then. */
  .edit-head:not(.picking) .pick-prompt,
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .hand-dot {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--source-color);
  }

  .edit-head h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-count {
    flex: 0 0 auto;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .edit-done {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .edit-done :global(.panel-btn) {
    min-width: 96px;
    min-height: var(--min-touch-target, 44px);
    border-color: color-mix(in srgb, var(--source-color) 78%, transparent);
    background: color-mix(
      in srgb,
      var(--source-color) 34%,
      var(--theme-card-bg, #161821)
    );
    color: var(--theme-text, #fff);
    font-weight: 700;
  }

  /* Phone first: the path is the hero, with the change tiles and one row of
     replace buttons under it. */
  .edit-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "stage"
      "change"
      "replace";
    gap: var(--settings-spacing-sm, 10px);
    min-height: 0;
  }

  .path-stage,
  .change-panel,
  .replace-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .path-stage {
    grid-area: stage;
    border-color: color-mix(
      in srgb,
      var(--source-color) 32%,
      var(--theme-stroke)
    );
  }

  .change-panel {
    grid-area: change;
  }

  .replace-panel {
    grid-area: replace;
  }

  .panel-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.02em;
  }

  .stage-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .stage-banner.error {
    color: var(--semantic-error, #f87171);
  }

  .grid-box {
    position: relative;
    display: grid;
    place-items: center;
    flex: 1 1 0;
    min-height: 0;
    padding: 6px;
    overflow: hidden;
  }

  .grid-skeleton {
    width: 100%;
    height: 100%;
    border-radius: var(--settings-radius-md, 14px);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  }

  /* The phone has no room for the hint or a heading over the tiles' own
     section labels. Choose start and errors still take the banner. */
  .stage-banner.hint,
  .change-label {
    display: none;
  }

  .change-box {
    min-height: 0;
  }

  .replace-actions {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .replace-actions :global(.panel-btn) {
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 40px;
    padding: 4px 6px;
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .edit-screen.phone .change-panel {
    padding: 6px;
  }

  /* A short phone: the path is the hero, so the controls come down to the
     phone's own tap size. */
  @container fuse (max-height: 560px) {
    .edit-screen.phone {
      gap: 6px;
      padding: 8px;
    }

    .edit-screen.phone .edit-body {
      gap: 6px;
    }

    .edit-screen.phone .edit-head {
      padding-block: 3px;
    }

    .edit-screen.phone :is(.path-stage, .replace-panel) {
      padding: 6px;
    }

    .edit-screen.phone .replace-panel .panel-label {
      display: none;
    }

    .edit-screen.phone .replace-actions :global(.panel-btn) {
      min-height: 36px;
    }

    .edit-screen.phone .change-box :global(.grid-btn) {
      min-height: 36px;
      padding-block: 3px;
    }

    .edit-screen.phone .change-box :global(.btn-icon) {
      width: 24px;
      height: 24px;
      font-size: var(--font-size-compact, 12px);
    }
  }

  /* A tall phone has the height: the path is as wide as the screen already, so
     the hint, the heading and the tiles take the rest. */
  @container fuse (min-height: 720px) {
    .edit-screen.phone .stage-banner.hint {
      display: flex;
    }

    .edit-screen.phone .change-label {
      display: inline;
    }

    .edit-screen.phone .change-panel {
      padding: 10px;
    }

    .edit-screen.phone .change-box :global(.grid-btn) {
      min-height: 80px;
    }

    .edit-screen.phone .replace-actions :global(.panel-btn) {
      min-height: 48px;
    }
  }

  /* A tablet held upright, an open Fold: the same stack, with room for the
     hint, the heading and one row of tiles. */
  .edit-screen:is(.stacked, .beside) {
    gap: var(--settings-spacing-md, 14px);
    padding: var(--settings-spacing-md, 14px);
  }

  .edit-screen:is(.stacked, .beside) .edit-body {
    gap: var(--settings-spacing-md, 14px);
  }

  .edit-screen:is(.stacked, .beside) .stage-banner.hint {
    display: flex;
  }

  .edit-screen:is(.stacked, .beside) .change-label {
    display: inline;
  }

  .edit-screen.stacked .replace-actions :global(.panel-btn) {
    min-height: var(--min-touch-target, 44px);
    font-size: var(--font-size-sm, 14px);
  }

  /* Wider than tall: the path fills the left; the change tiles and the replace
     buttons stack in a column on the right. */
  .edit-screen.beside .edit-body {
    grid-template-columns: minmax(0, 1fr) clamp(322px, 32%, 460px);
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      "stage change"
      "stage replace";
  }

  /* The side column is narrow too, so each label sits under its icon. */
  .edit-screen.beside .replace-actions :global(.panel-btn) {
    flex-direction: column;
    gap: 4px;
    min-height: 56px;
  }

  .edit-screen.beside .change-box {
    flex: 1 1 0;
  }

  /* The panel already insets the tiles; their own inset would set them in from
     the heading above and the buttons below. */
  .edit-screen.beside .change-box :global(.actions-container.desktop) {
    padding-inline: 0;
  }

  /* A sideways phone: the tiles and buttons say what they do, and they need
     the headings' height. */
  @container fuse (max-height: 480px) {
    .edit-screen.beside {
      gap: 8px;
      padding: 8px;
    }

    .edit-screen.beside .edit-body {
      gap: 8px;
    }

    .edit-screen.beside .panel-label,
    .edit-screen.beside .stage-banner.hint {
      display: none;
    }

    .edit-screen.beside .replace-actions :global(.panel-btn) {
      gap: 2px;
      min-height: 44px;
    }
  }
</style>

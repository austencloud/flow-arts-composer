<!--
  ArrangementCellCanvas.svelte

  A single cell in the composition grid.
  Renders based on display mode:
  - animation: AnimatorCanvas with tunnel layers
  - choreo-card: ChoreoCard with beat highlighting
  Can be selected to edit its contents.
-->
<script lang="ts">
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { onMount, onDestroy, untrack } from "svelte";
  import type { ArrangementCell } from "../domain/arrangement.js";
  import { migrateArrangementCell } from "../domain/arrangement-migration.js";
  import { arrangementCellLook } from "../domain/arrangement-look.js";
  import {
    arrangementCellGridJoin,
    arrangementCellSequence,
  } from "../domain/arrangement-grid-join.js";
  import { animationGridJoinKey } from "#lib/shared/animation-engine/services/animation-grid-join.js";
  import type { PostAnimationAppearance } from "../domain/post-animation-appearance.js";
  import {
    postAnimationEffectsConfig,
    postAnimationTrailSettings,
  } from "../domain/post-animation-effects.svelte";
  import { arrangementLayerStep } from "../domain/arrangement-timing.js";
  import { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
  import { getViewerAnimationPropConfig } from "#lib/shared/animation-engine/get-viewer-animation-prop-config.js";
  import { AnimationStateManager } from "#lib/shared/animation-engine/services/animation-state-manager.js";
  import { createAnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import {
    AnimationVisibilityStateManager,
    getAnimationVisibilityManager,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { AdditionalLayerProps } from "#lib/shared/animation-engine/services/trail-capturer.js";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";

  let {
    cell,
    cellIndex,
    currentStep,
    isPlaying,
    animationPlaying = false,
    virtualTimeMs = undefined,
    skipStartPlacement = true,
    gridAppearance = undefined,
    isSelected = false,
    isDragging = false,
    onSelect,
  }: {
    cell: ArrangementCell;
    cellIndex: number;
    currentStep: number;
    isPlaying: boolean;
    /** Drives effects only while a source is playing; export uses the frame clock. */
    animationPlaying?: boolean;
    virtualTimeMs?: number;
    /** When true, step 0 (start position) is skipped and beats map to steps 1..N */
    skipStartPlacement?: boolean;
    /** The grid's default look, under the cell's own. */
    gridAppearance?: PostAnimationAppearance;
    isSelected?: boolean;
    /** When true, click is suppressed (drag just ended) */
    isDragging?: boolean;
    onSelect: () => void;
  } = $props();

  // Per-cell animation orchestrators (NOT shared singletons)
  // These must be $state so that derived values (additionalLayerProps) and
  // effects (sync step positions) re-evaluate after onMount populates them.
  let primaryOrchestrator = $state<SequenceAnimationOrchestrator | null>(null);
  let additionalOrchestrators = $state<SequenceAnimationOrchestrator[]>([]);

  // Animation states for primary and additional layers
  const primaryAnimationState = createAnimationPanelState();
  let additionalAnimationStates = $state<
    ReturnType<typeof createAnimationPanelState>[]
  >([]);

  // Local state
  let initialized = $state(false);
  let canvasReady = $state(false);
  let mounted = $state(false);
  // User-visible init failure (orchestrator construction or sequence load).
  // When set, the cell shows an error overlay with a retry button instead of
  // silently rendering blank.
  let initError = $state<string | null>(null);
  // Bumped by the retry button so the init $effects re-run after a failure.
  let initAttempt = $state(0);

  // Derived: Get layer data
  const primaryLayer = $derived(cell.layers[0] || null);
  // Additional layers (1-3): all layers beyond primary
  const extraLayers = $derived(cell.layers.slice(1));
  const hasLayers = $derived(cell.layers.length > 0);
  const isAnimationType = $derived(cell.mediaType === "animation");
  // The join the cell draws: its own, else its first sequence's. The engine
  // reads it off the sequence handed to the canvas and puts every layer on
  // the same pair, so the orchestrators keep the stored sequences and only
  // the canvas and the card get the resolved one.
  const cellJoin = $derived(arrangementCellGridJoin(cell));
  const cellSequence = $derived(arrangementCellSequence(cell));
  // The look this cell draws with: the grid's default under the cell's own
  // flags. The nested Arrange editor still writes the v1 fields on its working
  // copy, so they are folded in the way the migration folds them; phase 5
  // removes that editor and this fold with it.
  const look = $derived(
    arrangementCellLook(gridAppearance, migrateArrangementCell(cell))
  );
  // One effects state, visibility manager and trail look per cell, as the
  // Studio animation layer keeps per item, so a cell's effect never leaks
  // into its neighbours or the viewer's own settings.
  const inheritedEffects = getEffectsConfigContext();
  const fallbackEffects =
    inheritedEffects?.snapshot() ?? DEFAULT_EFFECTS_CONFIG;
  const cellEffects = createEffectsConfigState(fallbackEffects, {
    persist: false,
  });
  const cellVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  let cellTrailSettings = $state(animationSettings.snapshot().trail);
  $effect(() => {
    const current = look;
    untrack(() => {
      cellVisibility.updateSettings({
        ...getAnimationVisibilityManager().getSettings(),
        wordHeader: false,
        darkMode: true,
        ...(current ?? {}),
      });
      const config = postAnimationEffectsConfig(current, fallbackEffects);
      cellTrailSettings = postAnimationTrailSettings(
        animationSettings.snapshot().trail,
        config,
        current?.trail
      );
      cellEffects.replace(config);
    });
  });
  // The engine takes a cell map in place of the config's own, so the cell's
  // per-hand and per-tip picks are laid over the look's cell-wide effect.
  const cellTipEffects = $derived.by((): TipEffectMap | undefined => {
    const own = cell.tipEffectMap;
    if (!own || Object.keys(own).length === 0) return undefined;
    return { ...cellEffects.tipEffectMap, ...own };
  });
  const motionVisibility = $derived({
    left: cell.leftMotionVisible ?? true,
    right: cell.rightMotionVisible ?? true,
  });
  /** The props each layer's engine places: the look's prop, else the viewer's pair. */
  function cellPropConfig() {
    const propType = look?.propType;
    return propType
      ? { leftPropType: propType, rightPropType: propType }
      : getViewerAnimationPropConfig();
  }

  // Media type display info
  const mediaTypeInfo = $derived.by(() => {
    switch (cell.mediaType) {
      case "video":
        return { icon: "fa-video", label: "Video preview unavailable" };
      case "image":
        return { icon: "fa-image", label: "Image preview unavailable" };
      case "choreo-card":
        return { icon: "fa-id-card", label: "Card" };
      default:
        return null;
    }
  });

  // Each layer's orchestrator step at this grid beat: the cell's offset
  // delays it, its speed scales it, and a layer's own offset shifts it. The
  // orchestrator is 1-based (step 1 = steps[0]); see arrangementLayerStep.
  const primaryCurrentStep = $derived(
    primaryLayer
      ? arrangementLayerStep(currentStep, cell, primaryLayer, skipStartPlacement)
      : 0
  );

  const additionalCurrentSteps = $derived(
    extraLayers.map((layer) =>
      arrangementLayerStep(currentStep, cell, layer, skipStartPlacement)
    )
  );

  // Get current step data. The orchestrator step is 1-based (step=1 uses steps[0]),
  // so subtract 1 before indexing into the array.
  const primaryStepData = $derived.by(() => {
    if (!primaryLayer?.sequence.steps) return null;
    const stepIndex = Math.floor(
      Math.max(
        0,
        Math.min(primaryCurrentStep - 1, primaryLayer.sequence.steps.length - 1)
      )
    );
    return primaryLayer.sequence.steps[stepIndex] || null;
  });

  // Build additionalLayers prop array from additional orchestrator states
  const additionalLayerProps = $derived.by((): AdditionalLayerProps[] => {
    return extraLayers.map((_layer, i) => {
      const animState = additionalAnimationStates[i];
      return {
        leftProp: animState?.leftPropState ?? null,
        rightProp: animState?.rightPropState ?? null,
      };
    });
  });

  function disposeOrchestrators() {
    primaryOrchestrator?.dispose();
    for (const orch of additionalOrchestrators) orch.dispose();
    for (const state of additionalAnimationStates) state.dispose();
    primaryOrchestrator = null;
    additionalOrchestrators = [];
    additionalAnimationStates = [];
  }

  // Empty and card cells need no preview engine. A four-layer cell gets four;
  // changing its layer count rebuilds only that cell's preview.
  function initializeOrchestrators(layerCount: number) {
    try {
      initialized = false;
      disposeOrchestrators();

      if (layerCount > 0) {
        // Each layer owns its prop state so one sequence cannot overwrite
        // another; each reads the cell's own look for its prop and effort.
        const primary = new SequenceAnimationOrchestrator(
          new AnimationStateManager(),
          cellPropConfig
        );
        primary.setVisibilityManager(cellVisibility);
        primaryOrchestrator = primary;

        const nextOrchestrators: SequenceAnimationOrchestrator[] = [];
        const nextStates: ReturnType<typeof createAnimationPanelState>[] = [];
        for (let i = 1; i < layerCount; i++) {
          const extra = new SequenceAnimationOrchestrator(
            new AnimationStateManager(),
            cellPropConfig
          );
          extra.setVisibilityManager(cellVisibility);
          nextOrchestrators.push(extra);
          nextStates.push(createAnimationPanelState());
        }
        additionalOrchestrators = nextOrchestrators;
        additionalAnimationStates = nextStates;
      }

      initialized = true;
      initError = null;
    } catch (err) {
      disposeOrchestrators();
      console.error(`[CellCanvas ${cellIndex}] Failed to initialize:`, err);
      initError = "Preview engine failed to start";
    }
  }

  onMount(() => {
    mounted = true;
  });

  $effect(() => {
    if (!mounted) return;
    const layerCount = isAnimationType ? Math.min(4, cell.layers.length) : 0;
    untrack(() => initializeOrchestrators(layerCount));
  });

  onDestroy(() => {
    primaryAnimationState.dispose();
    disposeOrchestrators();
  });

  // Initialize primary orchestrator when layer changes
  $effect(() => {
    void initAttempt; // retry trigger
    if (initialized && primaryLayer && primaryOrchestrator) {
      try {
        primaryOrchestrator.initializeWithDomainData(primaryLayer.sequence);
        primaryAnimationState.setSequenceData(primaryLayer.sequence);
        primaryAnimationState.setTotalSteps(
          primaryLayer.sequence.steps?.length || 0
        );
      } catch (err) {
        console.error(`[CellCanvas ${cellIndex}] Primary init failed:`, err);
        initError = "Sequence failed to load";
      }
    } else {
      // Init skipped - waiting for dependencies
    }
  });

  // Initialize additional orchestrators when layers change
  // NOTE: Additional layer prop textures are loaded automatically by AnimationEngine
  // inside AnimatorCanvas when it receives non-empty additionalLayers.
  $effect(() => {
    void initAttempt; // retry trigger
    if (initialized) {
      for (let i = 0; i < extraLayers.length; i++) {
        const layer = extraLayers[i]!;
        const orch = additionalOrchestrators[i];
        const animState = additionalAnimationStates[i];
        if (orch && animState) {
          try {
            orch.initializeWithDomainData(layer.sequence);
            animState.setSequenceData(layer.sequence);
            animState.setTotalSteps(layer.sequence.steps?.length || 0);
          } catch (err) {
            console.error(
              `[CellCanvas ${cellIndex}] Layer ${i + 1} init failed:`,
              err
            );
            initError = `Layer ${i + 1} failed to load`;
          }
        } else {
          console.warn(
            `[CELL-DIAG ${cellIndex}] Layer ${i + 1}: MISSING orch=${!!orch} animState=${!!animState}`
          );
        }
      }
    }
  });

  // Sync step positions - calculate prop states and update animation state
  // IMPORTANT: Read `initialized` and the derived step value BEFORE the
  // conditional so Svelte 5 always tracks them as dependencies. Without
  // reading `initialized`, the effect may run before onMount creates the
  // orchestrator and never re-run when it becomes available.
  $effect(() => {
    const isReady = initialized;
    const step = primaryCurrentStep;
    if (isReady && primaryOrchestrator?.isInitialized() && primaryLayer) {
      primaryOrchestrator.calculateState(step);
      const states = primaryOrchestrator.getCurrentPropStates();
      primaryAnimationState.setPropStates(states.left, states.right);
    }
  });

  // Sync step positions for additional layers
  // IMPORTANT: Read `initialized` so this effect re-runs after onMount creates
  // orchestrators. Without it, the effect runs before onMount, finds no orchestrators,
  // skips, and never re-runs because additionalCurrentSteps doesn't change (still beat 0).
  $effect(() => {
    const isReady = initialized;
    const steps = additionalCurrentSteps;
    if (!isReady) return;
    for (let i = 0; i < extraLayers.length; i++) {
      const step = steps[i] ?? 0;
      const orch = additionalOrchestrators[i];
      const animState = additionalAnimationStates[i];
      if (orch?.isInitialized() && animState) {
        orch.calculateState(step);
        const states = orch.getCurrentPropStates();
        animState.setPropStates(states.left, states.right);
      }
    }
  });

  function handleClick() {
    if (isDragging) return;
    onSelect();
  }

  // Retry after an init failure. Stops propagation so the click doesn't
  // also select the cell.
  function handleRetry(e: Event) {
    e.stopPropagation();
    initError = null;
    if (!initialized)
      initializeOrchestrators(
        isAnimationType ? Math.min(4, cell.layers.length) : 0
      );
    initAttempt++;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }
</script>

<div
  class="cell-canvas"
  class:selected={isSelected}
  class:empty={!hasLayers && isAnimationType}
  class:other-media={!isAnimationType}
  data-arrangement-cell-ready={!isAnimationType || !hasLayers || canvasReady}
  data-arrangement-cell-error={initError ? "true" : undefined}
  data-grid-join={animationGridJoinKey(cellJoin)}
  role="button"
  tabindex="0"
  aria-label="Cell {cellIndex + 1}{isAnimationType
    ? hasLayers
      ? ` with ${cell.layers.length} layer${cell.layers.length > 1 ? 's' : ''}`
      : ', empty'
    : `, ${cell.mediaType}`}"
  aria-pressed={isSelected}
  onclick={handleClick}
  onkeydown={handleKeyDown}
>
  {#if isAnimationType}
    {#if hasLayers}
      <AnimatorCanvas
        leftProp={primaryAnimationState.leftPropState}
        rightProp={primaryAnimationState.rightPropState}
        additionalLayers={additionalLayerProps}
        gridVisible={look?.gridMode !== "none"}
        gridMode={primaryLayer?.sequence.gridMode ?? null}
        letter={primaryStepData?.letter || null}
        stepData={primaryStepData}
        currentStep={primaryCurrentStep}
        isPlaying={animationPlaying}
        virtualTime={virtualTimeMs}
        onInitialized={() => (canvasReady = true)}
        sequenceData={cellSequence}
        word={null}
        leftPropType={look?.propType ?? null}
        rightPropType={look?.propType ?? null}
        propLook={look?.propLook}
        previewDarkMode={look?.darkMode ?? true}
        mandalaStrokeWidthOverride={look?.mandalaThickness}
        trailSettings={cellTrailSettings}
        hideTkaGlyph={true}
        hideStepNumbers={true}
        visibilityManagerOverride={cellVisibility}
        effectsConfigState={cellEffects}
        tipEffectMap={cellTipEffects}
        tipEffortMap={cell.tipEffortMap}
        {motionVisibility}
      />
    {:else}
      <div class="empty-cell">
        <i class="fas fa-plus" aria-hidden="true"></i>
      </div>
    {/if}
  {:else if cell.mediaType === "choreo-card" && cellSequence}
    <!-- Choreo Card mode: Beat-synced sequence preview -->
    <div class="choreo-card-container">
      <ChoreoCard
        sequence={cellSequence}
        highlightedStepIndex={primaryCurrentStep}
        showHighlight={isPlaying}
        darkMode={true}
        showNotes={false}
        onContextMenu={() => {}}
      />
      <!-- onContextMenu no-op: without it ChoreoCard opens its own fallback
           menu AND the event bubbles to CompositionGrid's cell menu — two
           menus for one right-click. The cell menu owns this surface. -->
    </div>
  {:else}
    <!-- Non-animation media type placeholder (video, image, or empty choreo-card) -->
    <div class="media-placeholder">
      <i class="fas {mediaTypeInfo?.icon ?? 'fa-film'}" aria-hidden="true"></i>
      <span class="media-label">{mediaTypeInfo?.label ?? "Content"}</span>
    </div>
  {/if}

  <!-- Init failure overlay: visible error state instead of a silently blank cell -->
  {#if initError}
    <div class="cell-error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <span class="cell-error-message">{initError}</span>
      <button
        type="button"
        class="cell-error-retry"
        onclick={handleRetry}
        onkeydown={(e) => e.stopPropagation()}
      >
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        Retry
      </button>
    </div>
  {/if}

  <!-- Cell index badge -->
  <span class="cell-index">{cellIndex + 1}</span>

  <!-- Layer count badge (only for animation type) -->
  {#if isAnimationType && hasLayers}
    <span class="layer-count">{cell.layers.length}</span>
  {/if}

  <!-- Media type badge (for non-animation types) -->
  {#if mediaTypeInfo}
    <span class="media-type-badge">
      <i class="fas {mediaTypeInfo.icon}" aria-hidden="true"></i>
    </span>
  {/if}
</div>

<style>
  .cell-canvas {
    position: relative;
    /* Fill the cell-wrapper completely (may be non-square for spanning cells) */
    width: 100%;
    height: 100%;
    /* Dynamic aspect ratio based on span (set via CSS variables from parent) */
    aspect-ratio: var(--col-span, 1) / var(--row-span, 1);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md);
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    container-type: size;
    /* Flex to center the canvas content */
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell-canvas:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .cell-canvas:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .cell-canvas.selected {
    border-color: var(--theme-accent, #8b5cf6);
    box-shadow:
      0 0 0 3px
        color-mix(in srgb, var(--theme-accent, #8b5cf6) 45%, transparent),
      0 0 16px color-mix(in srgb, var(--theme-accent, #8b5cf6) 30%, transparent);
  }

  .cell-canvas.empty {
    border-style: dashed;
  }

  /* Force AnimatorCanvas to fit within the cell as a centered square */
  /* Hierarchy: cell-canvas > animation-container > content-wrapper > canvas-wrapper > canvas */
  /* For non-square cells (e.g. 2-col × 1-row), the canvas must be the largest
     centered square that fits, not stretch to the wider dimension and overflow. */

  .cell-canvas :global(.animation-container) {
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
  }

  .cell-canvas :global(.content-wrapper) {
    /* Fill the cell and center the canvas within */
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* Hide chrome that doesn't belong in grid cells (word header, progress bar) */
  .cell-canvas :global(.header-slot),
  .cell-canvas :global(.progress-slot) {
    display: none !important;
  }

  .cell-canvas :global(.canvas-wrapper) {
    /* Centered square: min(cell width, cell height)
       cqw → content-wrapper width (inline-size container) = cell width
       cqh → animation-container height (size container) = cell height */
    width: min(100cqw, 100cqh) !important;
    height: min(100cqw, 100cqh) !important;
    max-width: none !important;
    max-height: none !important;
    aspect-ratio: auto !important;
    flex-shrink: 0 !important;
  }

  .cell-canvas :global(canvas) {
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
  }

  .empty-cell {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .empty-cell i {
    font-size: clamp(16px, 20cqw, 32px);
    opacity: 0.5;
    transition: opacity 0.15s ease;
  }

  .cell-canvas:hover .empty-cell i {
    opacity: 0.8;
  }

  .cell-index {
    position: absolute;
    top: 4px;
    left: 4px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    background: rgba(0, 0, 0, 0.5);
    padding: 2px 6px;
    border-radius: var(--border-radius-sm);
    pointer-events: none;
  }

  .layer-count {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: var(--font-size-compact, 12px);
    color: white;
    background: var(--theme-accent, #8b5cf6);
    padding: 2px 6px;
    border-radius: var(--border-radius-sm);
    pointer-events: none;
  }

  /* Init failure overlay */
  .cell-error {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 4px);
    padding: var(--spacing-sm, 8px);
    text-align: center;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--semantic-error, #ef4444);
  }

  .cell-error i {
    font-size: clamp(14px, 12cqw, 24px);
  }

  .cell-error-message {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .cell-error-retry {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 32px;
    padding: 4px 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 12%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent);
    border-radius: var(--border-radius-sm, 6px);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cell-error-retry:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 22%,
      transparent
    );
  }

  .cell-error-retry:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Choreo Card container - allows sequence preview to fit within cell */
  .choreo-card-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    overflow: hidden;
  }

  /* Constrain ChoreoCard within the choreo card container */
  .choreo-card-container :global(.layered-preview) {
    max-width: 100%;
    max-height: 100%;
  }

  /* Media type placeholder for non-animation cells */
  .media-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .media-placeholder i {
    font-size: clamp(20px, 25cqw, 48px);
    opacity: 0.6;
  }

  .media-placeholder .media-label {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
  }

  .cell-canvas.other-media {
    border-style: dashed;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .cell-canvas.other-media:hover {
    border-color: var(--theme-accent, #8b5cf6);
  }

  .cell-canvas.other-media:hover .media-placeholder {
    color: var(--theme-accent, #8b5cf6);
  }

  .cell-canvas.other-media:hover .media-placeholder i,
  .cell-canvas.other-media:hover .media-placeholder .media-label {
    opacity: 1;
  }

  /* Media type badge */
  .media-type-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 10px;
    color: white;
    background: var(--theme-accent, #8b5cf6);
    padding: 4px 6px;
    border-radius: var(--border-radius-sm);
    pointer-events: none;
  }
</style>

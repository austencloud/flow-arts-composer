<!--
  CellCanvas.svelte

  A single cell in the composition grid.
  Renders based on display mode:
  - animation: AnimatorCanvas with tunnel layers
  - choreo-card: ChoreoCard with beat highlighting
  Can be selected to edit its contents.
-->
<script lang="ts">

  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { onMount, onDestroy } from "svelte";
  import type { GridCell } from "../../state/arrange-grid-state.svelte";
  import { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
  import { getViewerAnimationPropConfig } from "$lib/shared/animation-engine/get-viewer-animation-prop-config";
  import { AnimationStateManager } from "$lib/shared/animation-engine/services/animation-state-manager";
  import { createAnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import type { AdditionalLayerProps } from "$lib/shared/animation-engine/services/trail-capturer";
  import type { FireOverlayConfig } from "$lib/shared/animation-engine/domain/types/fire-types";
  import { DEFAULT_CHARCOAL_PARAMS } from "$lib/shared/animation-engine/domain/types/charcoal-spark-types";
  import type { LedOverlayConfig } from "$lib/shared/animation-engine/domain/types/led-types";

  let {
    cell,
    cellIndex,
    currentStep,
    isPlaying,
    skipStartPlacement = true,
    isSelected = false,
    isDragging = false,
    onSelect,
  }: {
    cell: GridCell;
    cellIndex: number;
    currentStep: number;
    isPlaying: boolean;
    /** When true, step 0 (start position) is skipped and beats map to steps 1..N */
    skipStartPlacement?: boolean;
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
  let additionalAnimationStates = $state<ReturnType<typeof createAnimationPanelState>[]>([]);

  // Local state
  let initialized = $state(false);
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

  // Media type display info
  const mediaTypeInfo = $derived.by(() => {
    switch (cell.mediaType) {
      case "video": return { icon: "fa-video", label: "Video" };
      case "image": return { icon: "fa-image", label: "Image" };
      case "choreo-card": return { icon: "fa-id-card", label: "Card" };
      default: return null;
    }
  });

  // Trail settings
  const trailSettings = $derived(animationSettings.trail);

  // Scan tipEffectMap for any assignments of a given effect type.
  // When the user assigns effects per-tip or per-hand via the matrix,
  // cell.effect stays empty but the renderers still need to be enabled.
  function tipMapHasEffect(effectType: string): boolean {
    const map = cell.tipEffectMap;
    if (!map) return false;
    return Object.values(map).some(v => v.effect === effectType);
  }

  // Per-cell effect overrides - translate cell.effect AND tipEffectMap into
  // fireConfig/ledConfig. The renderers must be enabled if ANY tip is assigned
  // the effect, whether via the flat cell.effect or the per-tip matrix.
  const cellFireConfig = $derived.by((): Partial<FireOverlayConfig> | undefined => {
    const effect = cell.effect;
    if (effect === 'fire' || tipMapHasEffect('fire')) return {};
    if (effect === 'charcoal' || tipMapHasEffect('charcoal')) return { charcoalParams: { ...DEFAULT_CHARCOAL_PARAMS } };
    if (effect && effect !== 'none') return undefined;
    if (cell.tipEffectMap && Object.keys(cell.tipEffectMap).length > 0) return undefined;
    return undefined; // No per-cell override - global setting applies
  });

  const cellLedConfig = $derived.by((): Partial<LedOverlayConfig> | undefined => {
    const effect = cell.effect;
    if (effect === 'led' || tipMapHasEffect('led')) return { enabled: true };
    if (effect && effect !== 'none') return { enabled: false };
    if (cell.tipEffectMap && Object.keys(cell.tipEffectMap).length > 0) return { enabled: false };
    return undefined; // No per-cell override - global setting applies
  });

  // Per-cell motion visibility overrides (undefined defaults to visible)
  const leftVisible = $derived(cell.leftMotionVisible ?? true);
  const rightVisible = $derived(cell.rightMotionVisible ?? true);
  // TODO: Pass blueVisible/redVisible to AnimatorCanvas once the animation
  // engine supports per-cell visibility overrides. Currently the global
  // AnimationVisibilityStateManager controls visibility for the entire app.
  // When per-cell support is added, these derived values should be passed as
  // props to AnimatorCanvas to control per-hand opacity independently.

  // Calculate effective beat for this cell (including cell-level offset and speed)
  const effectiveBeat = $derived.by(() => {
    const speed = cell.speedMultiplier ?? 1.0;
    return (currentStep + cell.beatOffset) * speed;
  });

  // Calculate current step for each layer.
  // The orchestrator uses 1-based steps: step=1 is beat 1 (steps[0]), step < 1 is start position.
  // steps.length = number of motion beats (start position is stored separately).
  //
  // skipStartPlacement=true (seamless loop):
  //   actualBeats = stepCount, wrapped ranges 0..stepCount-1, step = wrapped + 1
  //   So orchestrator sees steps 1..stepCount (all motion beats, no start position)
  //
  // skipStartPlacement=false (show start pose):
  //   actualBeats = stepCount + 1, wrapped ranges 0..stepCount
  //   step = wrapped (0 = start position, 1..stepCount = motion beats)
  const primaryCurrentStep = $derived.by(() => {
    if (!primaryLayer) return 0;
    const stepCount = primaryLayer.sequence.steps?.length || 1;
    const actualBeats = skipStartPlacement ? stepCount : stepCount + 1;
    const layerBeat = effectiveBeat + primaryLayer.beatOffset;
    const wrapped = layerBeat % actualBeats;
    return skipStartPlacement ? wrapped + 1 : wrapped;
  });

  // Current steps for each additional layer
  const additionalCurrentSteps = $derived.by(() => {
    return extraLayers.map((layer) => {
      const stepCount = layer.sequence.steps?.length || 1;
      const actualBeats = skipStartPlacement ? stepCount : stepCount + 1;
      const layerBeat = effectiveBeat + layer.beatOffset;
      const wrapped = layerBeat % actualBeats;
      return skipStartPlacement ? wrapped + 1 : wrapped;
    });
  });

  // Get current step data. The orchestrator step is 1-based (step=1 uses steps[0]),
  // so subtract 1 before indexing into the array.
  const primaryStepData = $derived.by(() => {
    if (!primaryLayer?.sequence.steps) return null;
    const stepIndex = Math.floor(
      Math.max(0, Math.min(primaryCurrentStep - 1, primaryLayer.sequence.steps.length - 1))
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

  // Create per-cell orchestrators. Extracted from onMount so the error
  // overlay's retry button can re-attempt after a failure.
  function initializeOrchestrators() {
    try {
      // Dispose any partial state left by a previous failed attempt
      primaryOrchestrator?.dispose();
      for (const orch of additionalOrchestrators) orch.dispose();
      for (const state of additionalAnimationStates) state.dispose();
      primaryOrchestrator = null;
      additionalOrchestrators = [];
      additionalAnimationStates = [];

      // Each orchestrator gets its own AnimationStateManager so they don't
      // overwrite each other's prop state through the shared singleton.
      primaryOrchestrator = new SequenceAnimationOrchestrator(
        new AnimationStateManager(),
        getViewerAnimationPropConfig
      );

      // Create orchestrators for up to 3 additional layers
      for (let i = 0; i < 3; i++) {
        additionalOrchestrators.push(
          new SequenceAnimationOrchestrator(
            new AnimationStateManager(),
            getViewerAnimationPropConfig
          )
        );
        additionalAnimationStates.push(createAnimationPanelState());
      }

      initialized = true;
      initError = null;
    } catch (err) {
      console.error(`[CellCanvas ${cellIndex}] Failed to initialize:`, err);
      initError = "Preview engine failed to start";
    }
  }

  // Initialize services - create per-cell orchestrators
  onMount(() => {
    initializeOrchestrators();
  });

  onDestroy(() => {
    primaryAnimationState.dispose();
    for (const state of additionalAnimationStates) state.dispose();
    primaryOrchestrator?.dispose();
    for (const orch of additionalOrchestrators) orch.dispose();
  });

  // Initialize primary orchestrator when layer changes
  $effect(() => {
    void initAttempt; // retry trigger
    if (initialized && primaryLayer && primaryOrchestrator) {
      try {
        primaryOrchestrator.initializeWithDomainData(primaryLayer.sequence);
        primaryAnimationState.setSequenceData(primaryLayer.sequence);
        primaryAnimationState.setTotalSteps(primaryLayer.sequence.steps?.length || 0);
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
            console.error(`[CellCanvas ${cellIndex}] Layer ${i + 1} init failed:`, err);
            initError = `Layer ${i + 1} failed to load`;
          }
        } else {
          console.warn(`[CELL-DIAG ${cellIndex}] Layer ${i + 1}: MISSING orch=${!!orch} animState=${!!animState}`);
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
    if (!initialized) initializeOrchestrators();
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
  role="button"
  tabindex="0"
  aria-label="Cell {cellIndex + 1}{isAnimationType ? (hasLayers ? ` with ${cell.layers.length} layer${cell.layers.length > 1 ? 's' : ''}` : ', empty') : `, ${cell.mediaType}`}"
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
        gridVisible={true}
        gridMode={primaryLayer?.sequence.gridMode ?? null}
        letter={primaryStepData?.letter || null}
        stepData={primaryStepData}
        currentStep={primaryCurrentStep}
        sequenceData={primaryLayer?.sequence || null}
        word={null}
        {trailSettings}
        hideTkaGlyph={true}
        hideStepNumbers={true}
        fireConfig={(cell.effect || cell.tipEffectMap) ? cellFireConfig : undefined}
        ledConfig={(cell.effect || cell.tipEffectMap) ? cellLedConfig : undefined}
        tipEffectMap={cell.tipEffectMap}
        tipEffortMap={cell.tipEffortMap}
      />
    {:else}
      <div class="empty-cell">
        <i class="fas fa-plus" aria-hidden="true"></i>
      </div>
    {/if}
  {:else if cell.mediaType === "choreo-card" && primaryLayer}
    <!-- Choreo Card mode: Beat-synced sequence preview -->
    <div class="choreo-card-container">
      <ChoreoCard
        sequence={primaryLayer.sequence}
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
      <span class="media-label">{mediaTypeInfo?.label ?? 'Content'}</span>
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
      0 0 0 3px color-mix(in srgb, var(--theme-accent, #8b5cf6) 45%, transparent),
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
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 35%, transparent);
    border-radius: var(--border-radius-sm, 6px);
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .cell-error-retry:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 22%, transparent);
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

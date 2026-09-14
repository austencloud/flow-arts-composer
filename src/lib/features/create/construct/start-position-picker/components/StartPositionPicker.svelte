<!--
StartPositionPicker.svelte - Simplified version with advanced variations
Shows 3 start positions (Alpha, Beta, Gamma) with toggle to view all 16 variations
Controls moved below the grid for better UX
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onDestroy, onMount, type Snippet } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    createSimplifiedStartPositionState,
    type SimplifiedStartPositionState,
  } from "$lib/shared/create/state/start-position-state.svelte";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import AdvancedStartPositionPicker from "./AdvancedStartPositionPicker.svelte";
  import BuildStartPosition from "./BuildStartPosition.svelte";
  import GridModeToggle from "../../shared/components/GridModeToggle.svelte";
  import OrientationCycler from "./OrientationCycler.svelte";
  import PictographGrid from "./PictographGrid.svelte";
  import {
    logConstructStartPositionCancelled,
    logConstructStartPositionPath,
    type StartPositionPath,
  } from "../../services/construct-analytics";

  // The caller can replace this picker's heading with an inline guide offer.
  // Preview and tutorial embeds keep their existing heading ownership.

  // Local storage key for persisting picker preferences
  const STORAGE_KEY = "tka-start-position-picker-prefs";
  const START_POSITION_PATHS = [
    { value: "presets" as const, label: "Presets" },
    { value: "build" as const, label: "Build" },
  ];

  // Props - receive navigation callbacks and layout detection
  const {
    startPositionState,
    onNavigateToAdvanced,
    onNavigateToDefault,
    isSideBySideLayout = () => false,
    embedded = false,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    initialStartPosition = null,
    lockedGridMode = undefined,
    validationMessage = null,
    onPositionSubmitted = () => {},
    heading,
    suppressHeading = false,
  } = $props<{
    startPositionState?: SimplifiedStartPositionState | null;
    onNavigateToAdvanced?: () => void;
    onNavigateToDefault?: () => void;
    isSideBySideLayout?: () => boolean;
    // When rendered inside another surface (e.g. the create tutorial), that
    // surface owns the heading and the "show me how" entry point. Suppress the
    // picker's own hint + guide link so they don't duplicate — and so the guide
    // link can't replay the very tutorial it sits inside.
    embedded?: boolean;
    /** Explicit prop types for demo/preview rendering (bypasses global
     *  settings) — same convention as StepCell/PictographContainer. */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    initialStartPosition?: PictographData | null;
    lockedGridMode?: GridMode;
    validationMessage?: string | null;
    onPositionSubmitted?: (
      position: PictographData,
      path: StartPositionPath
    ) => void;
    heading?: Snippet;
    /** The active Construct guide owns this instruction band. Keep the wrapper
     *  mounted so its height can collapse on the same clock as the guide. */
    suppressHeading?: boolean;
  }>();

  // Create simplified state - use $derived to handle prop changes
  const pickerState = $derived(
    startPositionState ?? createSimplifiedStartPositionState()
  );

  // State for showing advanced picker
  let showAdvancedPicker = $state(false);
  let pickerPath = $state<StartPositionPath>("presets");
  let buildPathOpened = false;
  let buildPositionSubmitted = false;

  const effectiveLeftPropType = $derived(
    leftPropTypeOverride ??
      settingsService.settings.leftPropType ??
      PropType.STAFF
  );
  const effectiveRightPropType = $derived(
    rightPropTypeOverride ??
      settingsService.settings.rightPropType ??
      PropType.STAFF
  );
  const initialLeftLocation = $derived(
    initialStartPosition?.motions.left?.startLocation ?? null
  );
  const initialRightLocation = $derived(
    initialStartPosition?.motions.right?.startLocation ?? null
  );

  // Services
  let hapticService: HapticFeedback;

  onMount(() => {
    hapticService = getHapticFeedback();
    loadPersistedPreferences();

    if (
      lockedGridMode !== undefined &&
      pickerState.currentGridMode !== lockedGridMode
    ) {
      void pickerState.loadPositions(lockedGridMode);
    }

    const initialLeftOrientation =
      initialStartPosition?.motions.left?.startOrientation;
    const initialRightOrientation =
      initialStartPosition?.motions.right?.startOrientation;
    if (initialLeftOrientation) {
      void pickerState.setLeftOrientation(initialLeftOrientation);
    }
    if (initialRightOrientation) {
      void pickerState.setRightOrientation(initialRightOrientation);
    }

    // Always ensure positions are loaded - loadPersistedPreferences may
    // skip loadPositions if there are no stored prefs or no gridMode pref.
    if (pickerState.positions.length === 0 && !showAdvancedPicker) {
      void pickerState.loadPositions();
    }

    if (pickerPath === "build") {
      buildPathOpened = true;
    }
  });

  onDestroy(() => {
    if (pickerPath === "build" && buildPathOpened && !buildPositionSubmitted) {
      logConstructStartPositionCancelled("build");
    }
  });

  /**
   * Load persisted picker preferences from localStorage
   */
  function loadPersistedPreferences() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const prefs = JSON.parse(stored) as {
        showAdvanced?: boolean;
        pickerPath?: StartPositionPath;
        gridMode?: string;
        orientation?: string; // legacy single orientation
        leftOrientation?: string;
        rightOrientation?: string;
        blueOrientation?: string;
        redOrientation?: string;
      };

      // Restore advanced/simple view preference
      if (typeof prefs.showAdvanced === "boolean") {
        showAdvancedPicker = prefs.showAdvanced;
        if (showAdvancedPicker) {
          onNavigateToAdvanced?.();
        }
      }

      if (prefs.pickerPath === "presets" || prefs.pickerPath === "build") {
        pickerPath = prefs.pickerPath;
      }

      // Restore per-hand orientation preferences (with legacy fallback)
      const validOrientations = [
        Orientation.IN,
        Orientation.CLOCK,
        Orientation.OUT,
        Orientation.COUNTER,
      ] as string[];
      const leftOrientation = prefs.leftOrientation ?? prefs.blueOrientation;
      const rightOrientation = prefs.rightOrientation ?? prefs.redOrientation;

      if (leftOrientation && validOrientations.includes(leftOrientation)) {
        void pickerState.setLeftOrientation(leftOrientation as Orientation);
      } else if (
        prefs.orientation &&
        validOrientations.includes(prefs.orientation)
      ) {
        // Legacy: single orientation applied to the left hand
        void pickerState.setLeftOrientation(prefs.orientation as Orientation);
      }

      if (rightOrientation && validOrientations.includes(rightOrientation)) {
        void pickerState.setRightOrientation(rightOrientation as Orientation);
      } else if (
        prefs.orientation &&
        validOrientations.includes(prefs.orientation)
      ) {
        // Legacy: single orientation applied to the right hand
        void pickerState.setRightOrientation(prefs.orientation as Orientation);
      }

      // Restore grid mode preference (Diamond/Box)
      if (prefs.gridMode === "DIAMOND" || prefs.gridMode === "BOX") {
        const mode =
          prefs.gridMode === "DIAMOND" ? GridMode.DIAMOND : GridMode.BOX;
        if (showAdvancedPicker) {
          void pickerState.loadAllVariations(mode);
        } else {
          void pickerState.loadPositions(mode);
        }
      }
    } catch (error) {
      console.warn("Failed to load start position picker preferences:", error);
    }
  }

  /**
   * Persist current preferences to localStorage
   */
  function persistPreferences() {
    try {
      const prefs = {
        showAdvanced: showAdvancedPicker,
        pickerPath,
        gridMode:
          pickerState.currentGridMode === GridMode.DIAMOND ? "DIAMOND" : "BOX",
        leftOrientation: pickerState.leftOrientation,
        rightOrientation: pickerState.rightOrientation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn(
        "Failed to persist start position picker preferences:",
        error
      );
    }
  }

  // Derived labels for action-oriented toggles
  const viewModeLabel = $derived(
    showAdvancedPicker ? "Simple" : "All Variations"
  );
  // Expose state for parent components
  export function isShowingAdvanced() {
    return showAdvancedPicker;
  }

  export function goBackToDefault() {
    handleBackToDefault();
  }

  // Handle position selection
  async function handlePositionSelect(position: PictographData) {
    hapticService?.trigger("selection");
    const submittedPath = pickerPath;
    if (submittedPath === "build") {
      buildPositionSubmitted = true;
    }
    onPositionSubmitted(position, submittedPath);
    await pickerState.selectPosition(position);
  }

  function handlePathChange(path: StartPositionPath) {
    hapticService?.trigger("selection");
    if (
      pickerPath === "build" &&
      path !== "build" &&
      buildPathOpened &&
      !buildPositionSubmitted
    ) {
      logConstructStartPositionCancelled("build");
    }
    if (path === "build") {
      buildPathOpened = true;
      buildPositionSubmitted = false;
    }
    pickerPath = path;
    logConstructStartPositionPath(path);
    persistPreferences();
  }

  // Handle toggle between simple and advanced
  function handleToggleView() {
    hapticService?.trigger("selection");

    if (!showAdvancedPicker) {
      showAdvancedPicker = true;
      pickerState.loadAllVariations(pickerState.currentGridMode);
      onNavigateToAdvanced?.();
    } else {
      showAdvancedPicker = false;
      onNavigateToDefault?.();
    }
    persistPreferences();
  }

  // Handle return to the default picker (exposed for external triggers)
  function handleBackToDefault() {
    hapticService?.trigger("selection");
    if (showAdvancedPicker) {
      handleToggleView();
    }
  }

  // Handle grid mode change
  async function handleGridModeChange(newMode: GridMode) {
    if (pickerState.currentGridMode === newMode) return;

    await pickerState.loadPositions(newMode);
    await pickerState.loadAllVariations(newMode);
    persistPreferences();
  }

  // Handle per-hand orientation changes from cyclers
  async function handleLeftOrientationChange(orientation: Orientation) {
    hapticService?.trigger("selection");
    await pickerState.setLeftOrientation(orientation);
    persistPreferences();
  }

  async function handleRightOrientationChange(orientation: Orientation) {
    hapticService?.trigger("selection");
    await pickerState.setRightOrientation(orientation);
    persistPreferences();
  }
</script>

<!-- The header keeps its geometry when the selected method changes. -->
<div class="start-pos-picker" data-testid="start-position-picker">
  <div class="picker-header">
    {#if !embedded}
      <div class="heading-region">
        <Crossfade
          key={suppressHeading}
          animateHeight
          duration={DURATION.emphasis}
        >
          {#if !suppressHeading}
            <div class="workspace-heading">
              {#if heading}
                {@render heading()}
              {:else}
                <p class="workspace-hint">Choose your start position</p>
              {/if}
            </div>
          {/if}
        </Crossfade>
      </div>
    {/if}

    <div class="path-selector">
      <SegmentedControl
        options={START_POSITION_PATHS}
        value={pickerPath}
        onchange={handlePathChange}
        color="accent"
        size="md"
        ariaLabel="Start position method"
      />
    </div>
  </div>

  {#if validationMessage}
    <p class="validation-message" role="alert">{validationMessage}</p>
  {/if}

  <!-- Path/view changes crossfade; grid mode still updates in place. -->
  <div class="picker-view">
    <Crossfade
      key={`${pickerPath}-${showAdvancedPicker}`}
      duration={DURATION.normal}
      fill
    >
      <div class="picker-content">
        {#if pickerPath === "build"}
          <BuildStartPosition
            gridMode={pickerState.currentGridMode}
            leftPropType={effectiveLeftPropType}
            rightPropType={effectiveRightPropType}
            leftOrientation={pickerState.leftOrientation}
            rightOrientation={pickerState.rightOrientation}
            {initialLeftLocation}
            {initialRightLocation}
            onLeftOrientationChange={handleLeftOrientationChange}
            onRightOrientationChange={handleRightOrientationChange}
            onGridModeChange={lockedGridMode === undefined
              ? handleGridModeChange
              : undefined}
            onApply={handlePositionSelect}
          />
        {:else if showAdvancedPicker}
          <!-- Advanced picker with all 16 variations -->
          <AdvancedStartPositionPicker
            pictographDataSet={pickerState.allVariations}
            selectedPictograph={pickerState.selectedPosition}
            currentGridMode={pickerState.currentGridMode}
            onPictographSelect={handlePositionSelect}
            {isSideBySideLayout}
          />
        {:else}
          <!-- Simple 3-position grid -->
          <div class="grid-container">
            <div class="grid-wrapper">
              <PictographGrid
                pictographDataSet={pickerState.positions}
                selectedPictograph={pickerState.selectedPosition}
                onPictographSelect={handlePositionSelect}
                {leftPropTypeOverride}
                {rightPropTypeOverride}
              />
            </div>
          </div>
        {/if}
      </div>
    </Crossfade>
  </div>

  <!-- Controls Footer - below grid (hidden when embedded, e.g. the create tutorial) -->
  {#if !embedded && pickerPath === "presets"}
    <div class="controls-footer">
      <div class="orientation-controls">
        <OrientationCycler
          orientation={pickerState.leftOrientation}
          onOrientationChange={handleLeftOrientationChange}
          color="blue"
        />

        <OrientationCycler
          orientation={pickerState.rightOrientation}
          onOrientationChange={handleRightOrientationChange}
          color="red"
        />
      </div>

      <div class="mode-controls">
        <button
          class="control-button"
          onclick={handleToggleView}
          aria-label={`Show ${viewModeLabel}`}
        >
          <svg
            class="control-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            {#if showAdvancedPicker}
              <!-- Minimize icon -->
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            {:else}
              <!-- Grid/expand icon -->
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            {/if}
          </svg>
          <span class="control-label">{viewModeLabel}</span>
        </button>

        {#if lockedGridMode === undefined}
          <GridModeToggle
            currentGridMode={pickerState.currentGridMode}
            onGridModeChange={handleGridModeChange}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .start-pos-picker {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    min-height: 300px;
    position: relative;
    container-type: inline-size;
  }

  .heading-region {
    flex-shrink: 0;
  }

  .workspace-heading {
    display: grid;
    align-items: start;
    min-height: clamp(96px, 14vh, 148px);
    padding: clamp(12px, 4vh, 52px)
      calc(1rem + var(--picker-leading-action-offset, 0px)) 0;
    box-sizing: border-box;
  }

  .workspace-hint {
    text-align: center;
    margin: 0;
    /* Match the Generate tab hint exactly: Playfair serif, soft shadow, one line.
       cqi tracks .start-pos-picker's width (container-type: inline-size) so the
       line scales to fit and never wraps. */
    font-family: "Playfair Display", Georgia, serif;
    font-size: clamp(1rem, 4.6cqi, 2rem);
    font-weight: 500;
    line-height: 1.2;
    letter-spacing: 0.02em;
    white-space: nowrap;
    color: var(--theme-text, #fff);
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
  }

  .path-selector {
    flex-shrink: 0;
    width: min(calc(100% - 24px), 360px);
    margin: 10px auto 4px;
  }

  .validation-message {
    flex: 0 0 auto;
    width: min(calc(100% - 24px), 520px);
    margin: 4px auto 0;
    padding: 8px 12px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--theme-danger) 62%, transparent);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-danger) 12%,
      var(--theme-card-bg)
    );
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 1.35;
    text-align: center;
  }

  .picker-view {
    flex: 1;
    width: 100%;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .picker-content {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .grid-container {
    width: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    container-type: size;
    padding: clamp(8px, 2vmin, 16px) clamp(16px, 4vmin, 40px);
    box-sizing: border-box;
  }

  .grid-wrapper {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
    min-height: 0;
  }

  /* ============================================
     Controls Footer - wraps into two rows when narrow
     ============================================ */
  .controls-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: clamp(8px, 2vmin, 16px);
    padding: clamp(8px, 2vmin, 16px) clamp(12px, 3vmin, 32px);
    background: transparent;
    flex-shrink: 0;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  .orientation-controls,
  .mode-controls {
    display: flex;
    align-items: stretch;
    gap: clamp(8px, 2vmin, 12px);
    width: 100%;
  }

  /* Make orientation cyclers stretch to fill their row equally */
  .orientation-controls :global(.orientation-cycler) {
    flex: 1;
  }

  .mode-controls :global(.grid-mode-toggle) {
    flex: 1;
    min-width: 0;
    border-radius: 12px;
  }

  .control-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 8px;

    /* Touch target */
    min-height: var(--min-touch-target, 48px);
    padding: 10px 16px;

    /* Theme-aware styling */
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;

    /* Typography */
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
    letter-spacing: 0.3px;
    white-space: nowrap;

    /* Interaction */
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;

    /* Smooth transitions */
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.15s ease,
      box-shadow 0.2s ease;
  }

  .control-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .control-label {
    white-space: nowrap;
  }

  /* Hover state */
  @media (hover: hover) {
    .control-button:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px var(--theme-shadow, var(--theme-shadow));
    }

    .control-button:hover .control-icon {
      opacity: 1;
    }
  }

  /* Active/pressed state */
  .control-button:active {
    transform: translateY(0) scale(0.98);
    transition: transform var(--duration-instant) ease;
  }

  /* Focus state */
  .control-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .control-button {
      transition: none;
    }

    .control-button:hover {
      transform: none;
    }
  }

  /* Big-screen tiers at the documented 1680 seam (.claude/rules/4k-native-layout.md).
     Without these the picker is a phone column marooned in a 4K field: a 2rem
     heading and a 360px method toggle read as postage stamps across the room,
     which is the exact "scaled-up phone layout" this codebase keeps fixing. */
  @media (min-width: 1680px) {
    .workspace-heading {
      padding-top: clamp(20px, 5vh, 52px);
    }

    .workspace-hint {
      font-size: clamp(2rem, 2.2vw, 3rem);
    }

    .path-selector {
      width: min(calc(100% - 24px), 32rem);
      margin-top: 1rem;
    }

    .controls-footer {
      max-width: 64rem;
      gap: 1rem;
    }

    .control-button {
      min-height: 3.5rem;
      font-size: 1.05rem;
    }

    .control-icon {
      width: 22px;
      height: 22px;
    }
  }

  @media (min-width: 2600px) {
    .workspace-hint {
      font-size: clamp(3rem, 2vw, 4.25rem);
    }

    .path-selector {
      width: min(calc(100% - 24px), 44rem);
    }

    .controls-footer {
      max-width: 84rem;
    }

    .control-button {
      min-height: 4.5rem;
      font-size: 1.4rem;
      border-radius: 16px;
    }

    .control-icon {
      width: 28px;
      height: 28px;
    }
  }

  /* Narrow container: compact buttons but keep labels */
  @container (max-width: 500px) {
    .path-selector {
      margin-right: 12px;
      margin-left: 12px;
    }

    .control-button {
      padding: 8px 12px;
    }

    .control-icon {
      width: 16px;
      height: 16px;
    }
  }

  .picker-header {
    flex-shrink: 0;
  }

  .start-pos-picker {
    max-width: 58rem;
    margin-inline: auto;
  }

  .start-pos-picker .workspace-heading {
    min-height: 68px;
    padding-top: 20px;
  }

  .start-pos-picker :global(.workspace-hint) {
    font-family: inherit;
    font-size: clamp(1.125rem, 3cqi, 1.75rem);
    font-weight: 600;
    letter-spacing: normal;
    white-space: normal;
  }

  .start-pos-picker .path-selector {
    width: min(calc(100% - 24px), 18rem);
    margin: 0 auto;
  }

  @media (max-height: 620px) and (min-width: 60rem) {
    .picker-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) clamp(18rem, 38vw, 32rem);
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
    }

    .start-pos-picker .workspace-heading {
      min-height: 0;
      padding: 0 0 0 var(--picker-leading-action-offset, 0px);
    }

    .start-pos-picker :global(.workspace-hint) {
      font-size: clamp(1rem, 1.4vw, 1.4rem);
    }
  }

  @media (min-width: 1100px) and (min-height: 700px) {
    .start-pos-picker {
      max-width: none;
      gap: 12px;
      padding: 14px clamp(24px, 2.5vw, 64px) clamp(24px, 2.5vw, 64px);
      box-sizing: border-box;
      background: var(--theme-panel-bg);
    }

    .picker-header {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) auto minmax(12rem, 1fr);
      grid-template-areas: ". hint sel";
      align-items: center;
      gap: 12px;
    }

    .heading-region {
      grid-area: hint;
    }

    .start-pos-picker .workspace-heading {
      min-height: 56px;
      align-items: center;
      padding: 0;
    }

    .start-pos-picker :global(.workspace-hint) {
      text-align: center;
      font-size: clamp(24px, 1.7vw, 36px);
    }

    .start-pos-picker .path-selector {
      grid-area: sel;
      margin: 0;
      width: min(100%, 18rem);
      justify-self: end;
    }

    .picker-view {
      border-top: 1px solid var(--theme-stroke);
      padding-top: 16px;
      box-sizing: border-box;
    }
  }
</style>

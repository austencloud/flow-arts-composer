<!--
StartPlacementPicker.svelte - Choose the start placement for a new sequence.
Presets: a family switch (alpha, beta, gamma), that family's variations in one
box sized by container queries, the orientation cyclers, and a Diamond | Box
switch. Embedded hosts (tutorial, /composer demo) keep the three presets.
Build: BuildStartPlacement.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { GridJoin } from "@tka/tka-types";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onDestroy, onMount } from "svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    createSimplifiedStartPlacementState,
    type SimplifiedStartPlacementState,
  } from "#lib/shared/create/state/start-placement-state.svelte.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import BuildStartPlacement from "./BuildStartPlacement.svelte";
  import HandsStartDrawing from "#lib/shared/create/components/HandsStartDrawing.svelte";
  import OrientationCycler from "./OrientationCycler.svelte";
  import PictographGrid from "./PictographGrid.svelte";
  import {
    logConstructStartPlacementCancelled,
    logConstructStartPlacementPath,
    type StartPlacementPath,
  } from "../../services/construct-analytics";
  import { morphStartPlacementIntoWorkspace } from "../services/start-placement-morph";

  // Local storage key for persisting picker preferences
  const STORAGE_KEY = "tka-start-placement-picker-prefs";
  // Pre-rename key. Read-only fallback when the new key has nothing yet;
  // writes always go to STORAGE_KEY.
  const LEGACY_STORAGE_KEY = "tka-start-position-picker-prefs";
  const START_PLACEMENT_PATHS = $derived([
    { value: "presets" as const, label: t("create_ui_presets") },
    { value: "build" as const, label: t("create_ui_build") },
  ]);

  type StartFamily = "alpha" | "beta" | "gamma";
  const START_FAMILIES: readonly StartFamily[] = ["alpha", "beta", "gamma"];
  // The visible label is the plain word; the accessible name adds the family
  // name after it, so it starts with what is on screen.
  const FAMILY_OPTIONS = $derived([
    {
      value: "alpha" as const,
      label: t("create_start_hands_apart"),
      ariaLabel: `${t("create_start_hands_apart")} (${t("learn_staff_answer_alpha")})`,
    },
    {
      value: "beta" as const,
      label: t("create_start_hands_together"),
      ariaLabel: `${t("create_start_hands_together")} (${t("learn_staff_answer_beta")})`,
    },
    {
      value: "gamma" as const,
      label: t("create_start_hands_adjacent"),
      ariaLabel: `${t("create_start_hands_adjacent")} (${t("learn_staff_answer_gamma")})`,
    },
  ]);
  const FAMILY_DRAWING = {
    alpha: "apart",
    beta: "together",
    gamma: "adjacent",
  } as const;
  const FAMILY_HINTS = $derived({
    alpha: t("create_start_hands_apart_hint"),
    beta: t("create_start_hands_together_hint"),
    gamma: t("create_start_hands_adjacent_hint"),
  });
  const GRID_OPTIONS = $derived([
    { value: GridMode.DIAMOND, label: t("generator_grid_diamond") },
    { value: GridMode.BOX, label: t("generator_grid_box") },
  ]);

  // Props - receive navigation callbacks
  const {
    startPlacementState,
    embedded = false,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    initialStartPlacement = null,
    lockedGridMode = undefined,
    gridJoin = null,
    lockedPath = undefined,
    rememberPreferences = true,
    validationMessage = null,
    onPlacementSubmitted = () => {},
    suppressHeading = false,
    morphIntoWorkspace = false,
  } = $props<{
    startPlacementState?: SimplifiedStartPlacementState | null;
    // When rendered inside another surface (e.g. the create tutorial), that
    // surface owns the heading and the "show me how" entry point. Suppress the
    // picker's own hint + guide link so they don't duplicate — and so the guide
    // link can't replay the very tutorial it sits inside.
    embedded?: boolean;
    /** Explicit prop types for demo/preview rendering (bypasses global
     *  settings) — same convention as StepCell/PictographContainer. */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    initialStartPlacement?: PictographData | null;
    lockedGridMode?: GridMode;
    /** The sequence's grid join, drawn on the tiles (display only). */
    gridJoin?: GridJoin | null;
    /** Pins the picker to one start method and hides the method switch. */
    lockedPath?: StartPlacementPath;
    /** False keeps this picker out of the saved picker preferences: it starts
     *  from the defaults and saves nothing, so a public demo neither inherits
     *  a visitor's Create-tab choices nor changes them. */
    rememberPreferences?: boolean;
    validationMessage?: string | null;
    onPlacementSubmitted?: (
      placement: PictographData,
      path: StartPlacementPath
    ) => void;
    /** The active Construct guide owns this instruction band. Keep the wrapper
     *  mounted so its height can collapse on the same clock as the guide. */
    suppressHeading?: boolean;
    /** The picker hands the chosen card to the workspace start cell
     *  (start-placement-morph.ts). The Construct tab and the /composer demo
     *  set this; an embed with no workspace to land in leaves it off. */
    morphIntoWorkspace?: boolean;
  }>();

  // Create simplified state - use $derived to handle prop changes
  const pickerState = $derived(
    startPlacementState ?? createSimplifiedStartPlacementState()
  );

  let pickerPath = $state<StartPlacementPath>("presets");
  const activePath = $derived(lockedPath ?? pickerPath);
  let buildPathOpened = false;
  let buildPlacementSubmitted = false;

  // The family view is the Construct tab's preset screen. Embedded hosts
  // keep the three presets they were built around.
  const showFamilies = $derived(!embedded);
  let openFamily = $state<StartFamily>("alpha");
  // The first family grid waits for the workspace to settle, as the presets
  // always have; a later switch happens inside a settled picker.
  let familySwitched = $state(false);

  // Variations arrive in picker order (four alpha, four beta, eight gamma).
  // Grouping by placement name keeps that order inside each family.
  const familyVariations = $derived.by(() => {
    const groups: Record<StartFamily, PictographData[]> = {
      alpha: [],
      beta: [],
      gamma: [],
    };
    for (const variation of pickerState.allVariations) {
      const name = variation.startPlacement?.toLowerCase() ?? "";
      const family = START_FAMILIES.find((f) => name.startsWith(f));
      if (family) groups[family].push(variation);
    }
    return groups;
  });

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
    initialStartPlacement?.motions.left?.startLocation ?? null
  );
  const initialRightLocation = $derived(
    initialStartPlacement?.motions.right?.startLocation ?? null
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
      void pickerState.loadPlacements(lockedGridMode);
    }

    const initialLeftOrientation =
      initialStartPlacement?.motions.left?.startOrientation;
    const initialRightOrientation =
      initialStartPlacement?.motions.right?.startOrientation;
    if (initialLeftOrientation) {
      void pickerState.setLeftOrientation(initialLeftOrientation);
    }
    if (initialRightOrientation) {
      void pickerState.setRightOrientation(initialRightOrientation);
    }

    // Always ensure the shown set is loaded - loadPersistedPreferences may
    // skip it when there are no stored prefs or no gridMode pref. The
    // variations come from a static table synchronously, so the family grid
    // has its tiles as early as the presets had theirs.
    // The state object can outlive this picker, so reload for the grid now
    // in force (saved, locked or current) rather than trusting what it holds.
    if (showFamilies) {
      const mode = pickerState.currentGridMode;
      if (
        pickerState.allVariations.length === 0 ||
        pickerState.allVariations[0]?.gridMode !== mode
      ) {
        void pickerState.loadAllVariations(mode);
      }
    } else if (pickerState.placements.length === 0) {
      void pickerState.loadPlacements();
    }

    if (activePath === "build") {
      buildPathOpened = true;
    }
  });

  onDestroy(() => {
    if (activePath === "build" && buildPathOpened && !buildPlacementSubmitted) {
      logConstructStartPlacementCancelled("build");
    }
  });

  /**
   * Load persisted picker preferences from localStorage
   */
  function loadPersistedPreferences() {
    if (!rememberPreferences) return;
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!stored) return;

      // Older saves also carry `showAdvanced` from the removed
      // all-variations view; it is ignored and no longer written.
      const prefs = JSON.parse(stored) as {
        pickerPath?: StartPlacementPath;
        gridMode?: string;
        orientation?: string; // legacy single orientation
        leftOrientation?: string;
        rightOrientation?: string;
        blueOrientation?: string;
        redOrientation?: string;
      };

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
        if (showFamilies) {
          void pickerState.loadAllVariations(mode);
        } else {
          void pickerState.loadPlacements(mode);
        }
      }
    } catch (error) {
      console.warn("Failed to load start placement picker preferences:", error);
    }
  }

  /**
   * Persist current preferences to localStorage
   */
  function persistPreferences() {
    if (!rememberPreferences) return;
    try {
      const prefs = {
        pickerPath,
        gridMode:
          pickerState.currentGridMode === GridMode.DIAMOND ? "DIAMOND" : "BOX",
        leftOrientation: pickerState.leftOrientation,
        rightOrientation: pickerState.rightOrientation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn(
        "Failed to persist start placement picker preferences:",
        error
      );
    }
  }

  // The card that travels into the workspace is the one under the press that
  // chose it, so remember where the last click or key press landed.
  let pickerElement: HTMLElement | undefined = $state();
  let lastActivation: Element | null = null;

  function noteActivation(event: Event) {
    lastActivation = event.target instanceof Element ? event.target : null;
  }

  function morphSourceFor(): HTMLElement | null {
    if (!morphIntoWorkspace) return null;
    return (
      lastActivation
        ?.closest("[data-start-morph-tile]")
        ?.querySelector<HTMLElement>("[data-start-morph-candidate]") ??
      // Build applies from a button; the pose square being built flies.
      (activePath === "build"
        ? (pickerElement?.querySelector<HTMLElement>(
            "[data-placement-stage]"
          ) ?? null)
        : null)
    );
  }

  // Handle placement selection
  async function handlePlacementSelect(placement: PictographData) {
    hapticService?.trigger("selection");
    const submittedPath = activePath;
    if (submittedPath === "build") {
      buildPlacementSubmitted = true;
    }
    await morphStartPlacementIntoWorkspace(morphSourceFor(), () => {
      onPlacementSubmitted(placement, submittedPath);
      void pickerState.selectPlacement(placement);
      // A refused placement (it doesn't connect to step 1) reports back
      // through the validation message before selection returns.
      return !validationMessage;
    });
  }

  function handlePathChange(path: StartPlacementPath) {
    hapticService?.trigger("selection");
    if (
      pickerPath === "build" &&
      path !== "build" &&
      buildPathOpened &&
      !buildPlacementSubmitted
    ) {
      logConstructStartPlacementCancelled("build");
    }
    if (path === "build") {
      buildPathOpened = true;
      buildPlacementSubmitted = false;
    }
    pickerPath = path;
    logConstructStartPlacementPath(path);
    persistPreferences();
  }

  function handleFamilyChange(family: StartFamily) {
    if (family === openFamily) return;
    hapticService?.trigger("selection");
    familySwitched = true;
    openFamily = family;
  }

  // Handle grid mode change. The open family stays open.
  async function handleGridModeChange(newMode: GridMode) {
    if (pickerState.currentGridMode === newMode) return;

    await pickerState.loadPlacements(newMode);
    await pickerState.loadAllVariations(newMode);
    persistPreferences();
  }

  function handleGridSwitch(newMode: GridMode) {
    hapticService?.trigger("selection");
    void handleGridModeChange(newMode);
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
<div
  bind:this={pickerElement}
  class="start-placement-picker"
  class:headerless={embedded && lockedPath !== undefined}
  class:with-footer={!embedded && activePath === "presets"}
  class:families={showFamilies && activePath === "presets"}
  data-testid="start-placement-picker"
  onclickcapture={noteActivation}
  onkeydowncapture={noteActivation}
>
  {#if !embedded || lockedPath === undefined}
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
                <p class="workspace-hint">
                  {t("create_ui_choose_your_start_placement")}
                </p>
              </div>
            {/if}
          </Crossfade>
        </div>
      {/if}

      {#if lockedPath === undefined}
        <div class="path-selector">
          <SegmentedControl
            options={START_PLACEMENT_PATHS}
            value={pickerPath}
            onchange={handlePathChange}
            color="accent"
            size="md"
            ariaLabel={t("create_ui_start_placement_method")}
          />
        </div>
      {/if}
    </div>
  {/if}

  {#if validationMessage}
    <p class="validation-message" role="alert">{validationMessage}</p>
  {/if}

  <!-- Path and family changes crossfade; grid mode updates in place. -->
  <div class="picker-view">
    <Crossfade key={activePath} duration={DURATION.normal} fill>
      <div class="picker-content">
        {#if activePath === "build"}
          <BuildStartPlacement
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
            onApply={handlePlacementSelect}
          />
        {:else if showFamilies}
          <div class="family-switch">
            <SegmentedControl
              options={FAMILY_OPTIONS}
              value={openFamily}
              onchange={handleFamilyChange}
              color="accent"
              ariaLabel={t("browse_ui_alpha_beta_gamma")}
              optionContent={familySegment}
            />
          </div>
          <div class="family-view">
            <Crossfade key={openFamily} duration={DURATION.normal} fill>
              <div class="family-box" data-family={openFamily}>
                <PictographGrid
                  layout="family"
                  settleOnMount={!familySwitched}
                  pictographDataSet={familyVariations[openFamily]}
                  selectedPictograph={pickerState.selectedPlacement}
                  onPictographSelect={handlePlacementSelect}
                  {leftPropTypeOverride}
                  {rightPropTypeOverride}
                  {gridJoin}
                />
              </div>
            </Crossfade>
          </div>
        {:else}
          <!-- Simple 3-placement grid -->
          <div class="grid-container">
            <div class="grid-wrapper">
              <PictographGrid
                pictographDataSet={pickerState.placements}
                selectedPictograph={pickerState.selectedPlacement}
                onPictographSelect={handlePlacementSelect}
                {leftPropTypeOverride}
                {rightPropTypeOverride}
                {gridJoin}
              />
            </div>
          </div>
        {/if}
      </div>
    </Crossfade>
  </div>

  <!-- Controls Footer - below grid (hidden when embedded, e.g. the create tutorial) -->
  {#if !embedded && activePath === "presets"}
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

      {#if lockedGridMode === undefined}
        <div class="grid-switch">
          <SegmentedControl
            options={GRID_OPTIONS}
            value={pickerState.currentGridMode}
            onchange={handleGridSwitch}
            color="accent"
            ariaLabel={t("generator_grid")}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet familySegment(family: StartFamily)}
  <span class="family-segment">
    <span class="family-drawing">
      <HandsStartDrawing
        kind={FAMILY_DRAWING[family]}
        gridMode={pickerState.currentGridMode}
      />
    </span>
    <span class="family-text">
      <span class="family-word">
        {FAMILY_OPTIONS.find((option) => option.value === family)?.label}
      </span>
      <span class="family-hint">{FAMILY_HINTS[family]}</span>
    </span>
  </span>
{/snippet}

<style>
  .start-placement-picker {
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
       cqi tracks .start-placement-picker's width (container-type: inline-size) so the
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

  /* ============================================
     Family view: switch, then one box that takes every pixel left over.
     PictographGrid sizes the tiles from this box alone.
     ============================================ */
  .family-switch {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 100%;
    max-width: 600px;
    margin: 8px auto 0;
    padding-inline: 16px;
  }

  /* Stacked (base): the drawing above the word in every option, so the three
     options share one arrangement whatever the word. The 2px side padding
     keeps the longest word inside a 106px option. */
  .family-switch :global(.ui-segments button) {
    min-height: 48px;
    padding-block: 4px;
    padding-inline: 2px;
  }

  .family-segment {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .family-drawing {
    display: block;
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    pointer-events: none;
  }

  .family-text {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .family-word {
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }

  .family-hint {
    display: none;
  }

  /* Row: the drawing beside the word in a 48px row. */
  @container (min-width: 540px) {
    .family-switch :global(.ui-segments button) {
      padding-block: 0;
      padding-inline: 0.7rem;
    }

    .family-segment {
      flex-direction: row;
      gap: 6px;
    }
  }

  /* Wide: a roomy picker in a tall window. */
  @container (min-width: 860px) {
    @media (min-height: 760px) {
      .family-switch {
        max-width: 860px;
      }

      .family-switch :global(.ui-segments button) {
        min-height: 64px;
      }

      .family-segment {
        justify-content: flex-start;
        gap: 12px;
      }

      .family-drawing {
        width: 52px;
        height: 52px;
      }

      .family-text {
        align-items: flex-start;
        text-align: left;
      }

      .family-word {
        font-size: var(--font-size-lg);
      }

      .family-hint {
        display: block;
        font-size: var(--font-size-compact);
        font-weight: 400;
        color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
      }
    }
  }

  /* Tall wide: the full-size drawing. */
  @container (min-width: 860px) {
    @media (min-height: 1200px) {
      .family-switch :global(.ui-segments button) {
        min-height: 96px;
      }

      .family-drawing {
        width: 76px;
        height: 76px;
      }
    }
  }

  .family-view {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .family-box {
    width: 100%;
    height: 100%;
    display: flex;
    container-type: size;
    /* No bottom padding: the controls footer's own top padding is the gap. */
    padding: 8px 16px 0;
    box-sizing: border-box;
  }

  .grid-switch {
    width: 100%;
  }

  /* 36px segments in the control's padding and border: 44px. */
  .grid-switch :global(.ui-segments button) {
    min-height: 36px;
    padding-block: 0;
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

  .orientation-controls {
    display: flex;
    align-items: stretch;
    gap: clamp(8px, 2vmin, 12px);
    width: 100%;
  }

  /* Make orientation cyclers stretch to fill their row equally */
  .orientation-controls :global(.orientation-cycler) {
    flex: 1;
    min-height: 48px;
  }

  @container (max-width: 500px) {
    .path-selector {
      margin-right: 12px;
      margin-left: 12px;
    }
  }

  .picker-header {
    flex-shrink: 0;
  }

  .start-placement-picker {
    max-width: 58rem;
    margin-inline: auto;
  }

  .start-placement-picker .workspace-heading {
    min-height: 68px;
    padding-top: 20px;
  }

  .start-placement-picker :global(.workspace-hint) {
    font-family: inherit;
    font-size: clamp(1.125rem, 3cqi, 1.75rem);
    font-weight: 600;
    letter-spacing: normal;
    white-space: normal;
  }

  .start-placement-picker .path-selector {
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

    .start-placement-picker .workspace-heading {
      min-height: 0;
      padding: 0 0 0 var(--picker-leading-action-offset, 0px);
    }

    .start-placement-picker :global(.workspace-hint) {
      font-size: clamp(1rem, 1.4vw, 1.4rem);
    }
  }

  /* A phone held sideways (the Fold's cover screen on its side, often under
     360px tall) has width to spare and no height. The title or guide offer
     takes the top left and the Presets/Build switch the top right, in the
     same place on both paths. Presets fill the left below, and the
     orientation and view controls stack in a column under the switch. */
  @media (max-height: 480px) and (min-width: 700px) and (orientation: landscape) {
    .start-placement-picker {
      --short-side-column: minmax(13rem, 18rem);
    }

    .picker-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--short-side-column);
      align-items: center;
      gap: 4px;
      padding: 6px 12px 0 0;
    }

    .start-placement-picker .workspace-heading {
      min-height: 0;
      align-items: center;
      padding: 0 0 0 var(--picker-leading-action-offset, 0px);
    }

    .start-placement-picker :global(.workspace-hint) {
      font-size: var(--font-size-lg, 1.125rem);
    }

    .start-placement-picker .path-selector {
      width: 100%;
      margin: 0;
    }

    .start-placement-picker.with-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) var(--short-side-column);
      grid-template-rows: auto auto minmax(0, 1fr);
      grid-template-areas:
        "heading path"
        "message footer"
        "view footer";
      align-items: center;
      column-gap: 4px;
      padding: 6px 12px 0 0;
    }

    .with-footer .validation-message,
    .with-footer .picker-view {
      align-self: stretch;
    }

    .with-footer .picker-header {
      display: contents;
    }

    .with-footer .heading-region {
      grid-area: heading;
    }

    .with-footer .path-selector {
      grid-area: path;
      width: auto;
    }

    .with-footer .validation-message {
      grid-area: message;
    }

    .with-footer .picker-view {
      grid-area: view;
    }

    .with-footer .controls-footer {
      grid-area: footer;
      align-self: stretch;
      flex-direction: column;
      flex-wrap: nowrap;
      justify-content: center;
      gap: 8px;
      max-width: none;
      margin: 0;
      padding: 6px 0 8px;
      box-sizing: border-box;
    }

    .with-footer .orientation-controls {
      flex-direction: column;
      gap: 8px;
    }

    .with-footer .orientation-controls :global(.orientation-cycler) {
      flex: 0 0 auto;
      min-height: 44px;
    }

    /* The footer sits beside the box here, so the box keeps its own gap
       above the window's bottom edge. */
    .with-footer .family-box {
      padding-bottom: 8px;
    }
  }

  @media (min-width: 1100px) and (min-height: 700px) {
    .start-placement-picker {
      max-width: none;
      gap: 12px;
      padding: 14px clamp(24px, 2.5vw, 64px) clamp(24px, 2.5vw, 64px);
      box-sizing: border-box;
      background: var(--theme-panel-bg);
    }

    /* With no header, the host surface frames the picker; this padding would
       only shrink the presets inside a frame that already has room. */
    .start-placement-picker.headerless {
      padding: 0;
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

    .start-placement-picker .workspace-heading {
      min-height: 56px;
      align-items: center;
      padding: 0;
    }

    .start-placement-picker :global(.workspace-hint) {
      text-align: center;
      font-size: clamp(24px, 1.7vw, 36px);
    }

    .start-placement-picker .path-selector {
      grid-area: sel;
      margin: 0;
      width: min(100%, 18rem);
      justify-self: end;
    }

    /* Divides the grid from the header, so only when one is there. */
    .picker-header ~ .picker-view {
      border-top: 1px solid var(--theme-stroke);
      padding-top: 16px;
      box-sizing: border-box;
    }
  }

  /* Large-display sizes the Construct tab heading already had when the
     removed guide offer component rendered it. */
  @media (min-width: 1680px) {
    .start-placement-picker :global(.workspace-hint) {
      font-size: clamp(2rem, 2.2vw, 3rem);
    }
  }

  @media (min-width: 2600px) {
    .start-placement-picker :global(.workspace-hint) {
      font-size: clamp(3rem, 2vw, 4.25rem);
    }
  }
</style>

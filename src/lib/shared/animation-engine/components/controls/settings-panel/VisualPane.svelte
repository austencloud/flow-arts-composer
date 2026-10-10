<!--
  VisualPane.svelte

  Visual settings:
  - Element toggles (Grid, Props, Beat #, Glyph)
  - Trail toggle (Off/On - hardcoded vivid style when on)
  - Ends selector (One End/Both Ends) - for bilateral props
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { onMount } from "svelte";
  import {
    getAnimationVisibilityManager,
    type GridMode,
    type TrailVisibility,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import {
    animationSettings,
    TrailMode,
    TrackingMode,
  } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { getAnimationScopeContext } from "#lib/shared/animation-engine/state/animation-scope-context.js";
  import {
    resolveEffectivePropsVisibility,
    toggleEffectivePropsVisibility,
  } from "#lib/shared/animation-engine/state/effective-prop-visibility.js";
  import {
    isBilateralProp,
    getBilateralEndLabels,
  } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let {
    propType = null,
    leftPropType = null,
    rightPropType = null,
  }: {
    propType?: PropType | string | null;
    leftPropType?: PropType | string | null;
    rightPropType?: PropType | string | null;
  } = $props();

  const settingsState = settingsService;
  const animationScope = getAnimationScopeContext();
  const animationSettingsState = animationScope?.settings ?? animationSettings;

  // Fall back to user's global settings when props not explicitly provided
  const effectiveLeftPropType = $derived(
    leftPropType ?? propType ?? settingsState.settings.leftPropType ?? null
  );
  const effectiveRightPropType = $derived(
    rightPropType ?? propType ?? settingsState.settings.rightPropType ?? null
  );

  // Visibility state
  const visibilityManager =
    animationScope?.visibility ?? getAnimationVisibilityManager();
  let updateCounter = $state(0);
  function isTrailsActive(): boolean {
    const tipMap = visibilityManager.effectsConfigState?.tipEffectMap ?? {};
    return Object.values(tipMap).some((a) => a.effect === "trails");
  }
  let currentTrailStyle = $state<TrailVisibility>(
    isTrailsActive() ? "on" : "off"
  );

  onMount(() => {
    const handleChange = () => {
      currentTrailStyle = isTrailsActive() ? "on" : "off";
      updateCounter++;
    };
    visibilityManager.registerObserver(handleChange);
    return () => visibilityManager.unregisterObserver(handleChange);
  });

  // Both ends toggle for bilateral props
  const showBothEndsToggle = $derived.by(() => {
    const leftIsBilateral =
      effectiveLeftPropType != null && isBilateralProp(effectiveLeftPropType);
    const rightIsBilateral =
      effectiveRightPropType != null && isBilateralProp(effectiveRightPropType);
    return (leftIsBilateral || rightIsBilateral) && currentTrailStyle !== "off";
  });

  const isBothEnds = $derived(
    animationSettingsState.trail.trackingMode === TrackingMode.BOTH_ENDS
  );

  const isLeftEnd = $derived(
    animationSettingsState.trail.trackingMode === TrackingMode.LEFT_END
  );

  const isRightEnd = $derived(
    animationSettingsState.trail.trackingMode === TrackingMode.RIGHT_END
  );

  // Get prop-specific labels for the ends (e.g., "Thumb"/"Pinky" for staff)
  const endLabels = $derived.by(() => {
    // Use whichever prop is bilateral for the labels
    const propToCheck = effectiveLeftPropType ?? effectiveRightPropType;
    if (propToCheck && isBilateralProp(propToCheck)) {
      return getBilateralEndLabels(propToCheck);
    }
    return ["End 1", "End 2"];
  });

  // Visibility getters (trigger on updateCounter)
  function getGridEnabled() {
    updateCounter;
    return visibilityManager.getGridMode() !== "none";
  }
  function getProps() {
    updateCounter;
    return resolveEffectivePropsVisibility(
      visibilityManager.getVisibility("props"),
      animationSettingsState.trail.hideProps
    );
  }
  function getStepNumbers() {
    updateCounter;
    return visibilityManager.getVisibility("stepNumbers");
  }
  function getTkaGlyph() {
    updateCounter;
    return visibilityManager.getVisibility("tkaGlyph");
  }
  function getElementalGlyph() {
    updateCounter;
    return visibilityManager.getVisibility("elementalGlyph");
  }
  function getPropElementalGlyph() {
    updateCounter;
    return visibilityManager.getVisibility("propElementalGlyph");
  }
  function getWordHeader() {
    updateCounter;
    return visibilityManager.getVisibility("wordHeader");
  }
  function getProgressBar() {
    updateCounter;
    return visibilityManager.getVisibility("progressBar");
  }

  // Toggle handlers
  function toggleGrid() {
    const currentMode = visibilityManager.getGridMode();
    const newMode: GridMode = currentMode === "none" ? "8point" : "none";
    visibilityManager.setGridMode(newMode);
    updateCounter++;
  }
  function toggleProps() {
    toggleEffectivePropsVisibility(visibilityManager, animationSettingsState);
    updateCounter++;
  }
  function toggleStepNumbers() {
    const current = visibilityManager.getVisibility("stepNumbers");
    visibilityManager.setVisibility("stepNumbers", !current);
    updateCounter++;
  }
  function toggleTkaGlyph() {
    const current = visibilityManager.getVisibility("tkaGlyph");
    visibilityManager.setVisibility("tkaGlyph", !current);
    updateCounter++;
  }
  function toggleElementalGlyph() {
    const current = visibilityManager.getVisibility("elementalGlyph");
    visibilityManager.setVisibility("elementalGlyph", !current);
    updateCounter++;
  }
  function togglePropElementalGlyph() {
    const current = visibilityManager.getVisibility("propElementalGlyph");
    visibilityManager.setVisibility("propElementalGlyph", !current);
    updateCounter++;
  }
  function toggleWordHeader() {
    const current = visibilityManager.getVisibility("wordHeader");
    visibilityManager.setVisibility("wordHeader", !current);
    updateCounter++;
  }
  function toggleProgressBar() {
    const current = visibilityManager.getVisibility("progressBar");
    visibilityManager.setVisibility("progressBar", !current);
    updateCounter++;
  }

  function toggleTrails(style: TrailVisibility) {
    visibilityManager.setActiveEffect(style === "on" ? "trails" : "none");
    if (style === "off") {
      animationSettingsState.setTrailMode(TrailMode.OFF);
    } else {
      // "on" - use hardcoded vivid settings
      animationSettingsState.setTrailMode(TrailMode.FADE);
      animationSettingsState.setFadeDuration(2500);
      animationSettingsState.setTrailAppearance({
        lineWidth: 3.5,
        maxOpacity: 0.95,
      });
    }
    updateCounter++;
  }

  function setTrackingMode(mode: TrackingMode) {
    animationSettingsState.setTrackingMode(mode);
    updateCounter++;
  }
</script>

<div class="visual-pane">
  <!-- Element Toggles -->
  <div class="element-grid">
    <button
      class="element-btn"
      class:active={getGridEnabled()}
      onclick={toggleGrid}
      type="button"
      aria-label={getGridEnabled()
        ? t("playback_audit_visual_hide_grid")
        : t("playback_audit_visual_show_grid")}
      aria-pressed={getGridEnabled()}
    >
      <span>{t("playback_audit_visual_grid")}</span>
    </button>
    <button
      class="element-btn"
      class:active={getProps()}
      onclick={toggleProps}
      type="button"
      aria-label={getProps()
        ? t("playback_audit_visual_hide_props")
        : t("playback_audit_visual_show_props")}
      aria-pressed={getProps()}
    >
      <span>{t("playback_audit_visual_props")}</span>
    </button>
    <button
      class="element-btn"
      class:active={getStepNumbers()}
      onclick={toggleStepNumbers}
      type="button"
      aria-label={getStepNumbers()
        ? t("playback_audit_visual_hide_step_numbers")
        : t("playback_audit_visual_show_step_numbers")}
      aria-pressed={getStepNumbers()}
    >
      <span>{t("playback_audit_visual_beat_number")}</span>
    </button>
    <button
      class="element-btn"
      class:active={getTkaGlyph()}
      onclick={toggleTkaGlyph}
      type="button"
      title={t("playback_audit_visual_tka_glyph_includes_turn_numbers")}
      aria-label={getTkaGlyph()
        ? t("playback_audit_visual_hide_tka_glyph")
        : t("playback_audit_visual_show_tka_glyph")}
      aria-pressed={getTkaGlyph()}
    >
      <span>{t("playback_audit_visual_glyph")}</span>
    </button>
    <button
      class="element-btn"
      class:active={getElementalGlyph()}
      onclick={toggleElementalGlyph}
      type="button"
      title={t("playback_audit_visual_hand_timing_and_direction_glyph")}
      aria-label={getElementalGlyph()
        ? t("playback_audit_visual_hide_hand_tnd_glyph")
        : t("playback_audit_visual_show_hand_tnd_glyph")}
      aria-pressed={getElementalGlyph()}
    >
      <span>Hand TnD</span>
    </button>
    <button
      class="element-btn"
      class:active={getPropElementalGlyph()}
      onclick={togglePropElementalGlyph}
      type="button"
      title={t("playback_audit_visual_prop_timing_and_direction_glyph")}
      aria-label={getPropElementalGlyph()
        ? t("playback_audit_visual_hide_prop_tnd_glyph")
        : t("playback_audit_visual_show_prop_tnd_glyph")}
      aria-pressed={getPropElementalGlyph()}
    >
      <span>Prop TnD</span>
    </button>
    <button
      class="element-btn"
      class:active={getWordHeader()}
      onclick={toggleWordHeader}
      type="button"
      title={t("playback_audit_visual_word_header_above_animation")}
      aria-label={getWordHeader()
        ? t("playback_audit_visual_hide_word_header")
        : t("playback_audit_visual_show_word_header")}
      aria-pressed={getWordHeader()}
    >
      <span>{t("playback_audit_visual_word")}</span>
    </button>
    <button
      class="element-btn"
      class:active={getProgressBar()}
      onclick={toggleProgressBar}
      type="button"
      title={t("playback_audit_visual_progress_bar_in_word_header")}
      aria-label={getProgressBar()
        ? t("playback_audit_visual_hide_progress_bar")
        : t("playback_audit_visual_show_progress_bar")}
      aria-pressed={getProgressBar()}
    >
      <span>{t("playback_audit_visual_progress")}</span>
    </button>
  </div>

  <!-- Trail Toggle -->
  <div class="trail-presets">
    <button
      class="trail-btn"
      class:active={currentTrailStyle === "off"}
      onclick={() => toggleTrails("off")}
      type="button"
      aria-label={t("playback_audit_visual_turn_trails_off")}
      aria-pressed={currentTrailStyle === "off"}
    >
      {t("playback_audit_visual_off")}
    </button>
    <button
      class="trail-btn"
      class:active={currentTrailStyle === "on"}
      onclick={() => toggleTrails("on")}
      type="button"
      aria-label={t("playback_audit_visual_turn_trails_on")}
      aria-pressed={currentTrailStyle === "on"}
    >
      {t("playback_audit_visual_on")}
    </button>
  </div>

  <!-- Ends Selector (for bilateral props) -->
  {#if showBothEndsToggle}
    <div class="ends-selector">
      <button
        class="ends-btn"
        class:active={isLeftEnd}
        onclick={() => setTrackingMode(TrackingMode.LEFT_END)}
        type="button"
        title={t("playback_audit_track_end_only", { end: endLabels[0] })}
        aria-label={t("playback_audit_track_end_only", { end: endLabels[0] })}
        aria-pressed={isLeftEnd}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{endLabels[0]}</span>
      </button>
      <button
        class="ends-btn both"
        class:active={isBothEnds}
        onclick={() => setTrackingMode(TrackingMode.BOTH_ENDS)}
        type="button"
        title={t("playback_audit_visual_track_both_ends")}
        aria-label={t("playback_audit_visual_track_both_ends")}
        aria-pressed={isBothEnds}
      >
        <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
        <span>{t("playback_audit_visual_both")}</span>
      </button>
      <button
        class="ends-btn"
        class:active={isRightEnd}
        onclick={() => setTrackingMode(TrackingMode.RIGHT_END)}
        type="button"
        title={t("playback_audit_track_end_only", { end: endLabels[1] })}
        aria-label={t("playback_audit_track_end_only", { end: endLabels[1] })}
        aria-pressed={isRightEnd}
      >
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
        <span>{endLabels[1]}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .visual-pane {
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fadeSlideIn var(--duration-dramatic) cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Element Grid */
  .element-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .element-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target);
    padding: 8px 6px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .element-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  @media (hover: hover) and (pointer: fine) {
    .element-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  /* Trail Presets */
  .trail-presets {
    display: flex;
    gap: 6px;
  }

  .trail-btn {
    flex: 1;
    min-height: var(--min-touch-target);
    padding: 8px 10px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .trail-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  @media (hover: hover) and (pointer: fine) {
    .trail-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  /* Ends Selector */
  .ends-selector {
    display: flex;
    gap: 6px;
    animation: fadeSlideIn var(--duration-emphasis) ease;
  }

  .ends-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target);
    padding: 8px 10px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .ends-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  @media (hover: hover) and (pointer: fine) {
    .ends-btn:hover:not(.active) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .visual-pane,
    .ends-selector {
      animation: none;
    }
  }
</style>

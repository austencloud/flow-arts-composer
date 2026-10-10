<!--
  SimpleTrailControls.svelte

  2026 Bento Box Design - Trail presets
  - Off/Subtle/Vivid preset selector
  - Bilateral prop toggle for both ends vs single end
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { onMount } from "svelte";
  import {
    animationSettings,
    TrailMode,
    TrackingMode,
  } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import {
    getAnimationVisibilityManager,
    type TrailVisibility,
  } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { isBilateralProp, getBilateralEndLabels } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  const animationVisibilityManager = getAnimationVisibilityManager();
  const settingsState = settingsService;

  interface Props {
    /** @deprecated Use leftPropType and rightPropType instead */
    propType?: PropType | string | null;
    leftPropType?: PropType | string | null;
    rightPropType?: PropType | string | null;
  }

  let {
    propType = null,
    leftPropType = null,
    rightPropType = null,
  }: Props = $props();

  // Fall back to user's global settings when props not explicitly provided
  const effectiveLeftPropType = $derived(
    leftPropType ?? propType ?? settingsState.settings.leftPropType ?? null
  );
  const effectiveRightPropType = $derived(
    rightPropType ?? propType ?? settingsState.settings.rightPropType ?? null
  );

  // Check if ANY selected prop is bilateral (staff, buugeng, etc.)
  // Toggle shown when at least one prop has trackable ends
  const showBilateralToggle = $derived.by(() => {
    const leftIsBilateral = effectiveLeftPropType != null && isBilateralProp(effectiveLeftPropType);
    const rightIsBilateral = effectiveRightPropType != null && isBilateralProp(effectiveRightPropType);

    // Show toggle if ANY prop is bilateral
    // (applies to whichever prop has trackable ends)
    return leftIsBilateral || rightIsBilateral;
  });

  // Check tracking mode states
  const isBothEnds = $derived(
    animationSettings.trail.trackingMode === TrackingMode.BOTH_ENDS
  );

  const isLeftEnd = $derived(
    animationSettings.trail.trackingMode === TrackingMode.LEFT_END
  );

  const isRightEnd = $derived(
    animationSettings.trail.trackingMode === TrackingMode.RIGHT_END
  );

  // Get prop-specific labels for the ends (e.g., "Thumb"/"Pinky" for staff)
  const endLabels = $derived.by((): [string, string] => {
    const propToCheck = effectiveLeftPropType ?? effectiveRightPropType;
    if (propToCheck && isBilateralProp(propToCheck)) {
      const localizeEnd = (label: string): string => {
        switch (label) {
          case "Pinky": return t("animation_trail_pinky");
          case "Thumb": return t("animation_trail_thumb");
          case "Knob": return t("animation_trail_knob");
          case "Bulb": return t("animation_trail_bulb");
          default: return label;
        }
      };
      const [left, right] = getBilateralEndLabels(propToCheck);
      return [localizeEnd(left), localizeEnd(right)];
    }
    return [t("animation_trail_end_one"), t("animation_trail_end_two")];
  });

  // Get current trail visibility from visibility manager (global state)
  function isTrailsActive(): boolean {
    const tipMap = animationVisibilityManager.effectsConfigState?.tipEffectMap ?? {};
    return Object.values(tipMap).some(a => a.effect === "trails");
  }
  let currentPreset = $state<TrailVisibility>(isTrailsActive() ? "on" : "off");

  // Register as observer to get notified when trail style changes
  onMount(() => {
    const handleVisibilityChange = () => {
      currentPreset = isTrailsActive() ? "on" : "off";
    };

    animationVisibilityManager.registerObserver(handleVisibilityChange);

    return () => {
      animationVisibilityManager.unregisterObserver(handleVisibilityChange);
    };
  });

  // Only show the bilateral toggle when trails are enabled
  const showEndToggle = $derived(
    showBilateralToggle && currentPreset !== "off"
  );

  function setPreset(preset: TrailVisibility) {
    // Update global visibility state
    animationVisibilityManager.setActiveEffect(preset === "on" ? "trails" : "none");

    // Apply trail settings - hardcoded vivid style when enabled
    if (preset === "off") {
      animationSettings.setTrailMode(TrailMode.OFF);
    } else {
      // "on" - use hardcoded vivid settings
      animationSettings.setTrailMode(TrailMode.FADE);
      animationSettings.setFadeDuration(2500);
      animationSettings.setTrailAppearance({
        lineWidth: 3.5,
        maxOpacity: 0.95,
      });
    }
  }

  function setTrackingMode(mode: TrackingMode) {
    animationSettings.setTrackingMode(mode);
  }
</script>

<div class="trail-controls">
  <span class="label">{t("animation_trails")}</span>
  <div class="preset-buttons">
    <button
      class="preset-btn"
      class:active={currentPreset === "off"}
      onclick={() => setPreset("off")}
      type="button"
      aria-label={t("animation_trails_off_aria")}
    >
      {t("effect_deep_off")}
    </button>
    <button
      class="preset-btn"
      class:active={currentPreset === "on"}
      onclick={() => setPreset("on")}
      type="button"
      aria-label={t("animation_trails_on_aria")}
    >
      {t("animation_on")}
    </button>
  </div>

  {#if showEndToggle}
    <div class="ends-selector">
      <button
        class="ends-btn"
        class:active={isLeftEnd}
        onclick={() => setTrackingMode(TrackingMode.LEFT_END)}
        type="button"
        title={t("animation_trail_track_end_only", { end: endLabels[0] })}
        aria-label={t("animation_trail_track_end_only", { end: endLabels[0] })}
      >
        <span class="ends-label">{endLabels[0]}</span>
      </button>
      <button
        class="ends-btn both"
        class:active={isBothEnds}
        onclick={() => setTrackingMode(TrackingMode.BOTH_ENDS)}
        type="button"
        title={t("animation_trail_track_both_ends")}
        aria-label={t("animation_trail_track_both_ends")}
      >
        <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
      </button>
      <button
        class="ends-btn"
        class:active={isRightEnd}
        onclick={() => setTrackingMode(TrackingMode.RIGHT_END)}
        type="button"
        title={t("animation_trail_track_end_only", { end: endLabels[1] })}
        aria-label={t("animation_trail_track_end_only", { end: endLabels[1] })}
      >
        <span class="ends-label">{endLabels[1]}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  /* ===========================
     2026 BENTO BOX DESIGN
     Trail Controls
     =========================== */

  .trail-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 14px;
  }

  .label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .preset-buttons {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  .preset-btn {
    flex: 1;
    min-height: var(--min-touch-target);
    padding: 8px 12px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 10px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .preset-btn:not(.active):hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
      transform: translateY(-1px);
    }
  }

  .preset-btn:active {
    transform: scale(0.97);
  }

  .preset-btn.active {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 22%,
          transparent
        )
        0%,
      color-mix(in srgb, var(--theme-accent-strong) 18%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 55%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 35%,
      white
    );
    box-shadow:
      0 2px 12px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 22%,
          transparent
        ),
      0 0 16px
        color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 16%,
          transparent
        ),
      inset 0 1px 0 var(--theme-stroke);
  }


  .ends-selector {
    display: flex;
    gap: 4px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 10px;
    padding: 4px;
  }

  .ends-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(var(--min-touch-target) - 8px);
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
  }

  .ends-btn i {
    font-size: var(--font-size-sm);
  }

  .ends-label {
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .ends-btn.both {
    padding: 6px 8px;
  }

  @media (hover: hover) and (pointer: fine) {
    .ends-btn:not(.active):hover {
      background: var(--theme-card-hover-bg);
      color: var(--theme-text);
    }
  }

  .ends-btn:active {
    transform: scale(0.97);
  }

  .ends-btn.active {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 28%,
          transparent
        )
        0%,
      color-mix(in srgb, var(--theme-accent-strong) 22%, transparent) 100%
    );
    color: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 35%,
      white
    );
    box-shadow:
      0 1px 4px
        color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 18%,
          transparent
        );
  }


  @media (prefers-reduced-motion: reduce) {
    .preset-btn,
    .ends-btn {
      transition: none;
    }

    .preset-btn:hover,
    .preset-btn:active,
    .ends-btn:hover,
    .ends-btn:active {
      transform: none;
    }
  }
</style>

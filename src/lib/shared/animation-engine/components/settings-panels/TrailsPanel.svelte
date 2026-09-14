<script lang="ts">
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { resolveTrailColors } from "../../domain/resolve-trail-colors";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { animationSettings } from "../../state/animation-settings-state.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import {
    TrackingMode,
    TAIL_LENGTH_MIN,
    TAIL_LENGTH_MAX,
    DEFAULT_TRAIL_SETTINGS,
  } from "../../domain/types/trail-types";
  import { isBilateralProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  const settingsState = settingsService;
  const effectsConfig = getEffectsConfigContext();

  const hasBilateralProp = $derived.by(() => {
    const left = settingsState.settings.leftPropType;
    const right = settingsState.settings.rightPropType;
    const leftIsBilateral = left != null && isBilateralProp(left);
    const rightIsBilateral = right != null && isBilateralProp(right);
    return leftIsBilateral || rightIsBilateral;
  });

  const trackingOptions = $derived.by(() => {
    const pt = animationSettings.currentPropType?.toLowerCase() ?? "staff";

    let leftLabel: string;
    let rightLabel: string;

    if (pt === "staff") {
      leftLabel = "Pinky";
      rightLabel = "Thumb";
    } else if (pt === "bigclub") {
      leftLabel = "Knob";
      rightLabel = "Bulb";
    } else {
      leftLabel = "End 1";
      rightLabel = "End 2";
    }

    // Prop-end options track the prop's tips; Hand tracks the hand path
    // (prop center) instead. Mirrors the canvas right-click Trail Tracking menu.
    return [
      { id: TrackingMode.LEFT_END, label: leftLabel, icon: "fa-minus" },
      { id: TrackingMode.RIGHT_END, label: rightLabel, icon: "fa-minus" },
      { id: TrackingMode.BOTH_ENDS, label: "Both", icon: "fa-grip-lines" },
      { id: TrackingMode.HAND, label: "Hand", icon: "fa-hand-back-fist" },
    ];
  });

  let storedTrackingMode = $derived(animationSettings.trail.trackingMode);

  let trackingMode = $derived(
    hasBilateralProp ? storedTrackingMode : TrackingMode.RIGHT_END
  );

  // Visual props — owned by EffectsConfigState
  const lineWidth = $derived(
    effectsConfig?.trails.thickness ?? DEFAULT_EFFECTS_CONFIG.trails.thickness
  );
  const maxOpacity = $derived(
    effectsConfig?.trails.brightness ?? DEFAULT_EFFECTS_CONFIG.trails.brightness
  );
  const displayColors = $derived(resolveTrailColors({
    ...DEFAULT_TRAIL_SETTINGS,
    leftColor: effectsConfig?.trails.leftColor ?? DEFAULT_EFFECTS_CONFIG.trails.leftColor,
    rightColor: effectsConfig?.trails.rightColor ?? DEFAULT_EFFECTS_CONFIG.trails.rightColor,
  }, getSettings().primaryPropColors));
  const leftColor = $derived(displayColors.leftColor);
  const rightColor = $derived(displayColors.rightColor);

  // Rendering params — stay in animationSettings
  const tailLength = $derived(animationSettings.trail.tailLength);

  const defaultLeft = getMotionColor(HandSide.LEFT, "dark");
  const defaultRight = getMotionColor(HandSide.RIGHT, "dark");

  function formatWidth(v: number): string {
    return v.toFixed(1);
  }

  function formatBrightness(v: number): string {
    return `${Math.round(v * 100)}%`;
  }

  const isDefault = $derived(
    Math.abs(lineWidth - DEFAULT_EFFECTS_CONFIG.trails.thickness) < 0.2 &&
      Math.abs(maxOpacity - DEFAULT_EFFECTS_CONFIG.trails.brightness) < 0.03 &&
      tailLength === DEFAULT_TRAIL_SETTINGS.tailLength &&
      trackingMode === DEFAULT_TRAIL_SETTINGS.trackingMode &&
      leftColor === (getSettings().primaryPropColors?.left ?? defaultLeft) &&
      rightColor === (getSettings().primaryPropColors?.right ?? defaultRight)
  );

  function resetDefaults(): void {
    effectsConfig?.updateEffect("trails", {
      thickness: DEFAULT_EFFECTS_CONFIG.trails.thickness,
      brightness: DEFAULT_EFFECTS_CONFIG.trails.brightness,
      leftColor: defaultLeft,
      rightColor: defaultRight,
    });
    animationSettings.setTailLength(DEFAULT_TRAIL_SETTINGS.tailLength);
    animationSettings.setTrackingMode(DEFAULT_TRAIL_SETTINGS.trackingMode);
  }
</script>

<div class="trails-controls">
  {#if hasBilateralProp}
    <div class="option-row">
      <span class="option-label">Tracking</span>
      <div
        class="chip-group"
        role="radiogroup"
        aria-label="Trail tracking mode"
      >
        {#each trackingOptions as option}
          <button
            class="chip"
            class:active={trackingMode === option.id}
            type="button"
            role="radio"
            aria-checked={trackingMode === option.id}
            onclick={() => animationSettings.setTrackingMode(option.id)}
          >
            <i class="fas {option.icon}" aria-hidden="true"></i>
            {option.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="slider-row">
    <label for="ctx-trail-width">Thickness</label>
    <input
      id="ctx-trail-width"
      type="range"
      min="1"
      max="12"
      step="0.5"
      value={lineWidth}
      oninput={(e) =>
        effectsConfig?.updateEffect("trails", {
          thickness: Number((e.target as HTMLInputElement).value),
        })}
    />
    <span class="slider-value">{formatWidth(lineWidth)}</span>
  </div>

  <div class="slider-row">
    <label for="ctx-trail-brightness">Brightness</label>
    <input
      id="ctx-trail-brightness"
      type="range"
      min="0.3"
      max="1"
      step="0.05"
      value={maxOpacity}
      oninput={(e) => {
        const v = Number((e.target as HTMLInputElement).value);
        effectsConfig?.updateEffect("trails", { brightness: v });
      }}
    />
    <span class="slider-value">{formatBrightness(maxOpacity)}</span>
  </div>

  <div class="slider-row">
    <label for="ctx-trail-length">Tail length</label>
    <input
      id="ctx-trail-length"
      type="range"
      min={TAIL_LENGTH_MIN}
      max={TAIL_LENGTH_MAX}
      step="5"
      value={tailLength}
      oninput={(e) =>
        animationSettings.setTailLength(
          Number((e.target as HTMLInputElement).value)
        )}
    />
    <span class="slider-value">{tailLength}</span>
  </div>

  <div class="color-row">
    <span class="color-label">Colors</span>
    <div class="color-pickers">
      <label class="color-picker">
        <input
          type="color"
          value={leftColor}
          oninput={(e) =>
            effectsConfig?.updateEffect("trails", {
              leftColor: (e.target as HTMLInputElement).value,
            })}
        />
        <span class="color-hand blue">Left</span>
      </label>
      <label class="color-picker">
        <input
          type="color"
          value={rightColor}
          oninput={(e) =>
            effectsConfig?.updateEffect("trails", {
              rightColor: (e.target as HTMLInputElement).value,
            })}
        />
        <span class="color-hand red">Right</span>
      </label>
    </div>
  </div>

  <button
    class="reset-btn"
    type="button"
    disabled={isDefault}
    onclick={resetDefaults}
  >
    Reset
  </button>
</div>

<style>
  .trails-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .option-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .option-label {
    min-width: 56px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .chip-group {
    display: flex;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .chip {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 8px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .chip:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .chip.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: var(--theme-accent, #8b5cf6);
    color: var(--theme-text, white);
  }

  .chip:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .chip i {
    font-size: 14px;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .slider-row label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--theme-accent, #8b5cf6);
  }

  .slider-value {
    min-width: 32px;
    text-align: right;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, white);
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .color-label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .color-pickers {
    display: flex;
    gap: 12px;
    flex: 1;
  }

  .color-picker {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .color-picker input[type="color"] {
    -webkit-appearance: none;
    appearance: none;
    width: 32px;
    height: 32px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    background: none;
    cursor: pointer;
    padding: 0;
  }

  .color-picker input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .color-picker input[type="color"]::-moz-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .color-hand {
    font-size: var(--font-size-compact, 12px);
  }

  .color-hand.blue {
    color: var(--prop-blue, #3b82f6);
  }

  .color-hand.red {
    color: var(--prop-red, #ef4444);
  }

  .reset-btn {
    align-self: flex-end;
    padding: 4px 12px;
    min-height: 32px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
  }

  .reset-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text, white);
  }

  .reset-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .reset-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .reset-btn {
      transition: none;
    }
  }
</style>

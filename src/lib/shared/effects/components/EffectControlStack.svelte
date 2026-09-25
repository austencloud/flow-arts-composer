<script lang="ts">
  /**
   * EffectControlStack - renders an effect's control descriptors (from the
   * shared manifest) into the canonical primitives. Both the 2D effects panel
   * and the 3D viewer's panel mount this against the same EffectsConfigState,
   * so the manifest is the single source of truth. Each mount names its view,
   * which hides the few controls whose field only the other view's renderer
   * reads.
   *
   * Single-selects route to the shared SegmentedControl (chip-primitives rule);
   * sliders/colors centralize the inline markup the 2D panels repeated (there is
   * no shared input-component library). Toggles use the button + indicator
   * pattern (no checkboxes).
   */
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type {
    EffectsConfigState,
    EffectId,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    controlsForView,
    resolveEffectControlOptions,
    type ControlTier,
    type EffectView,
  } from "$lib/shared/effects/domain/effect-control-manifest";
  import {
    formatEffectSliderValue,
    type EffectControlOverrides,
  } from "$lib/shared/effects/effect-control-fields";

  interface Props {
    effect: EffectId;
    config: EffectsConfigState;
    /** Which picture these controls tune. A control tagged for the other view
     *  is left out, since this view's renderer ignores its field. */
    view: EffectView;
    /** Which tiers to render. Default = the Primary view. */
    tiers?: ControlTier[];
    /** Render ONLY these control ids (overrides `tiers`). Used by the tune-strip
     *  drill-down to show one knob at a time. */
    only?: string[];
    /** Drop each control's inline label + collapse its column. The tune-strip's
     *  selected knob chip already names the control, so the label is redundant
     *  and the reclaimed width lets segmented controls fit the narrow tray. */
    hideLabel?: boolean;
    /** Prop whose end names should appear in tracking controls. */
    propType?: string | null;
    /** Per-field get/set overrides for controls whose value does NOT live on
     *  effectsConfig[effect] (e.g. Trails' tailLength / trackingMode live in the
     *  separate animationSettings.trail store). Keyed by descriptor `field`. The
     *  host builds these — it is the layer that legitimately knows both stores,
     *  so the manifest and this component stay store-agnostic. */
    overrides?: EffectControlOverrides;
    onSettingChange?: (
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean
    ) => void;
  }
  let {
    effect,
    config,
    view,
    tiers = ["primary", "tracking"],
    only,
    hideLabel = false,
    propType = null,
    overrides,
    onSettingChange,
  }: Props = $props();

  const intent = $derived(
    config.effect(effect) as unknown as Record<string, unknown>
  );
  // showWhen conditions read the merged view so cross-store fields gate correctly.
  const intentView = $derived(
    overrides
      ? {
          ...intent,
          ...Object.fromEntries(
            Object.entries(overrides).map(([k, o]) => [k, o.get()])
          ),
        }
      : intent
  );
  const controls = $derived(
    controlsForView(effect, view).filter(
      (c) =>
        (only ? only.includes(c.id) : tiers.includes(c.tier)) &&
        (!c.showWhen || c.showWhen(intentView))
    )
  );

  function get(field: string): unknown {
    return overrides?.[field] ? overrides[field].get() : intent[field];
  }
  type SettingValue = string | number | boolean | null;
  function isSettingValue(value: unknown): value is SettingValue {
    return (
      value === null || ["string", "number", "boolean"].includes(typeof value)
    );
  }
  function set(field: string, value: unknown, coalesce = false) {
    const previous = get(field);
    if (overrides?.[field]) {
      overrides[field].set(value);
    } else {
      config.updateEffect(effect, { [field]: value } as never);
    }
    if (
      isSettingValue(previous) &&
      isSettingValue(value) &&
      previous !== value
    ) {
      onSettingChange?.(field, previous, value, coalesce);
    }
  }
</script>

<div class="control-stack" class:hide-label={hideLabel}>
  {#each controls as c (c.id)}
    {#if c.type === "slider"}
      <div class="ctl-row">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <input
          type="range"
          min={c.min}
          max={c.max}
          step={c.step}
          value={get(c.field) as number}
          oninput={(e) => set(c.field, parseFloat(e.currentTarget.value), true)}
          class="ctl-slider"
        />
        <span class="ctl-value">{formatEffectSliderValue(c, get(c.field))}</span
        >
      </div>
    {:else if c.type === "segmented"}
      {@const opts = resolveEffectControlOptions(c, propType)}
      <div class="ctl-row ctl-row-wide">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <SegmentedControl
          options={opts}
          value={get(c.field) as string}
          onchange={(v) => set(c.field, v)}
          color="accent"
          size="sm"
        />
      </div>
    {:else if c.type === "palette"}
      <div class="ctl-row ctl-row-wide">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <div class="ctl-options" role="radiogroup" aria-label={c.label}>
          {#each c.paletteOptions ?? [] as option (option.value)}
            <button
              type="button"
              class="ctl-option"
              class:active={get(c.field) === option.value}
              role="radio"
              aria-checked={get(c.field) === option.value}
              onclick={() => set(c.field, option.value)}
            >
              {#if option.swatch}
                <span
                  class="ctl-option-swatch"
                  style:background={option.swatch}
                  aria-hidden="true"
                ></span>
              {/if}
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else if c.type === "toggle"}
      <div class="ctl-row">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <button
          type="button"
          class="ctl-toggle"
          class:on={get(c.field) === true}
          aria-pressed={get(c.field) === true}
          aria-label={c.label}
          onclick={() => set(c.field, !(get(c.field) as boolean))}
        >
          <span class="ctl-toggle-dot"></span>
        </button>
      </div>
    {:else if c.type === "chip"}
      <div class="ctl-row ctl-row-wide">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <button
          type="button"
          class="ctl-chip"
          class:active={get(c.field) === true}
          aria-pressed={get(c.field) === true}
          aria-label={c.label}
          onclick={() => set(c.field, !(get(c.field) as boolean))}
        >
          {#if c.swatch === "rainbow"}
            <span class="swatch rainbow" aria-hidden="true"></span>
          {/if}
          {c.label}
        </button>
      </div>
    {:else if c.type === "color"}
      <div class="ctl-row">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <label class="ctl-color">
          <input
            type="color"
            value={get(c.field) as string}
            oninput={(e) => set(c.field, e.currentTarget.value, true)}
          />
        </label>
      </div>
    {:else if c.type === "colorPair"}
      <div class="ctl-row">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <div class="ctl-pair">
          <label class="ctl-color">
            <input
              type="color"
              value={get(c.pairFields![0]) as string}
              oninput={(e) =>
                set(c.pairFields![0], e.currentTarget.value, true)}
            />
          </label>
          <label class="ctl-color">
            <input
              type="color"
              value={get(c.pairFields![1]) as string}
              oninput={(e) =>
                set(c.pairFields![1], e.currentTarget.value, true)}
            />
          </label>
        </div>
      </div>
    {:else if c.type === "paletteSwatches"}
      <div class="ctl-row ctl-row-wide">
        {#if !hideLabel}<span class="ctl-label">{c.label}</span>{/if}
        <div class="ctl-swatches">
          {#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
            <label class="ctl-color">
              <input
                type="color"
                value={((get(c.field) as string[]) ?? [])[i] ?? "#ffffff"}
                oninput={(e) => {
                  const arr = [...((get(c.field) as string[]) ?? [])];
                  const previous = arr[i] ?? "#ffffff";
                  while (arr.length <= i) arr.push("#ffffff");
                  arr[i] = e.currentTarget.value;
                  set(c.field, arr);
                  if (previous !== e.currentTarget.value) {
                    onSettingChange?.(
                      `${c.field}_${i + 1}`,
                      previous,
                      e.currentTarget.value,
                      true
                    );
                  }
                }}
              />
            </label>
          {/each}
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .control-stack {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    container: effect-controls / inline-size;
  }

  .ctl-row {
    display: grid;
    /* minmax(0, …) lets the control column shrink below its content's intrinsic
       width — without it a wide SegmentedControl overflows narrow containers
       (e.g. the mobile tune-strip tray) instead of compressing. */
    grid-template-columns: 4.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  /* Segmented/palette rows let the control take the full remaining width. */
  .ctl-row-wide {
    grid-template-columns: 4.5rem minmax(0, 1fr);
  }

  /* hideLabel (tune-strip): the knob chip already names the control, so drop the
     label column and give the control the full width — segmented controls then
     fit the narrow phone tray with room to spare. */
  .hide-label .ctl-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .hide-label .ctl-row-wide {
    grid-template-columns: minmax(0, 1fr);
  }

  .ctl-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim);
  }

  /* Named palettes have too many meaningful choices for a compressed slider
     indicator. A small option grid keeps every name readable and selectable. */
  .ctl-options {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .ctl-option {
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 9px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .ctl-option:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .ctl-option.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      transparent
    );
    color: var(--theme-text, white);
  }

  .ctl-option:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .ctl-option-swatch {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    border-radius: 50%;
  }

  /* The phone tuner reveals one control at a time. Keep its palette on one
     scrollable rail so choosing a color does not push the canvas upward. */
  .hide-label .ctl-options {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .hide-label .ctl-options::-webkit-scrollbar {
    display: none;
  }

  .hide-label .ctl-option {
    flex: 0 0 auto;
    padding-inline: 12px;
  }

  /* paletteSwatches: a compact row of round color wells. */
  .ctl-swatches {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .ctl-slider {
    width: 100%;
    height: 6px;
    appearance: none;
    background: var(--theme-panel-bg);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  .ctl-slider::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--theme-accent, #4a9eff);
    border-radius: 50%;
    cursor: pointer;
  }
  .ctl-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--theme-accent, #4a9eff);
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .ctl-value {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text);
    text-align: right;
    font-variant-numeric: tabular-nums;
    min-width: 3ch;
  }

  .ctl-color {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid var(--theme-stroke);
  }
  .ctl-color input {
    width: 150%;
    height: 150%;
    margin: -25%;
    border: none;
    padding: 0;
    background: none;
    cursor: pointer;
  }

  .ctl-pair {
    display: flex;
    gap: 0.4rem;
  }

  /* Rainbow chip — the same chip the 2D EffectsPanel preset strip uses, so the
     boolean reads as a selectable chip rather than an iOS pill squashed to the
     touch-target floor. */
  .ctl-chip {
    justify-self: start;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: all var(--duration-fast, 0.15s) ease;
  }
  .ctl-chip:hover {
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
  }
  .ctl-chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      transparent
    );
    border-color: var(--theme-accent, #4a9eff);
    color: var(--theme-text);
  }
  .ctl-chip .swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  /* Literal spectrum hexes — these preview the rainbow itself, not UI chrome. */
  .ctl-chip .swatch.rainbow {
    background: conic-gradient(
      from 0deg,
      #ef4444,
      #f59e0b,
      #eab308,
      #22c55e,
      #06b6d4,
      #3b82f6,
      #8b5cf6,
      #ef4444
    );
  }

  .ctl-toggle {
    width: 40px;
    height: 22px;
    border-radius: 11px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-panel-bg);
    position: relative;
    cursor: pointer;
    padding: 0;
  }
  .ctl-toggle.on {
    background: var(--theme-accent, #4a9eff);
    border-color: var(--theme-accent, #4a9eff);
  }
  .ctl-toggle-dot {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: left var(--duration-fast, 0.15s);
  }
  .ctl-toggle.on .ctl-toggle-dot {
    left: 20px;
  }

  @container effect-controls (max-width: 24rem) {
    .ctl-row-wide {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
  }
</style>

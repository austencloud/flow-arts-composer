<script lang="ts">
  /**
   * EffectTuneStrip — the mobile "drill-down" tuner. Instead of stacking every
   * knob (which eats the canvas), it shows the effect's controls as a compact
   * horizontal strip of chips — each with its LIVE value — and reveals only the
   * ONE control you tap, beneath the strip. The animation canvas keeps the
   * screen; you scrub one knob at a time, Instagram-editor style.
   *
   * Data-driven off the shared EFFECT_CONTROLS manifest, so the strip is every
   * control for its view (essentials + advanced alike — the strip scrolls, so
   * there is no Advanced fold to hide anything). The active control is rendered
   * by the same EffectControlStack the 3D viewer uses (`only` = one id).
   */
  import type {
    EffectsConfigState,
    EffectId,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    controlsForView,
    type ControlDescriptor,
    type EffectView,
  } from "$lib/shared/effects/domain/effect-control-manifest";
  import {
    formatEffectSliderValue,
    type EffectControlOverrides,
  } from "$lib/shared/effects/effect-control-fields";
  import EffectControlStack from "./EffectControlStack.svelte";

  interface Props {
    effectId: EffectId;
    config: EffectsConfigState;
    /** Which picture these controls tune; see EffectControlStack. */
    view: EffectView;
    /** Prop whose end names should appear in tracking controls. */
    propType?: string | null;
    /** Cross-store field get/set overrides (e.g. Trails' animationSettings
     *  fields). Passed straight through to EffectControlStack; also used here so
     *  chip values + conditional visibility read the right source. */
    overrides?: EffectControlOverrides;
    onSettingChange?: (
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean
    ) => void;
  }
  let {
    effectId,
    config,
    view,
    propType = null,
    overrides,
    onSettingChange,
  }: Props = $props();

  const intent = $derived(
    config.effect(effectId) as unknown as Record<string, unknown>
  );
  /** Read a field from its override store if present, else the effect config. */
  function readField(field: string): unknown {
    return overrides?.[field] ? overrides[field].get() : intent[field];
  }
  // Merged view so conditional visibility + chip values see cross-store fields.
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
  // Every mobile-safe manifest control whose conditional visibility is currently
  // satisfied. The full desktop inspector also exposes fine optical controls
  // whose compact flag is false.
  const controls = $derived(
    controlsForView(effectId, view).filter(
      (c) => c.compact !== false && (!c.showWhen || c.showWhen(intentView))
    )
  );

  // The tapped knob, or the first knob when nothing is tapped yet / the tapped
  // one fell away (e.g. its showWhen went false). Pure derivation — no $effect.
  let tappedId = $state<string | null>(null);
  const selectedId = $derived(
    tappedId && controls.some((c) => c.id === tappedId)
      ? tappedId
      : (controls[0]?.id ?? null)
  );
  const active = $derived(controls.find((c) => c.id === selectedId) ?? null);

  /** Compact live value for a knob chip (so all state is readable at a glance). */
  function chipValue(c: ControlDescriptor): string {
    const v = readField(c.field);
    switch (c.type) {
      case "slider": {
        return formatEffectSliderValue(c, v);
      }
      case "segmented":
        return c.options?.find((o) => o.value === v)?.label ?? "";
      case "palette":
        return c.paletteOptions?.find((o) => o.value === v)?.label ?? "";
      case "toggle":
      case "chip":
        return v === true ? "On" : "Off";
      default:
        return "";
    }
  }

  /** Leading colour dots for the colour knobs, so the chip previews the hue. */
  function chipSwatches(c: ControlDescriptor): string[] {
    if (c.type === "color") return [readField(c.field) as string];
    if (c.type === "colorPair" && c.pairFields)
      return [
        readField(c.pairFields[0]) as string,
        readField(c.pairFields[1]) as string,
      ];
    if (c.type === "paletteSwatches")
      return ((readField(c.field) as string[]) ?? []).slice(0, 4);
    return [];
  }
</script>

<div class="tune-strip">
  <div class="knobs" role="tablist" aria-label="{effectId} controls">
    {#each controls as c (c.id)}
      {@const swatches = chipSwatches(c)}
      {@const val = chipValue(c)}
      <button
        type="button"
        class="knob"
        class:active={c.id === selectedId}
        role="tab"
        aria-selected={c.id === selectedId}
        onclick={() => (tappedId = c.id)}
      >
        {#if swatches.length}
          <span class="knob-swatches" aria-hidden="true">
            {#each swatches as s}<span class="dot" style:background={s}
              ></span>{/each}
          </span>
        {/if}
        <span class="knob-label">{c.label}</span>
        {#if val}<span class="knob-value">{val}</span>{/if}
      </button>
    {/each}
  </div>

  {#if active}
    <div class="active-control">
      <EffectControlStack
        effect={effectId}
        {config}
        {view}
        {propType}
        {overrides}
        only={[active.id]}
        hideLabel
        {onSettingChange}
      />
    </div>
  {/if}
</div>

<style>
  .tune-strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* The crossfade tray hugs its content's width by design, so a horizontal
       knob rail would inflate the whole tray to the rail's max-content and
       escape the phone frame. `contain: inline-size` makes this box derive its
       width from layout (the tray) rather than its contents, so the rail scrolls
       instead. Height still hugs content, so the tray keeps auto-sizing. */
    contain: inline-size;
    min-width: 0;
    width: 100%;
  }

  /* Horizontal, scrollable knob rail — one chip per control, each with its live
     value. No wrap: it scrolls, so any number of knobs stays a single row.
     min-width:0 is load-bearing — without it the rail's max-content forces the
     whole tray wider than the phone. */
  .knobs {
    display: flex;
    gap: 6px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 2px;
    scroll-snap-type: x proximity;
    /* Fade the right edge so a clipped chip reads as "scroll for more" rather
       than "cut off". Harmless when the rail fits (fades empty track). */
    -webkit-mask-image: linear-gradient(
      to right,
      #000 calc(100% - 22px),
      transparent
    );
    mask-image: linear-gradient(to right, #000 calc(100% - 22px), transparent);
  }
  .knobs::-webkit-scrollbar {
    display: none;
  }

  .knob {
    flex: 0 0 auto;
    scroll-snap-align: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
    transition: all 150ms ease;
  }
  .knob:hover {
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }
  .knob.active {
    background: color-mix(in srgb, var(--fx-accent, #4a9eff) 18%, transparent);
    border-color: color-mix(
      in srgb,
      var(--fx-accent, #4a9eff) 55%,
      transparent
    );
    color: var(--fx-accent-text, #c5ddff);
  }
  .knob:focus-visible {
    outline: 2px solid var(--fx-accent, #4a9eff);
    outline-offset: 2px;
  }

  .knob-value {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, #fff);
    opacity: 0.85;
  }
  .knob.active .knob-value {
    color: var(--fx-accent-text, #c5ddff);
    opacity: 1;
  }

  .knob-swatches {
    display: inline-flex;
    gap: 2px;
  }
  .knob-swatches .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }

  /* The one revealed control. Min-height reserves the slot so switching knobs
     (slider ↔ segmented ↔ colour) doesn't jump the canvas above. */
  .active-control {
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .knob {
      transition: none;
    }
  }
</style>

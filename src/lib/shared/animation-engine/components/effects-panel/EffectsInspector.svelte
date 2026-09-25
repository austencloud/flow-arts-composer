<script lang="ts">
  import type {
    EffectId,
    EffectsConfigState,
  } from "$lib/shared/effects/state/effects-config-state.svelte";
  import type { EffectControlOverrides } from "$lib/shared/effects/effect-control-fields";
  import {
    advancedControls,
    primaryControls,
  } from "$lib/shared/effects/domain/effect-control-manifest";
  import EffectControlStack from "$lib/shared/effects/components/EffectControlStack.svelte";
  import EffectPresetsSection from "./EffectPresetsSection.svelte";
  import type { EffectRegistration } from "./effect-registry";

  type SettingValue = string | number | boolean | null;

  interface Props {
    effect: EffectId;
    registration: EffectRegistration;
    config: EffectsConfigState;
    activePresetId: string | null;
    defaultChipId: string;
    customChipId: string;
    customDisabled: boolean;
    customColors: { left: string; right: string } | null;
    summary: string;
    propType?: string | null;
    overrides?: EffectControlOverrides;
    onBack: () => void;
    onDisable: () => void;
    onSelectPreset: (presetId: string) => void;
    onSettingChange?: (
      setting: string,
      previousValue: SettingValue,
      value: SettingValue,
      coalesce?: boolean
    ) => void;
  }

  let {
    effect,
    registration,
    config,
    activePresetId,
    defaultChipId,
    customChipId,
    customDisabled,
    customColors,
    summary,
    propType = null,
    overrides,
    onBack,
    onDisable,
    onSelectPreset,
    onSettingChange,
  }: Props = $props();

  let fineTuningOpen = $state(false);
  // This inspector tunes the 2D canvas, so every manifest read asks for the 2D
  // view's controls.
  const fineControls = $derived(advancedControls(effect, "2d"));
  const hasLooks = $derived(registration.presetGroup.presets.length > 0);

  // Some effects have nothing the flat-field manifest can address — LED's
  // device, strip pattern, and shutter are structured config, not scalars, so
  // its manifest entry is deliberately empty. Those effects ship a hand-built
  // panel instead, and without this the section rendered its title over an
  // empty stack.
  //
  // Loaded through a derived promise rather than `$effect`: this component has
  // a prop named `effect`, and inside it `$effect` parses as a store
  // subscription, not the rune.
  const usesRichPanel = $derived(primaryControls(effect, "2d").length === 0);
  const richPanel = $derived(
    usesRichPanel ? registration.customizeComponent() : null
  );
</script>

<div
  class="inspector"
  class:fine-open={fineTuningOpen}
  style:--effect-accent={registration.meta.color}
  style:--effect-accent-soft={`${registration.meta.color}22`}
>
  <header class="inspector-header">
    <button class="back-action" type="button" onclick={onBack}>
      <span class="back-arrow" aria-hidden="true">
        <i class="fas fa-arrow-left"></i>
      </span>
      <span>All effects</span>
    </button>

    <span class="effect-identity">
      <span class="effect-icon" aria-hidden="true">
        <i class="fas {registration.meta.icon}"></i>
      </span>
      <span class="effect-name">{registration.meta.label}</span>
    </span>

    <button
      class="off-action"
      type="button"
      onclick={onDisable}
      aria-label="Turn off {registration.meta.label}"
    >
      <i class="fas fa-power-off" aria-hidden="true"></i>
      <span>Off</span>
    </button>
  </header>

  {#if hasLooks}
    <section class="inspector-section looks-section">
      <EffectPresetsSection
        presetGroup={registration.presetGroup}
        {activePresetId}
        {defaultChipId}
        {customChipId}
        {customDisabled}
        {customColors}
        {onSelectPreset}
        effectLabel={registration.meta.label}
        accentColor={registration.meta.color}
        {summary}
        showSummary={false}
        showCustomize={false}
      />
    </section>
  {/if}

  <div class="tuning-column">
    <section class="inspector-section tune-section">
      <!-- No help line here. Every control in this section already writes to
           the canvas the instant it moves, so saying so cost a row of height
           and told the user nothing they were not about to see. -->
      <span class="section-title">Tune the look</span>
      {#if richPanel}
        {#await richPanel then mod}
          {@const Panel = mod.default}
          <Panel {onBack} embedded />
        {/await}
      {:else}
        <EffectControlStack
          {effect}
          {config}
          view="2d"
          tiers={["primary", "tracking"]}
          {propType}
          {overrides}
          {onSettingChange}
        />
      {/if}
    </section>

    {#if fineControls.length > 0}
      <section class="inspector-section fine-section">
        <button
          class="fine-toggle"
          class:open={fineTuningOpen}
          type="button"
          aria-expanded={fineTuningOpen}
          onclick={() => (fineTuningOpen = !fineTuningOpen)}
        >
          <span class="fine-copy">
            <span class="section-title">Fine tuning</span>
            <span class="section-help">
              {fineControls.length}
              {fineControls.length === 1 ? "control" : "controls"}
            </span>
          </span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>

        {#if fineTuningOpen}
          <div class="fine-controls">
            <EffectControlStack
              {effect}
              {config}
              view="2d"
              tiers={["advanced"]}
              {propType}
              {overrides}
              {onSettingChange}
            />
          </div>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    min-width: 0;
    container: effect-inspector / inline-size;
    --theme-accent: var(--effect-accent);
  }

  .inspector-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "identity identity"
      "back off";
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
  }

  .back-action,
  .off-action {
    min-height: var(--min-touch-target, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 13px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 100ms) ease,
      background var(--duration-fast, 100ms) ease,
      color var(--duration-fast, 100ms) ease;
  }

  /* Leaving the inspector is the one thing you reach for blind, so it is not
     styled like its neighbour: accent-tinted at rest, a circular arrow badge
     for a target the eye lands on without hunting, and a wider hit area. */
  .back-action {
    grid-area: back;
    justify-self: start;
    gap: 0.5rem;
    padding: 0 0.875rem 0 0.4375rem;
    border-color: color-mix(in srgb, var(--effect-accent) 38%, transparent);
    background: var(--effect-accent-soft);
    font-size: 0.9375rem;
  }

  .back-arrow {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--effect-accent) 24%, transparent);
    color: var(--effect-accent);
    font-size: 0.875rem;
  }

  .back-arrow i {
    transition: transform var(--duration-fast, 100ms) ease;
  }

  .back-action:hover {
    border-color: color-mix(in srgb, var(--effect-accent) 62%, transparent);
    background: color-mix(in srgb, var(--effect-accent) 18%, transparent);
    color: var(--theme-text, white);
  }

  .back-action:hover .back-arrow {
    background: color-mix(in srgb, var(--effect-accent) 40%, transparent);
  }

  .back-action:hover .back-arrow i {
    transform: translateX(-2px);
  }

  .off-action {
    grid-area: off;
    justify-self: end;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .off-action:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-danger, #ef4444) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-danger, #ef4444) 9%,
      transparent
    );
    color: var(--semantic-danger, #ef4444);
  }

  .back-action:focus-visible,
  .off-action:focus-visible,
  .fine-toggle:focus-visible {
    outline: 2px solid var(--effect-accent);
    outline-offset: 2px;
  }

  .effect-identity {
    grid-area: identity;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
    min-width: 0;
  }

  /* Which effect am I in? The glyph answers that before the word does, so it
     is sized to be read at a glance rather than to sit politely beside the
     label - a full accent ring plus a tinted field, never a bar down one edge
     (no-left-edge-accent-bar.md). */
  .effect-icon {
    width: 3.25rem;
    height: 3.25rem;
    flex: 0 0 3.25rem;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--effect-accent) 55%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--effect-accent) 16%, transparent);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--effect-accent) 16%, transparent) inset;
    color: var(--effect-accent);
    font-size: 1.5rem;
  }

  .effect-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text, white);
    font-size: clamp(18px, 1.45vw, 22px);
    font-weight: 750;
    line-height: 1.1;
  }

  .inspector-section {
    padding: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
  }

  .tune-section {
    display: grid;
    gap: 14px;
  }

  .tuning-column {
    display: contents;
  }

  .looks-section {
    border-top: 0;
  }

  .fine-copy {
    display: grid;
    gap: 2px;
  }

  .section-title {
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 720;
    line-height: 1.2;
  }

  .section-help {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.3;
  }

  .fine-section {
    padding: 0;
  }

  .fine-toggle {
    width: 100%;
    min-height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 16px;
    border: 0;
    background: transparent;
    color: var(--theme-text, white);
    text-align: left;
    cursor: pointer;
  }

  .fine-toggle:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
  }

  .fine-toggle i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    transition: transform var(--duration-fast, 100ms) ease;
  }

  .fine-toggle.open i {
    transform: rotate(180deg);
  }

  .fine-controls {
    padding: 0 16px 16px;
  }

  @container effect-inspector (max-width: 26rem) {
    .off-action span {
      display: none;
    }

    .off-action {
      width: var(--min-touch-target, 44px);
      padding: 0;
    }
  }

  /* 27rem, not 32rem. The sidebar inspector is ~30rem, so the wider seam never
     fired there and the header spent two rows - 129px - on three controls that
     fit one 78px row. That reclaimed height is what keeps the whole inspector
     on one screen. */
  @container effect-inspector (min-width: 27rem) {
    .inspector-header {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: "back identity off";
    }

    .effect-identity {
      justify-content: center;
    }
  }

  /* Once the panel is wide enough, the look gallery sits BESIDE the controls
     instead of above them, so the inspector's height becomes the taller of the
     two columns rather than their sum. That is what lets every effect - Goo's
     seven looks, Pulse's palette grid - fit one screen without scrolling.

     Keyed off the panel's own container rather than Post Studio's, so every
     host that gives the panel this much width gets the composition. The cards
     stay vertical at this first seam; their previews are still readable. */
  @container effects-panel (min-width: 35rem) {
    .inspector {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(15rem, 0.92fr);
      grid-template-areas:
        "header header"
        "looks tuning";
      align-items: start;
    }

    .inspector-header {
      grid-area: header;
    }

    .looks-section {
      grid-area: looks;
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.07));
    }

    .tuning-column {
      grid-area: tuning;
      display: flex;
      flex-direction: column;
      min-width: 0;
      align-self: start;
    }

    .tune-section {
      border-top: 0;
    }

    .inspector-section {
      padding: 18px 20px;
    }

    /* Re-assert what .fine-section already says outside this block. The rule
       above lands later in source order at equal specificity, so without this
       the fine-tuning row paid 36px of section padding on top of the padding
       its own button already carries - a doubled inset, and the 30px that put
       Pulse over the fold at 1920x1080. */
    .fine-section {
      padding: 0;
    }

    .fine-toggle {
      padding-inline: 20px;
    }

    .looks-section :global(.anchor-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .fine-controls {
      padding-inline: 20px;
    }
  }

  /* A larger inspector turns each look into a horizontal study while keeping
     the same gallery-and-controls composition. */
  @container effects-panel (min-width: 52rem) {
    .inspector {
      grid-template-columns: minmax(0, 1.12fr) minmax(20rem, 0.88fr);
    }

    .looks-section :global(.preset-grid) {
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .looks-section :global(.preset-card) {
      display: grid;
      grid-template-columns: minmax(13rem, 1.45fr) minmax(8rem, 0.55fr);
      grid-template-rows: auto 1fr;
      align-items: center;
      column-gap: 14px;
      row-gap: 4px;
      padding: 10px;
    }

    .looks-section :global(.preview-area) {
      grid-column: 1;
      grid-row: 1 / span 2;
    }

    .looks-section :global(.preset-name),
    .looks-section :global(.preset-trait) {
      grid-column: 2;
    }

    .looks-section :global(.preset-name) {
      align-self: end;
    }

    .looks-section :global(.preset-trait) {
      align-self: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-action,
    .off-action,
    .back-arrow i,
    .fine-toggle i {
      transition: none;
    }

    .back-action:hover .back-arrow i {
      transform: none;
    }
  }
</style>

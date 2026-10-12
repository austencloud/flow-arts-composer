<!--
GenerationStylePanel.svelte - shared 3-axis generation style control

Used by Generate and Fuse so both tools expose one style vocabulary and policy.

Each axis is a SegmentedControl radio group: the selected option carries the
control's sliding indicator, so the choice reads at a glance, and arrow keys
move between options. The untouched option of each axis is marked "Default"
under its name. Fuse's other recipe fields use the same control, so its Style
section now matches them.

Two arrangements. `list` (default, Fuse and the Style screen): from 36rem of
panel width each axis lays out as a row, name and hint on the left and the
control on the right; narrower, the hint sits above the control. `columns`
(the Customize overview's Style tile): from 42rem the three axes stand side by
side, name over control over hint; narrower, it falls back to the stacked
list.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type {
    GenerationDashChoice,
    GenerationMotionTypeFilter,
    GenerationStyleAxis,
    GenerationStylePolicy,
  } from "#lib/shared/create/domain/generation-style.js";
  import {
    GENERATION_DASH_OPTIONS,
    GENERATION_STYLE_OPTIONS,
  } from "#lib/shared/create/domain/generation-style-display.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  let {
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    baseline,
    haptic,
    onPropsChange,
    onHandsChange,
    onDashesChange,
    arrangement = "list",
  }: {
    constraintPreset: GenerationStyleAxis;
    handPathMode: GenerationStyleAxis;
    motionTypeFilter: GenerationMotionTypeFilter;
    /**
     * The untouched value of each axis, marked in the row so the baseline is
     * visible. Without it, Props defaulting to Smooth while Hands and Dashes
     * default to Mixed is invisible, and a summary reading "Props: Mixed" with
     * all three showing Mixed looks arbitrary.
     */
    baseline?: GenerationStylePolicy;
    haptic: HapticFeedback | null;
    onPropsChange: (v: GenerationStyleAxis) => void;
    onHandsChange: (v: GenerationStyleAxis) => void;
    onDashesChange: (v: GenerationDashChoice) => void;
    /** `columns` puts the three axes side by side when there is room. */
    arrangement?: "list" | "columns";
  } = $props();

  const uid = $props.id();

  let currentDashValue = $derived.by((): GenerationDashChoice => {
    if (motionTypeFilter === "no-dash") return "no-dash";
    if (motionTypeFilter === "prefer-dash") return "prefer-dash";
    return "mixed";
  });

  // Which option is the untouched one, per axis. null when no baseline was
  // given, which leaves no option marked.
  const defaultProps = $derived(baseline?.constraintPreset ?? null);
  const defaultHands = $derived(baseline?.handPathMode ?? null);
  const defaultDashes = $derived.by((): GenerationDashChoice | null => {
    if (!baseline) return null;
    const f = baseline.motionTypeFilter;
    return f === "no-dash" || f === "prefer-dash" ? f : "mixed";
  });

  // Read inside the derived so the labels follow a language change.
  const styleOptions = $derived(
    GENERATION_STYLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
  );
  const dashOptions = $derived(
    GENERATION_DASH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
  );

  function labelOf(
    options: readonly { value: string; label: string }[],
    value: string
  ): string {
    return options.find((o) => o.value === value)?.label ?? value;
  }

  function handleProps(v: GenerationStyleAxis) {
    haptic?.trigger("selection");
    onPropsChange(v);
  }

  function handleHands(v: GenerationStyleAxis) {
    haptic?.trigger("selection");
    onHandsChange(v);
  }

  function handleDashes(v: GenerationDashChoice) {
    haptic?.trigger("selection");
    onDashesChange(v);
  }
</script>

<!-- The marker hangs under the name without taking part in the layout, so
     every name sits on the same centre line whether or not it is marked, and
     moving the selection never changes a segment's height. -->
{#snippet optionBody(label: string, isDefault: boolean)}
  <span class="option-body">
    <span class="option-label">{label}</span>
    <span class="option-default" class:shown={isDefault}
      >{t("create_ui_default")}</span
    >
  </span>
{/snippet}

{#snippet propsOption(value: GenerationStyleAxis)}
  {@render optionBody(labelOf(styleOptions, value), defaultProps === value)}
{/snippet}

{#snippet handsOption(value: GenerationStyleAxis)}
  {@render optionBody(labelOf(styleOptions, value), defaultHands === value)}
{/snippet}

{#snippet dashesOption(value: GenerationDashChoice)}
  {@render optionBody(labelOf(dashOptions, value), defaultDashes === value)}
{/snippet}

<!-- Every hint variant is stacked in one grid cell so the hint box is always
     as tall as its longest line; switching options cannot move the axes
     below it. -->
{#snippet hint(
  options: readonly { value: string; hint: string }[],
  current: string
)}
  <span class="style-hint">
    {#each options as opt (opt.value)}
      <span class="hint-layer" class:live={current === opt.value}
        >{opt.hint}</span
      >
    {/each}
  </span>
{/snippet}

<div class="style-panel" class:columns={arrangement === "columns"}>
  <div class="style-axes">
    <section class="style-axis">
      <span class="axis-name" id="{uid}-props">{t("create_ui_props")}</span>
      {@render hint(GENERATION_STYLE_OPTIONS, constraintPreset)}
      <SegmentedControl
        options={styleOptions}
        value={constraintPreset}
        onchange={handleProps}
        color="accent"
        semantics="radiogroup"
        ariaLabelledby="{uid}-props"
        optionContent={propsOption}
      />
    </section>

    <section class="style-axis">
      <span class="axis-name" id="{uid}-hands">{t("create_ui_hands")}</span>
      {@render hint(GENERATION_STYLE_OPTIONS, handPathMode)}
      <SegmentedControl
        options={styleOptions}
        value={handPathMode}
        onchange={handleHands}
        color="accent"
        semantics="radiogroup"
        ariaLabelledby="{uid}-hands"
        optionContent={handsOption}
      />
    </section>

    <section class="style-axis">
      <span class="axis-name" id="{uid}-dashes">{t("create_ui_dashes")}</span>
      {@render hint(GENERATION_DASH_OPTIONS, currentDashValue)}
      <SegmentedControl
        options={dashOptions}
        value={currentDashValue}
        onchange={handleDashes}
        color="accent"
        semantics="radiogroup"
        ariaLabelledby="{uid}-dashes"
        optionContent={dashesOption}
      />
    </section>
  </div>
</div>

<style>
  /* The outer box is the container the layout asks about; the inner one is
     what changes shape. A container cannot restyle itself from its own width. */
  .style-panel {
    container: generation-style / inline-size;
    width: 100%;
  }

  .style-axes {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 46rem;
    margin-inline: auto;
  }

  /* Three placed parts, so each arrangement can order them without touching
     the markup: name, hint and the control. */
  .style-axis {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "name"
      "hint"
      "control";
    row-gap: 0.25rem;
    padding-block: 1rem;
  }

  .axis-name {
    grid-area: name;
  }

  .style-hint {
    grid-area: hint;
    margin-bottom: 0.375rem;
  }

  .style-axis > :global(.segmented-control) {
    grid-area: control;
  }

  .style-axis + .style-axis {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .style-axis:first-child {
    padding-top: 0.25rem;
  }

  .axis-name {
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
    line-height: 1.25;
    color: var(--theme-text, white);
  }

  /* Ghost-sizer stack: all variants share one cell, so the box is sized to the
     tallest and only the live one is painted. */
  .style-hint {
    display: grid;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .hint-layer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .hint-layer.live {
    visibility: visible;
  }

  .option-body {
    position: relative;
    display: block;
    line-height: 1.2;
  }

  .option-label {
    font-weight: 600;
  }

  .option-default {
    position: absolute;
    top: calc(100% + 0.125rem);
    left: 50%;
    translate: -50% 0;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    white-space: nowrap;
    visibility: hidden;
    opacity: 0.8;
  }

  .option-default.shown {
    visibility: visible;
  }

  .style-axis :global(.segment) {
    min-height: 3.5rem;
  }

  .style-axis :global(.segment.selected) {
    color: var(--theme-text, white);
  }

  @container generation-style (min-width: 36rem) {
    .style-panel:not(.columns) .style-axis {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
      grid-template-areas:
        "name control"
        "hint control";
      align-items: center;
      column-gap: 1.5rem;
      padding-block: 1.125rem;
    }
  }

  /* Side by side: name over control over hint, no rules between axes. */
  @container generation-style (min-width: 42rem) {
    .columns .style-axes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 1rem;
      max-width: none;
    }

    .columns .style-axis {
      grid-template-areas:
        "name"
        "control"
        "hint";
      align-content: start;
      padding-block: 0;
      border-top: 0;
    }

    .columns .style-hint {
      margin-top: 0.375rem;
      margin-bottom: 0;
    }
  }
</style>

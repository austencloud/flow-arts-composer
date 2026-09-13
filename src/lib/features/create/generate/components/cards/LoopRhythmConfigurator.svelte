<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    LOOP_COMPONENTS,
    LOOPComponent,
  } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import {
    REFLECTION_AXIS_DETAILS,
    REFLECTION_AXIS_OPTIONS,
    type LoopRhythmValue,
  } from "./loop-expanded-overlay-model";
  import { effectiveInversionInterval } from "$lib/shared/create/services/loop-type-utils";

  interface Props {
    component: LOOPComponent;
    rhythm: LoopRhythmValue;
    inversionCaption: string;
    statusReason?: string;
    idPrefix?: string;
    onChange: (updates: Partial<LoopRhythmValue>) => void;
  }

  const props: Props = $props();
  const idPrefix = $derived(props.idPrefix ?? "loop");
  const componentColor = $derived(
    LOOP_COMPONENTS.find((info) => info.component === props.component)?.color ??
      "#36c3ff"
  );
  const reflectionAxisDetail = $derived(
    REFLECTION_AXIS_DETAILS[props.rhythm.reflectionAxis]
  );
  // "Adds length" has no period-4 orbit — inverting twice restores the original
  // motions, so the generator always uses halfway there. Show the interval the
  // generator will really use and close the option the engine cannot honor,
  // rather than letting the control promise a quarter rhythm it never gets.
  const inversionInterval = $derived(effectiveInversionInterval(props.rhythm));
  const quarterInversionAvailable = $derived(
    props.rhythm.inversionMode === "overlay"
  );
</script>

{#if props.component === LOOPComponent.MIRRORED}
  <div
    class="reflection-axis-picker"
    style="--reflection-color: {componentColor};"
  >
    <div class="axis-heading">
      <span class="axis-title" id={`${idPrefix}-reflection-axis-label`}>
        Reflect across
      </span>
      <span class="axis-selection">{reflectionAxisDetail.name}</span>
    </div>

    {#snippet axisOption(reflectionAxis: LoopRhythmValue["reflectionAxis"])}
      {@const detail = REFLECTION_AXIS_DETAILS[reflectionAxis]}
      <span class="axis-option">
        <svg class="axis-diagram" viewBox="0 0 48 48" aria-hidden="true">
          <circle class="axis-ring" cx="24" cy="24" r="18"></circle>
          <circle class="axis-point" cx="24" cy="6" r="1.8"></circle>
          <circle class="axis-point" cx="37" cy="11" r="1.8"></circle>
          <circle class="axis-point" cx="42" cy="24" r="1.8"></circle>
          <circle class="axis-point" cx="37" cy="37" r="1.8"></circle>
          <circle class="axis-point" cx="24" cy="42" r="1.8"></circle>
          <circle class="axis-point" cx="11" cy="37" r="1.8"></circle>
          <circle class="axis-point" cx="6" cy="24" r="1.8"></circle>
          <circle class="axis-point" cx="11" cy="11" r="1.8"></circle>
          <line
            class="axis-line"
            x1={detail.line.x1}
            y1={detail.line.y1}
            x2={detail.line.x2}
            y2={detail.line.y2}
          ></line>
        </svg>
        <span class="axis-option-label">{detail.axisLabel}</span>
        <span class="axis-option-name">{detail.name}</span>
      </span>
    {/snippet}

    <SegmentedControl
      options={REFLECTION_AXIS_OPTIONS}
      value={props.rhythm.reflectionAxis}
      onchange={(reflectionAxis) => props.onChange({ reflectionAxis })}
      size="sm"
      color="accent"
      semantics="radiogroup"
      ariaLabelledby={`${idPrefix}-reflection-axis-label`}
      optionContent={axisOption}
    />

    <div class="axis-caption" aria-live="polite">
      <span class="axis-caption-sizer" aria-hidden="true">
        NE and SW stay fixed. North trades with east; south trades with west.
      </span>
      <span class="axis-caption-live">{reflectionAxisDetail.description}</span>
    </div>
  </div>
{:else if props.component === LOOPComponent.ROTATED}
  <div
    class="owned-configurator rotation-configurator"
    style="--owner-color: {componentColor};"
  >
    <div class="configurator-heading">
      <span class="configurator-title" id={`${idPrefix}-rotation-period-label`}>
        Rotation period
      </span>
      <span class="configurator-selection">
        {props.rhythm.rotationInterval === 4 ? "Quartered" : "Halved"}
      </span>
    </div>
    <SegmentedControl
      options={[
        { value: "2", label: "Halved" },
        { value: "4", label: "Quartered" },
      ]}
      value={String(props.rhythm.rotationInterval)}
      onchange={(value) =>
        props.onChange({ rotationInterval: value === "4" ? 4 : 2 })}
      size="sm"
      color="accent"
      semantics="radiogroup"
      ariaLabelledby={`${idPrefix}-rotation-period-label`}
    />
    <div class="configurator-caption" aria-live="polite">
      <span class="configurator-caption-sizer" aria-hidden="true">
        Positions rotate 90° at every quarter.
      </span>
      <span class="configurator-caption-live">
        {props.rhythm.rotationInterval === 4
          ? "Positions rotate 90° at every quarter."
          : "Positions rotate 180° at halfway."}
      </span>
    </div>
  </div>
{:else if props.component === LOOPComponent.INVERTED}
  <div
    class="owned-configurator inversion-configurator"
    style="--owner-color: {componentColor};"
  >
    <div class="configurator-row">
      <div class="configurator-heading">
        <span
          class="configurator-title"
          id={`${idPrefix}-inversion-timing-label`}>Invert when</span
        >
        <span class="configurator-selection">
          {inversionInterval === 4 ? "Every quarter" : "At halfway"}
        </span>
      </div>
      <SegmentedControl
        options={[
          { value: "2", label: "At halfway" },
          {
            value: "4",
            label: "Every quarter",
            disabled: !quarterInversionAvailable,
          },
        ]}
        value={String(inversionInterval)}
        onchange={(value) =>
          props.onChange({ inversionInterval: value === "4" ? 4 : 2 })}
        size="sm"
        color="accent"
        semantics="radiogroup"
        ariaLabelledby={`${idPrefix}-inversion-timing-label`}
      />
    </div>

    <div class="configurator-row">
      <span class="configurator-title" id={`${idPrefix}-inversion-length-label`}
        >Build the sequence</span
      >
      <SegmentedControl
        options={[
          { value: "expand", label: "Adds length" },
          { value: "overlay", label: "On top" },
        ]}
        value={props.rhythm.inversionMode}
        onchange={(inversionMode) => props.onChange({ inversionMode })}
        size="sm"
        color="accent"
        semantics="radiogroup"
        ariaLabelledby={`${idPrefix}-inversion-length-label`}
      />
    </div>

    <div class="configurator-caption">
      <span class="configurator-caption-sizer" aria-hidden="true">
        Same hand positions — props flip spin direction for the second half.
      </span>
      <span class="configurator-caption-live">{props.inversionCaption}</span>
    </div>
  </div>
{/if}

{#if props.statusReason}
  <div class="loop-rhythm-status" role="status">{props.statusReason}</div>
{/if}

<style>
  .owned-configurator {
    --theme-accent: var(--owner-color);
    --theme-card-bg: color-mix(
      in srgb,
      var(--owner-color) 18%,
      var(--theme-panel-bg, #18152a)
    );
    --theme-card-hover-bg: color-mix(
      in srgb,
      var(--owner-color) 25%,
      var(--theme-panel-bg, #18152a)
    );
    --theme-stroke: color-mix(in srgb, var(--owner-color) 48%, transparent);
    --theme-text-dim: color-mix(
      in srgb,
      var(--theme-text, white) 72%,
      var(--owner-color)
    );

    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid
      color-mix(in srgb, var(--owner-color) 42%, transparent);
  }

  .configurator-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .configurator-heading,
  .axis-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .configurator-title,
  .axis-title {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
  }

  .configurator-selection {
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--owner-color) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--owner-color) 32%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
  }

  .configurator-caption,
  .axis-caption {
    display: grid;
    padding: 8px 10px;
    border-radius: 0 8px 8px 0;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #18152a) 36%,
      transparent
    );
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }

  .configurator-caption {
    border-left: 3px solid var(--owner-color);
  }

  .configurator-caption-sizer,
  .configurator-caption-live,
  .axis-caption-sizer,
  .axis-caption-live {
    grid-area: 1 / 1;
  }

  .configurator-caption-sizer,
  .axis-caption-sizer {
    visibility: hidden;
  }

  .reflection-axis-picker {
    --theme-accent: var(--reflection-color);
    --theme-card-bg: color-mix(
      in srgb,
      var(--reflection-color) 18%,
      var(--theme-panel-bg, #18152a)
    );
    --theme-card-hover-bg: color-mix(
      in srgb,
      var(--reflection-color) 24%,
      var(--theme-panel-bg, #18152a)
    );
    --theme-stroke: color-mix(
      in srgb,
      var(--reflection-color) 48%,
      transparent
    );
    --theme-text-dim: color-mix(
      in srgb,
      var(--theme-text, white) 72%,
      var(--reflection-color)
    );

    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid
      color-mix(in srgb, var(--reflection-color) 42%, transparent);
  }

  .axis-selection {
    width: 8ch;
    padding: 3px 8px;
    border: 1px solid
      color-mix(in srgb, var(--reflection-color) 70%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--reflection-color) 32%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-align: center;
  }

  .axis-option {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding-block: 3px;
  }

  .axis-diagram {
    width: clamp(28px, 8cqw, 36px);
    height: clamp(28px, 8cqw, 36px);
    margin-bottom: 2px;
    overflow: visible;
  }

  .axis-ring {
    fill: color-mix(in srgb, currentColor 8%, transparent);
    stroke: currentColor;
    stroke-width: 1;
    opacity: 0.38;
  }

  .axis-point {
    fill: currentColor;
    opacity: 0.48;
  }

  .axis-line {
    stroke: currentColor;
    stroke-width: 3.5;
    stroke-linecap: round;
    filter: drop-shadow(0 0 3px currentColor);
  }

  .axis-option-label,
  .axis-option-name {
    color: currentColor;
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .axis-option-label {
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .axis-option-name {
    font-weight: 600;
    opacity: 0.72;
  }

  .axis-caption {
    border-left: 3px solid var(--reflection-color);
    font-size: var(--font-size-sm, 14px);
  }

  .loop-rhythm-status {
    flex-shrink: 0;
    padding: 6px 10px;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning) 50%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--semantic-warning) 20%, transparent);
    color: var(--semantic-warning);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-align: center;
  }
</style>

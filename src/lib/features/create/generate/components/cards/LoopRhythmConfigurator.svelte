<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { LOOPComponent } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import {
    REFLECTION_AXIS_DETAILS,
    REFLECTION_AXIS_OPTIONS,
    type LoopRhythmValue,
    type ReflectionAxisOption,
  } from "./loop-expanded-overlay-model";
  import { effectiveInversionInterval } from "$lib/shared/create/services/loop-type-utils";

  interface Props {
    component: LOOPComponent;
    rhythm: LoopRhythmValue;
    inversionCaption: string;
    statusReason?: string;
    idPrefix?: string;
    /** Axis choices with the hand mode's veto applied. Defaults to every axis. */
    reflectionAxisOptions?: ReflectionAxisOption[];
    /** False closes Quartered (reflection hand modes only survive halved). */
    quarteredAvailable?: boolean;
    onChange: (updates: Partial<LoopRhythmValue>) => void;
  }

  const props: Props = $props();
  const idPrefix = $derived(props.idPrefix ?? "loop");
  const reflectionDescription = $derived(
    t(
      (
        {
          "north-south": "create_deep_axis_ns_description",
          "east-west": "create_deep_axis_ew_description",
          "northeast-southwest": "create_deep_axis_nesw_description",
          "northwest-southeast": "create_deep_axis_nwse_description",
        } as const
      )[props.rhythm.reflectionAxis]
    )
  );
  const localizedAxisOptions = $derived(
    (props.reflectionAxisOptions ?? REFLECTION_AXIS_OPTIONS).map((option) => {
      const name =
        option.value === "north-south"
          ? t("generator_loop_mirrored")
          : option.value === "east-west"
            ? t("generator_loop_flipped")
            : t("create_deep_diagonal");
      const description = t(
        (
          {
            "north-south": "create_deep_axis_ns_description",
            "east-west": "create_deep_axis_ew_description",
            "northeast-southwest": "create_deep_axis_nesw_description",
            "northwest-southeast": "create_deep_axis_nwse_description",
          } as const
        )[option.value]
      );
      return {
        ...option,
        label: t("create_deep_axis_option_label", {
          axis: REFLECTION_AXIS_DETAILS[option.value].axisLabel,
          name,
        }),
        ariaLabel: t("create_deep_axis_option_aria", {
          axis: REFLECTION_AXIS_DETAILS[option.value].axisLabel,
          name,
          description,
        }),
      };
    })
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
  <div class="reflection-axis-picker">
    <div class="axis-heading">
      <span class="axis-title" id={`${idPrefix}-reflection-axis-label`}>
        {t("create_deep_reflect_across")}
      </span>
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
        <span class="axis-option-name"
          >{reflectionAxis === "north-south"
            ? t("generator_loop_mirrored")
            : reflectionAxis === "east-west"
              ? t("generator_loop_flipped")
              : t("create_deep_diagonal")}</span
        >
      </span>
    {/snippet}

    <SegmentedControl
      options={localizedAxisOptions}
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
        {t("create_deep_axis_nesw_description")}
      </span>
      <span class="axis-caption-live">{reflectionDescription}</span>
    </div>
  </div>
{:else if props.component === LOOPComponent.ROTATED}
  <div class="owned-configurator rotation-configurator">
    <div class="configurator-heading">
      <span class="configurator-title" id={`${idPrefix}-rotation-period-label`}>
        {t("create_deep_rotation_period")}
      </span>
    </div>
    <div class="rotation-options">
      <SegmentedControl
        options={[
          { value: "2", label: t("create_deep_halved") },
          {
            value: "4",
            label: t("create_deep_quartered"),
            disabled: !(props.quarteredAvailable ?? true),
          },
        ]}
        value={String(props.rhythm.rotationInterval)}
        onchange={(value) =>
          props.onChange({ rotationInterval: value === "4" ? 4 : 2 })}
        size="sm"
        color="accent"
        semantics="radiogroup"
        ariaLabelledby={`${idPrefix}-rotation-period-label`}
      />
    </div>
    <div class="configurator-caption" aria-live="polite">
      <span class="configurator-caption-sizer" aria-hidden="true">
        {t("create_deep_rotate_quarter_hint")}
      </span>
      <span class="configurator-caption-live">
        {props.rhythm.rotationInterval === 4
          ? t("create_deep_rotate_quarter_hint")
          : t("create_deep_rotate_half_hint")}
      </span>
    </div>
  </div>
{:else if props.component === LOOPComponent.INVERTED}
  <div class="owned-configurator inversion-configurator">
    <div class="configurator-row">
      <div class="configurator-heading">
        <span
          class="configurator-title"
          id={`${idPrefix}-inversion-timing-label`}
          >{t("create_ui_invert_when")}</span
        >
      </div>
      <SegmentedControl
        options={[
          { value: "2", label: t("create_deep_at_halfway") },
          {
            value: "4",
            label: t("create_deep_every_quarter"),
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
        >{t("create_ui_build_the_sequence")}</span
      >
      <SegmentedControl
        options={[
          { value: "expand", label: t("create_deep_adds_length") },
          { value: "overlay", label: t("create_deep_on_top") },
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
        {t("create_deep_inversion_caption_sizer")}
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
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @container (min-width: 430px) {
    .rotation-configurator {
      display: grid;
      align-items: center;
      grid-template-columns: minmax(0, 1fr) minmax(0, 280px);
      gap: 8px 12px;
    }

    .rotation-configurator .configurator-caption {
      grid-column: 1 / -1;
    }
  }

  .configurator-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rotation-options {
    width: min(100%, 280px);
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

  .configurator-caption,
  .axis-caption {
    display: grid;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
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
    display: flex;
    flex-direction: column;
    gap: 10px;
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
    font-size: var(--font-size-sm, 14px);
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
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-align: center;
  }
</style>

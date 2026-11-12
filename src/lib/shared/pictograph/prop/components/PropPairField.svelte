<script lang="ts">
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { getPropTypeDisplayInfo } from "../domain/prop-type-display-registry";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "./PropCompositionPreview.svelte";
  import PropPairDialog from "./PropPairDialog.svelte";
  import PropPairPicker from "./PropPairPicker.svelte";

  let {
    value = $bindable(),
    label = "Save with props",
    hint,
    disabled = false,
    showColors = false,
    fill = false,
    picker = "inline",
  }: {
    value: ResolvedPropConfig;
    label?: string;
    /**
     * One plain sentence shown inside the open picker that says what the
     * saved pair is for. Lives here, next to the choice it explains, instead
     * of as a stray line under the button.
     */
    hint?: string;
    disabled?: boolean;
    /**
     * The picker's account colour control. Off by default: a saved pair is
     * metadata, and the account colours are not saved with it. A field that
     * picks the props the user is looking at turns it on.
     */
    showColors?: boolean;
    /**
     * Span the row like a setting: label at the leading edge, the current
     * pair and chevron at the trailing edge. Off, the button sizes to its
     * label for sitting beside other controls.
     */
    fill?: boolean;
    /**
     * Where the picker opens. `inline` grows it under the button, for a field
     * that already lives in a dialog. `modal` opens it in a fit-sized dialog
     * so a tall prop grid never pushes the surrounding form apart.
     */
    picker?: "inline" | "modal";
  } = $props();
  let choosing = $state(false);
  const pairLabel = $derived(
    value.leftPropType === value.rightPropType
      ? getPropTypeDisplayInfo(value.leftPropType).label
      : `${getPropTypeDisplayInfo(value.leftPropType).label} / ${getPropTypeDisplayInfo(value.rightPropType).label}`
  );

  function pick(next: ResolvedPropConfig): void {
    value = next;
  }
</script>

<div class="prop-pair-field" class:fill>
  <PanelButton
    variant="secondary"
    {disabled}
    fullWidth={fill}
    ariaExpanded={picker === "inline" ? choosing : undefined}
    onclick={() => (choosing = !choosing)}
  >
    <span class="lead">
      <PropCompositionPreview propType={value.leftPropType} size={32} neutral />
      {fill ? label : `${label}:`}
    </span>
    <span class="value">
      {pairLabel}
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </span>
  </PanelButton>
  {#if picker === "inline" && choosing && !disabled}
    <div class="picker" transition:growFade>
      <PropPairPicker
        {value}
        {hint}
        {showColors}
        onPick={pick}
        onDone={() => (choosing = false)}
      />
    </div>
  {/if}
</div>

{#if picker === "modal"}
  <PropPairDialog
    open={choosing && !disabled}
    title={label}
    {value}
    {hint}
    {showColors}
    onclose={() => (choosing = false)}
    onPick={pick}
  />
{/if}

<style>
  /* The button sizes to its label; only the open picker spans the field. */
  .prop-pair-field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
  }

  .lead,
  .value {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* As a row, the button spans the field and reads like the setting rows
     beside it: what it is on the left, what it is set to on the right. */
  .prop-pair-field.fill {
    align-items: stretch;
  }

  .prop-pair-field.fill :global(.panel-btn) {
    justify-content: space-between;
    padding-inline: 14px 16px;
  }

  .prop-pair-field.fill .value {
    flex-shrink: 0;
  }

  .prop-pair-field.fill .value i {
    color: var(--theme-text-dim);
  }

  .picker {
    align-self: stretch;
  }
</style>

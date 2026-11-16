<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "./PropCompositionPreview.svelte";
  import PropPairDialog from "./PropPairDialog.svelte";
  import PropPairPicker from "./PropPairPicker.svelte";

  let {
    value = $bindable(),
    label = t("prop_pair_save_with_props"),
    hint,
    disabled = false,
    showColors = false,
    fill = false,
    row = false,
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
     * A one-line row in a settings group (the phone save screen): a flat
     * face, the current pair truncating before the chevron, and a chevron
     * that points to the picker opening over the screen. Implies `fill`.
     */
    row?: boolean;
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
      ? localizedPropName(value.leftPropType)
      : `${localizedPropName(value.leftPropType)} / ${localizedPropName(value.rightPropType)}`
  );

  function pick(next: ResolvedPropConfig): void {
    value = next;
  }
</script>

<div class="prop-pair-field" class:fill={fill || row} class:row>
  <PanelButton
    variant={row ? "quiet" : "secondary"}
    {disabled}
    fullWidth={fill || row}
    ariaExpanded={picker === "inline" ? choosing : undefined}
    onclick={() => (choosing = !choosing)}
  >
    <span class="lead">
      <PropCompositionPreview propType={value.leftPropType} size={32} neutral />
      <span class="label-text"
        >{fill || row
          ? label
          : t("prop_pair_label_with_colon", { label })}</span
      >
    </span>
    <span class="value">
      <span class="value-text">{pairLabel}</span>
      <i
        class="fas {row ? 'fa-chevron-right' : 'fa-chevron-down'}"
        aria-hidden="true"
      ></i>
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

  /* As a group row, the pair gives way before the label does: it truncates
     ahead of the chevron instead of pushing the row wider than the screen. */
  .prop-pair-field.row .lead {
    flex-shrink: 0;
  }

  .prop-pair-field.row .value {
    flex-shrink: 1;
    min-width: 0;
  }

  .prop-pair-field.row .value-text,
  .prop-pair-field.row .label-text {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .prop-pair-field.row .value-text {
    color: var(--theme-text-dim);
  }

  .prop-pair-field.fill .value i {
    color: var(--theme-text-dim);
  }

  .picker {
    align-self: stretch;
  }
</style>

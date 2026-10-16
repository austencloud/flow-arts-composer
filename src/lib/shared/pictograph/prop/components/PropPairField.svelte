<script lang="ts">
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { getPropTypeDisplayInfo } from "../domain/prop-type-display-registry";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PropCompositionPreview from "./PropCompositionPreview.svelte";

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
  const titleId = $props.id();
  let choosing = $state(false);
  let hand = $state<"both" | "left" | "right">("both");
  const pairLabel = $derived(
    value.leftPropType === value.rightPropType
      ? getPropTypeDisplayInfo(value.leftPropType).label
      : `${getPropTypeDisplayInfo(value.leftPropType).label} / ${getPropTypeDisplayInfo(value.rightPropType).label}`
  );
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
      {@render pickerBody()}
    </div>
  {/if}
</div>

{#if picker === "modal"}
  <BaseModal
    open={choosing && !disabled}
    onclose={() => (choosing = false)}
    size="fit"
    labelledBy={titleId}
  >
    {#snippet header()}<h2 id={titleId}>{label}</h2>{/snippet}
    <div class="picker in-modal">
      {@render pickerBody()}
    </div>
    {#snippet footer()}
      <div class="modal-actions">
        <PanelButton variant="secondary" onclick={() => (choosing = false)}
          >{t("action_cancel")}</PanelButton
        >
      </div>
    {/snippet}
  </BaseModal>
{/if}

{#snippet pickerBody()}
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  <SegmentedControl
    options={[
      { value: "both", label: "Both" },
      { value: "left", label: "Left", tone: "blue" },
      { value: "right", label: "Right", tone: "red" },
    ]}
    value={hand}
    onchange={(next) => (hand = next)}
    ariaLabel="Which props to change"
    semantics="radiogroup"
  />
  <BentoPropGrid
    selectedPropType={hand === "right"
      ? value.rightPropType
      : value.leftPropType}
    variant="inline"
    scrollMode="host"
    showAppearance={false}
    {showColors}
    onSelect={(prop) => {
      const leftPropType = hand === "right" ? value.leftPropType : prop;
      const rightPropType = hand === "left" ? value.rightPropType : prop;
      value = {
        leftPropType,
        rightPropType,
        catDogMode: leftPropType !== rightPropType,
      };
      choosing = false;
    }}
  />
{/snippet}

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
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  .picker.in-modal {
    padding: 0 20px;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    padding: 16px 20px 20px;
  }

  h2 {
    margin: 0;
    padding: 20px;
    font-size: var(--font-size-lg, 18px);
  }

  .hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
</style>

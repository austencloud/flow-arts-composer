<script lang="ts">
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { getPropTypeDisplayInfo } from "../domain/prop-type-display-registry";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PropCompositionPreview from "./PropCompositionPreview.svelte";

  let {
    value = $bindable(),
    label = "Save with props",
    hint,
    disabled = false,
    showColors = false,
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
  } = $props();
  let choosing = $state(false);
  let hand = $state<"both" | "left" | "right">("both");
  const pairLabel = $derived(
    value.leftPropType === value.rightPropType
      ? getPropTypeDisplayInfo(value.leftPropType).label
      : `${getPropTypeDisplayInfo(value.leftPropType).label} / ${getPropTypeDisplayInfo(value.rightPropType).label}`
  );
</script>

<div class="prop-pair-field">
  <PanelButton
    variant="secondary"
    {disabled}
    ariaExpanded={choosing}
    onclick={() => (choosing = !choosing)}
  >
    <PropCompositionPreview propType={value.leftPropType} size={32} neutral />
    {label}: {pairLabel}
    <i class="fas fa-chevron-down" aria-hidden="true"></i>
  </PanelButton>
  {#if choosing && !disabled}
    <div class="picker" transition:growFade>
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
    </div>
  {/if}
</div>

<style>
  /* The button sizes to its label; only the open picker spans the field. */
  .prop-pair-field {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
  }

  .picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-self: stretch;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
</style>

<!--
  PropPairPicker.svelte

  The one place a left and right prop get chosen: Both, Left or Right, then
  the prop grid. It holds no pair of its own. A pick hands the new pair to the
  host, which decides what happens next (a saved field keeps it, the viewing
  props apply it at once). Hosts: PropPairDialog and the viewer's dots menu.
-->
<script lang="ts">
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  let {
    value,
    hint,
    showColors = false,
    dense = false,
    onPick,
  }: {
    value: ResolvedPropConfig;
    /** One plain sentence saying what the chosen pair is for. */
    hint?: string;
    /** The grid's account colour control, for a pair that is on screen. */
    showColors?: boolean;
    /** Every prop at a glance, for a host as narrow as a phone menu. */
    dense?: boolean;
    onPick: (next: ResolvedPropConfig) => void;
  } = $props();

  let hand = $state<"both" | "left" | "right">("both");
</script>

<div class="prop-pair-picker" class:dense>
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  <div class="prop-pair-hands">
    <SegmentedControl
      options={[
        { value: "both", label: t("viewer_ui_both") },
        { value: "left", label: t("viewer_ui_left"), tone: "blue" },
        { value: "right", label: t("viewer_ui_right"), tone: "red" },
      ]}
      value={hand}
      onchange={(next) => (hand = next)}
      ariaLabel={t("prop_pair_which_hand")}
      semantics="radiogroup"
    />
  </div>
  <BentoPropGrid
    selectedPropType={hand === "right"
      ? value.rightPropType
      : value.leftPropType}
    variant="inline"
    scrollMode="host"
    flat={dense}
    showAppearance={false}
    {showColors}
    onSelect={(prop) => {
      const leftPropType = hand === "right" ? value.leftPropType : prop;
      const rightPropType = hand === "left" ? value.rightPropType : prop;
      onPick({
        leftPropType,
        rightPropType,
        catDogMode: leftPropType !== rightPropType,
      });
    }}
  />
</div>

<style>
  .prop-pair-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  /* The host's body already insets the column, so the grid lines up with the
     hand control above it instead of indenting again. Three across leaves
     room for a whole name. */
  .prop-pair-picker.dense {
    gap: 8px;
  }

  .prop-pair-picker.dense :global(.prop-grid-root .grid-scroll) {
    padding: 0;
  }

  .prop-pair-picker.dense :global(.prop-grid-root .flat-grid) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 0;
  }

  .prop-pair-picker.dense :global(.prop-grid-root .flat-grid .prop-button) {
    aspect-ratio: auto;
    padding: 6px 4px;
  }

  /* A whole name, in every host: on two lines rather than cut off. */
  .prop-pair-picker :global(.prop-grid-root .prop-label) {
    overflow: visible;
    line-height: 1.2;
    text-overflow: clip;
    text-wrap: balance;
    white-space: normal;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
</style>

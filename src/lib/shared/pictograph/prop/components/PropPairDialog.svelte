<!--
  PropPairDialog.svelte

  The one prop screen (PropSelectionSheet) opened for a prop pair that a host
  keeps: a saved sequence's props, or the viewing props. Hosts: PropPairField's
  modal mode and the viewing props control. A pick applies at once and never
  closes the screen; the sheet's own X, backdrop, Escape and drag close it.
-->
<script lang="ts">
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import PropSelectionSheet from "#lib/shared/settings/components/tabs/prop-type/PropSelectionSheet.svelte";
  import type { PropHandChoice } from "#lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import {
    appOverlayLayer,
    portal,
  } from "#lib/features/create/generate/components/modals/portal.js";
  import { applyHandPick } from "#lib/shared/settings/components/tabs/prop-type/hand-pick.js";

  let {
    open,
    title,
    value,
    hint,
    showColors = false,
    onclose,
    onclosed,
    onPick,
  }: {
    open: boolean;
    title: string;
    value: ResolvedPropConfig;
    hint?: string;
    showColors?: boolean;
    onclose: () => void;
    /** After the exit, once focus can move. */
    onclosed?: () => void;
    /** Every pick applies at once; the screen stays open. */
    onPick: (next: ResolvedPropConfig) => void;
  } = $props();

  // Opens on Both every time and is never saved.
  let hand = $state<PropHandChoice>("both");
  $effect(() => {
    if (open) hand = "both";
  });
</script>

<!-- Mounted in the app's overlay layer, as Change Prop is: a host such as the
     save panel sits inside boxes that contain fixed children, which would hang
     the sheet from the panel's bottom edge and clip its title. -->
<div use:portal={appOverlayLayer()} class="prop-pair-portal">
  <PropSelectionSheet
    isOpen={open}
    {title}
    subtitle={hint}
    selectedPropType={hand === "right"
      ? value.rightPropType
      : value.leftPropType}
    color={hand === "right" ? "red" : "blue"}
    {showColors}
    handProps={{
      hand,
      leftPropType: value.leftPropType,
      rightPropType: value.rightPropType,
      onHandChange: (next) => (hand = next),
    }}
    onSelect={(prop) => {
      const next = applyHandPick(
        { left: value.leftPropType, right: value.rightPropType },
        hand,
        prop
      );
      onPick({
        leftPropType: next.left,
        rightPropType: next.right,
        catDogMode: next.catDogMode,
      });
    }}
    onOpenChange={(next) => {
      if (!next) onclose();
    }}
    {onclosed}
  />
</div>

<style>
  .prop-pair-portal {
    display: contents;
  }
</style>

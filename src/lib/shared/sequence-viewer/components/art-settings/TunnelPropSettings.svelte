<!-- Tunnel rail Props section: the same BentoPropGrid the 2D Download panel
     uses. The chosen prop goes to onPropChange; the host routes it (Tunnel
     routes it to the addressed hand, the viewer host keeps its own handling).
     The Tunnel creator owns its prop version and saves it with the tunnel, so
     it passes propLook and onPropLookChange. The viewer's Art pane passes
     neither, and the grid edits the account's version. -->
<script lang="ts">
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import HandPropToolbar, {
    type HandPropToolbarProps,
  } from "#lib/shared/settings/components/tabs/prop-type/HandPropToolbar.svelte";
  import type { PropChiralitySeam } from "#lib/shared/settings/components/tabs/prop-type/prop-chirality-seam.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";

  interface Props {
    selectedPropType: PropType;
    onPropChange?: (propType: PropType, look?: PropLook) => void;
    handProps?: HandPropToolbarProps;
    propLook?: PropLook;
    onPropLookChange?: (look: PropLook) => void;
    chirality: PropChiralitySeam;
    dense: boolean;
  }

  let {
    selectedPropType,
    onPropChange,
    handProps,
    propLook,
    onPropLookChange,
    chirality,
    dense,
  }: Props = $props();
</script>

{#if onPropChange && handProps}
  <HandPropToolbar {handProps} />
{/if}
<div class="section-pad" class:dense>
  {#if onPropChange}
    <BentoPropGrid
      {selectedPropType}
      onSelect={onPropChange}
      {propLook}
      {onPropLookChange}
      variant="inline"
      flat
      showColors={false}
      {chirality}
    />
  {/if}
</div>

<style>
  .section-pad {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  /* Mobile dock tray: only gaps and outer paddings collapse, so the tray
     stays compact over the art; controls keep their touch-target floor. */
  .section-pad.dense {
    gap: 8px;
    padding: 2px 2px 6px;
  }
</style>

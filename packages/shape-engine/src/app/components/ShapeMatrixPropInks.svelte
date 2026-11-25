<!--
  Carries the player's prop colours into content portalled out of the engine
  (popovers), where the root's colour names no longer reach. Lays out nothing:
  its children sit in the parent's layout as if it were not there.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { propInkStyle } from "../state/prop-inks.js";

  interface Props {
    /** Defaults to the player's saved colours. */
    colors?: { left: string; right: string } | null;
    children: Snippet;
  }
  let { colors = undefined, children }: Props = $props();
  const style = $derived(
    propInkStyle(colors === undefined ? getSettings().primaryPropColors : colors)
  );
</script>

<div class="prop-inks" {style}>{@render children()}</div>

<style>
  .prop-inks {
    display: contents;
  }
</style>

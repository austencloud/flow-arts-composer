<!--
PreviewPlayChip.svelte

Toggles the animated preview for a browse card.

A tap rather than a hover, deliberately: the animation covers the card's
pictograph sheet, so starting it is a decision the reader makes, not something
that happens to them while the pointer passes through. It also gives touch and
desktop the same gesture instead of long-press-versus-hover.
-->
<script lang="ts">
  import CardChip from "./CardChip.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  const {
    playing,
    onToggle,
  }: {
    playing: boolean;
    onToggle: () => void;
  } = $props();
</script>

<CardChip
  label={tDynamic(
    playing ? "browse_results_stop_animation" : "browse_results_play_animation"
  )}
  title={tDynamic(
    playing ? "browse_results_stop_animation" : "browse_results_play_sequence"
  )}
  pressed={playing}
  onActivate={onToggle}
>
  <i class={playing ? "fas fa-stop" : "fas fa-play"} aria-hidden="true"></i>
</CardChip>

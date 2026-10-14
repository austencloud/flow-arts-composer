<!--
PreviewPlayChip.svelte

Toggles the animated preview for a browse card.

On a mouse the card already plays while the pointer rests on it, so here the
chip mostly reads as "stop". On touch it is the only way to start a preview: a
finger hovers nothing, and a long-press already means "select".
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

<!--
  A hand combination's name in its letter-type colours, as the book prints
  it (2026-10-31, Austen: "make sure that you use the dual color approach for
  type 3 and type 5 like it's supposed to be"): Dual-Shift, Cross-Shift and
  Dual-Dash in two colours, the rest in one. The page title, the switcher and
  the Back and Next labels all draw names through here.
-->
<script lang="ts">
  import type { HandCombination } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { nameSegments } from "./hand-type-switcher";

  let {
    combination,
    darkMode,
    /** Draw every segment in this ink instead (a filled chip). */
    ink = null,
  }: {
    combination: HandCombination;
    darkMode: boolean;
    ink?: ((color: string) => string) | null;
  } = $props();

  const segments = $derived(
    nameSegments(combination, t(combination.name), darkMode)
  );
</script>

<span class="combination-name"
  >{#each segments as segment, i (i)}<span
      style:color={ink ? ink(segment.color) : segment.color}>{segment.text}</span
    >{/each}</span
>

<style>
  .combination-name {
    white-space: nowrap;
  }
</style>

<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    createTimingDirectionState,
    setTimingDirectionState,
  } from "./_state/timing-direction-state.svelte";

  // The page's chosen mode lives here, so the basics, the mode grid and the
  // player read one selection.
  let { children }: { children: Snippet } = $props();
  setTimingDirectionState(createTimingDirectionState());
</script>

{@render children()}

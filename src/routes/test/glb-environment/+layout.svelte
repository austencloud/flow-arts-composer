<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";
  let { children } = $props<{ children: Snippet }>();
  $effect(() => {
    document.getElementById("app-loading")?.remove();
  });
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
{@render children()}

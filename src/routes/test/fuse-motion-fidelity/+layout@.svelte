<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  let { children } = $props<{ children: Snippet }>();

  // This proof route owns the viewport and bypasses product auth/module startup.
  $effect(() => {
    document.getElementById("app-loading")?.remove();
  });
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}

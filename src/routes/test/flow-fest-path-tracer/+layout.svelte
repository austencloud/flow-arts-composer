<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  // This is a focused geospatial authoring surface, not a product module.
  // /test pages never mount the app shell, so this layout clears the boot
  // splash itself.
  let { children } = $props<{ children: Snippet }>();

  $effect(() => {
    document.getElementById("app-loading")?.remove();
  });
</script>

<svelte:head>
  <title>Flow Fest Path Tracer</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}

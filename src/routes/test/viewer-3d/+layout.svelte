<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  // The workbench owns its full viewport and needs none of the product shell,
  // which /test pages never mount, so this layout clears the boot splash
  // itself.
  let { children } = $props<{ children: Snippet }>();

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

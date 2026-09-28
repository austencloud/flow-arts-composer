<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  let { children } = $props<{ children: Snippet }>();

  // /test pages never mount the product shell, so this layout owns removal of
  // the boot splash that the shell normally clears after initialization.
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

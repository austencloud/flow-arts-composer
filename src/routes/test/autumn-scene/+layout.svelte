<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  // The Autumn review route owns a full-screen canvas and no account data.
  // /test pages never mount the product shell, so this layout clears the boot
  // splash itself instead of letting it cover a scene that is already ready.
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

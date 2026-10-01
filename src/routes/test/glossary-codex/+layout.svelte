<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";
  import "../../../styles/tka-font.css";

  // Full-screen lab harness. /test pages never mount the product shell, so
  // this layout clears app.html's boot splash itself.
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

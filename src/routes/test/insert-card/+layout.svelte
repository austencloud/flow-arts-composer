<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../../app.css";

  // This harness renders bare print canvases. Like every /test page, it never
  // mounts the app shell.
  let { children } = $props<{ children: Snippet }>();

  // app.html ships a boot splash that the app shell removes once it mounts.
  // Skipping the shell means nothing removes it, so it covers the harness.
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

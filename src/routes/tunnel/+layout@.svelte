<script lang="ts">
  import type { Snippet } from "svelte";
  import "../../app.css";

  let { children } = $props<{
    children: Snippet;
  }>();
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</svelte:head>

{@render children()}

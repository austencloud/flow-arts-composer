<!--
  Layout for /embed/sequence/[id] only — a sibling of /embed/spinner, which
  keeps its own bare layout untouched.

  Deliberately lighter than /sequence/[id]/+layout.svelte: no BackgroundHost.
  An embed lives in someone else's page at a fixed small size; the animated
  background it renders for the full-page viewer has no room to read as
  anything but visual noise in a few hundred pixels, and costs a canvas the
  iframe doesn't need. Theme tokens still apply so the shell's colors match
  the rest of the product.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { ensureThemeApplied } from "$lib/shared/settings/utils/background-theme-calculator";

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    ensureThemeApplied();
  });
</script>

<svelte:head>
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
  />
  <meta name="theme-color" content="#0f0f1a" />
</svelte:head>

<div class="embed-sequence-layout">
  {@render children()}
</div>

<style>
  .embed-sequence-layout {
    position: relative;
    z-index: 2;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: hidden;
    background: #0b0b14;
  }
</style>

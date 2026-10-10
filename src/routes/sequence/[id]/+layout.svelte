<script lang="ts">
  /**
   * Layout for /sequence/[id]
   *
   * Inherits from root layout to get DI container, auth, analytics,
   * and View Transitions API support. Renders the user's chosen background
   * behind the sequence viewer for a consistent themed experience.
   *
   * Stacking context matches MainApplication.svelte:
   * - position: relative + z-index: 2 creates stacking context
   * - BackgroundHost (position: fixed, z-index: -1) renders below this
   * - background: transparent lets the canvas show through
   */
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { BackgroundType } from "@austencloud/backgrounds";
  import BackgroundHost from "#lib/shared/background/shared/components/BackgroundHost.svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { ensureThemeApplied } from "#lib/shared/settings/utils/background-theme-calculator.js";

  let { children }: { children: Snippet } = $props();

  const settings = $derived(getSettings());

  onMount(() => {
    ensureThemeApplied();
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="theme-color" content="#0f0f1a" />
</svelte:head>

<div class="sequence-route-layout">
  {#if settings.backgroundEnabled}
    <BackgroundHost
      backgroundType={settings.backgroundType || BackgroundType.COSMIC}
      backgroundColor={settings.backgroundColor || "#000000"}
      {...settings.gradientColors
        ? { gradientColors: settings.gradientColors }
        : {}}
      {...settings.gradientDirection !== undefined
        ? { gradientDirection: settings.gradientDirection }
        : {}}
    />
  {/if}

  {@render children()}
</div>

<style>
  .sequence-route-layout {
    /* Match MainApplication.svelte stacking context exactly:
       position: relative + z-index creates the context that lets
       BackgroundHost (fixed, z-index: -1) render below transparent bg */
    position: relative;
    z-index: 2;
    min-height: 100vh;
    min-height: 100dvh;
    overflow: hidden;
    background: transparent;
  }
</style>

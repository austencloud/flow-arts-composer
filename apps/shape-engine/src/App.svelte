<script lang="ts">
  import { onMount } from "svelte";
  import { Capacitor } from "@capacitor/core";
  import { App as NativeApp } from "@capacitor/app";
  import ShapeMatrixApp from "$lib/shared/shape-matrix/app/ShapeMatrixApp.svelte";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import { persistence } from "./persistence";

  let engine: ShapeMatrixApp | undefined;

  onMount(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      if (!engine?.handleBack()) void NativeApp.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  });

  function openSource(event: MouseEvent): void {
    const anchor = (event.target as Element | null)?.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (!href?.startsWith("/") || href.startsWith("//")) return;
    // About's Composer guides live on the website, outside the installed tool.
    anchor.href = new URL(href, "https://tkaflowarts.com").href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
</script>

<svelte:document onclick={openSource} />

<div class="native-app">
  <ShapeMatrixApp variant="standalone" {persistence} bind:this={engine} />
</div>
<ToastContainer />

<style>
  :global(html), :global(body), :global(#app) {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    scrollbar-gutter: auto;
    background: #030719;
  }

  .native-app {
    position: fixed;
    inset: 0;
    padding: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
      var(--safe-area-inset-right, env(safe-area-inset-right, 0px))
      var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
    overflow: hidden;
  }
</style>

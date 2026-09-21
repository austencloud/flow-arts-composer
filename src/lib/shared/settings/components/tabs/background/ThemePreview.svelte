<script lang="ts">
  import {
    BackgroundController,
    type BackgroundType,
  } from "@austencloud/backgrounds";
  import { onMount } from "svelte";

  let { type, fallback }: { type: BackgroundType; fallback: string } = $props();

  let host = $state<HTMLDivElement>();
  let mounted = $state(false);
  let pageHidden = false;
  let reducedMotion = false;
  let requestVersion = 0;
  let freezeFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const controller = new BackgroundController();

  function freezeIfNeeded(): void {
    if (mounted && (pageHidden || reducedMotion)) controller.freeze();
  }

  function freezeWhenCurrent(
    typeToFreeze: BackgroundType,
    version: number
  ): void {
    if (freezeFrame !== null) cancelAnimationFrame(freezeFrame);
    const check = () => {
      if (version !== requestVersion || !mounted) return;
      if (
        controller.isReady() &&
        controller.getCurrentType() === typeToFreeze
      ) {
        freezeFrame = null;
        freezeIfNeeded();
        return;
      }
      freezeFrame = requestAnimationFrame(check);
    };
    freezeFrame = requestAnimationFrame(check);
  }

  async function render(typeToRender: BackgroundType): Promise<void> {
    if (pageHidden) {
      controller.freeze();
      return;
    }
    const version = ++requestVersion;
    controller.unfreeze();
    await controller.setBackground(typeToRender);
    if (version !== requestVersion || !mounted) return;
    if (pageHidden || reducedMotion) freezeWhenCurrent(typeToRender, version);
  }

  onMount(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => {
      reducedMotion = motionQuery.matches;
      void render(type);
    };
    const syncVisibility = () => {
      pageHidden = document.hidden;
      if (pageHidden) {
        controller.freeze();
        return;
      }
      void render(type);
    };

    const frame = requestAnimationFrame(() => {
      if (!host) return;
      mounted = true;
      controller.mount(host);
      controller.setAdaptiveQuality(true);
      controller.setQuality("medium");
      reducedMotion = motionQuery.matches;
      pageHidden = document.hidden;
      void render(type);
      resizeObserver = new ResizeObserver(() => {
        if (!mounted || pageHidden || !reducedMotion) return;
        controller.unfreeze();
        controller.forceRefresh();
        void render(type);
      });
      resizeObserver.observe(host);
    });

    motionQuery.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      cancelAnimationFrame(frame);
      if (freezeFrame !== null) cancelAnimationFrame(freezeFrame);
      resizeObserver?.disconnect();
      resizeObserver = null;
      mounted = false;
      requestVersion += 1;
      motionQuery.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
      controller.unmount();
    };
  });

  $effect(() => {
    if (mounted) void render(type);
  });
</script>

<div
  class="theme-preview"
  bind:this={host}
  style:--preview-fallback={fallback}
  aria-hidden="true"
></div>

<style>
  .theme-preview {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--preview-fallback);
  }

  .theme-preview :global(canvas.background-canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>

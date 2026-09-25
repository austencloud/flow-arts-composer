<script lang="ts">
  /**
   * Hero background cycle: the page swaps its own chrome background so a
   * visitor sees the app retune its interface colors instead of reading a
   * claim that it can. Auto-advances only while the row is on screen, the tab
   * is visible, and motion is welcome; the first visitor tap takes over and
   * the cycle stops for the rest of this mount.
   */
  import { onDestroy } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { BackgroundType } from "@austencloud/backgrounds";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { ANIMATED_BACKGROUNDS } from "$lib/shared/settings/utils/public-page-backgrounds";
  import { marketingBackground } from "$lib/shared/landing/state/marketing-background-state.svelte";

  const ORDER = ["cosmic", "ocean", "autumn", "winter"];
  const options = ORDER.map((type) => {
    const bg = ANIMATED_BACKGROUNDS.find((entry) => entry.type === type)!;
    return {
      value: bg.type as string,
      label: bg.label,
      icon: bg.icon,
      ariaLabel: `${bg.label} background`,
    };
  });

  const CYCLE_MS = 9000;

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  let root = $state<HTMLDivElement | null>(null);
  let onScreen = $state(false);
  let tabVisible = $state(true);
  let visitorChose = $state(false);

  const active = $derived(marketingBackground.type as string);

  function select(value: string): void {
    visitorChose = true;
    marketingBackground.set(value as BackgroundType);
  }

  $effect(() => {
    const node = root;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  });

  $effect(() => {
    const read = () => (tabVisible = document.visibilityState === "visible");
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  });

  $effect(() => {
    if (visitorChose || reduceMotion.current || !onScreen || !tabVisible) return;

    const timer = setInterval(() => {
      const index = ORDER.indexOf(marketingBackground.type as string);
      const next = ORDER[(index + 1) % ORDER.length];
      marketingBackground.set(next as BackgroundType);
    }, CYCLE_MS);

    return () => clearInterval(timer);
  });

  onDestroy(() => marketingBackground.reset());
</script>

<div class="bg-cycle" bind:this={root}>
  <div class="bg-cycle-row">
    <SegmentedControl
      {options}
      value={active}
      onchange={select}
      ariaLabel="Page background"
      color="accent"
      size="sm"
    >
      {#snippet optionContent(value)}
        {@const option = options.find((entry) => entry.value === value)!}
        <span class="bg-option">
          <i class="fas {option.icon}" aria-hidden="true"></i>
          <span>{option.label}</span>
        </span>
      {/snippet}
    </SegmentedControl>
  </div>
  <p class="bg-cycle-note">
    Pick a background. The whole interface follows it.
  </p>
</div>

<style>
  .bg-cycle {
    margin-top: 1rem;
  }

  /* The four segments hold one fixed row, so switching the active option can
     never change the control's footprint or move the caption. */
  .bg-cycle-row {
    display: flex;
    justify-content: center;
    min-height: max(var(--min-touch-target, 48px), 48px);
  }

  /* Four short labels size to their labels, not to the hero column. The
     primitive's width: 100% wins over flex sizing, so cap it here. */
  .bg-cycle-row :global(.segmented-control) {
    width: min(100%, 30rem);
  }

  .bg-cycle-row :global(.segment) {
    min-height: max(var(--min-touch-target, 48px), 48px);
  }

  .bg-option {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .bg-cycle-note {
    margin: 0.6rem 0 0;
    margin-inline: auto;
    text-align: center;
    color: oklch(0.74 0.018 270);
    font-size: var(--font-size-min, 0.875rem);
  }

  @media (max-width: 48rem) {
    .bg-cycle-note {
      font-size: var(--font-size-compact, 0.75rem);
    }
  }
</style>

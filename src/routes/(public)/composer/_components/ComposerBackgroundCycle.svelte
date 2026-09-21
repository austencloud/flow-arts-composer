<script lang="ts">
  import { onDestroy } from "svelte";
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

  const active = $derived(marketingBackground.type as string);

  function select(value: string): void {
    marketingBackground.set(value as BackgroundType);
  }

  onDestroy(() => marketingBackground.reset());
</script>

<div class="bg-cycle">
  <span class="theme-label">Theme:</span>
  <div class="bg-cycle-row">
    <SegmentedControl
      {options}
      value={active}
      onchange={select}
      ariaLabel="Theme"
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
</div>

<style>
  .bg-cycle {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-md, 16px);
  }

  .theme-label {
    color: var(--theme-text-secondary);
    font-size: var(--font-size-sm);
  }

  /* The four segments hold one fixed row, so switching the active option can
     never change the control's footprint or move the caption. */
  .bg-cycle-row {
    display: flex;
    justify-content: center;
    min-height: max(var(--min-touch-target, 48px), 48px);
    max-width: 100%;
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
</style>

<!--
OrientationCycler.svelte - Hybrid orientation selector
Three touch targets: left arrow cycles back, right arrow cycles forward, and the
center label opens an anchored popover with all four orientations.
-->
<script lang="ts">
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { Popover } from "bits-ui";
  import { scale } from "svelte/transition";
  import { backOut, cubicOut } from "svelte/easing";

  interface Props {
    orientation: Orientation;
    onOrientationChange: (orientation: Orientation) => void;
    color?: "blue" | "red";
    centered?: boolean;
    /** Opt in to the four compound orientations between the radial and
     * tangential axes. Construct keeps its existing four-option default. */
    allowInterradial?: boolean;
  }

  const {
    orientation,
    onOrientationChange,
    color,
    centered = false,
    allowInterradial = false,
  }: Props = $props();

  interface OrientationOption {
    value: Orientation;
    label: string;
    icon: string;
    hint: string;
    iconRotation?: number;
  }

  const RADIAL_CYCLE_ORDER: Orientation[] = [
    Orientation.IN,
    Orientation.CLOCK,
    Orientation.OUT,
    Orientation.COUNTER,
  ];

  const INTERRADIAL_CYCLE_ORDER: Orientation[] = [
    Orientation.IN,
    Orientation.CLOCK_IN,
    Orientation.CLOCK,
    Orientation.CLOCK_OUT,
    Orientation.OUT,
    Orientation.COUNTER_OUT,
    Orientation.COUNTER,
    Orientation.COUNTER_IN,
  ];

  const CENTER_CYCLE_ORDER: Orientation[] = [
    Orientation.CENTER_N,
    Orientation.CENTER_NW,
    Orientation.CENTER_W,
    Orientation.CENTER_SW,
    Orientation.CENTER_S,
    Orientation.CENTER_SE,
    Orientation.CENTER_E,
    Orientation.CENTER_NE,
  ];

  const RADIAL_ORIENTATIONS: OrientationOption[] = [
    {
      value: Orientation.IN,
      label: "In",
      icon: "fa-compress-arrows-alt",
      hint: "Toward center",
    },
    {
      value: Orientation.CLOCK,
      label: "Clock",
      icon: "fa-redo",
      hint: "Clockwise",
    },
    {
      value: Orientation.OUT,
      label: "Out",
      icon: "fa-expand-arrows-alt",
      hint: "Away from center",
    },
    {
      value: Orientation.COUNTER,
      label: "Counter",
      icon: "fa-undo",
      hint: "Counterclockwise",
    },
  ];

  const INTERRADIAL_ORIENTATIONS: OrientationOption[] = [
    RADIAL_ORIENTATIONS[0]!,
    {
      value: Orientation.CLOCK_IN,
      label: "Clock-in",
      icon: "fa-location-arrow",
      hint: "Between in and clock",
    },
    RADIAL_ORIENTATIONS[1]!,
    {
      value: Orientation.CLOCK_OUT,
      label: "Clock-out",
      icon: "fa-location-arrow",
      hint: "Between clock and out",
    },
    RADIAL_ORIENTATIONS[2]!,
    {
      value: Orientation.COUNTER_OUT,
      label: "Counter-out",
      icon: "fa-location-arrow",
      hint: "Between out and counter",
    },
    RADIAL_ORIENTATIONS[3]!,
    {
      value: Orientation.COUNTER_IN,
      label: "Counter-in",
      icon: "fa-location-arrow",
      hint: "Between counter and in",
    },
  ];

  const CENTER_ORIENTATIONS: OrientationOption[] = [
    {
      value: Orientation.CENTER_N,
      label: "North",
      icon: "fa-arrow-up",
      hint: "Aim north",
    },
    {
      value: Orientation.CENTER_NE,
      label: "Northeast",
      icon: "fa-arrow-up",
      hint: "Aim northeast",
      iconRotation: 45,
    },
    {
      value: Orientation.CENTER_E,
      label: "East",
      icon: "fa-arrow-up",
      hint: "Aim east",
      iconRotation: 90,
    },
    {
      value: Orientation.CENTER_SE,
      label: "Southeast",
      icon: "fa-arrow-up",
      hint: "Aim southeast",
      iconRotation: 135,
    },
    {
      value: Orientation.CENTER_S,
      label: "South",
      icon: "fa-arrow-up",
      hint: "Aim south",
      iconRotation: 180,
    },
    {
      value: Orientation.CENTER_SW,
      label: "Southwest",
      icon: "fa-arrow-up",
      hint: "Aim southwest",
      iconRotation: 225,
    },
    {
      value: Orientation.CENTER_W,
      label: "West",
      icon: "fa-arrow-up",
      hint: "Aim west",
      iconRotation: 270,
    },
    {
      value: Orientation.CENTER_NW,
      label: "Northwest",
      icon: "fa-arrow-up",
      hint: "Aim northwest",
      iconRotation: 315,
    },
  ];

  const cycleOrder = $derived(
    centered
      ? CENTER_CYCLE_ORDER
      : allowInterradial
        ? INTERRADIAL_CYCLE_ORDER
        : RADIAL_CYCLE_ORDER
  );
  const orientationOptions = $derived(
    centered
      ? CENTER_ORIENTATIONS
      : allowInterradial
        ? INTERRADIAL_ORIENTATIONS
        : RADIAL_ORIENTATIONS
  );
  const currentDisplay = $derived(
    orientationOptions.find((option) => option.value === orientation) ??
      orientationOptions[0]!
  );

  // Left is the blue prop, right is the red one. The control itself is fully
  // tinted, so the word lives in the accessible name rather than on screen
  // (`chip-primitives.md`, Blue/Red prop identity).
  const colorLabel = $derived(
    color === "blue" ? "Left" : color === "red" ? "Right" : ""
  );

  let popoverOpen = $state(false);

  function currentIndex(): number {
    const idx = cycleOrder.indexOf(orientation);
    return idx >= 0 ? idx : 0;
  }

  function cyclePrev() {
    const idx = (currentIndex() + 1) % cycleOrder.length;
    onOrientationChange(cycleOrder[idx]!);
  }

  function cycleNext() {
    const idx = (currentIndex() - 1 + cycleOrder.length) % cycleOrder.length;
    onOrientationChange(cycleOrder[idx]!);
  }

  function handleSelect(value: Orientation) {
    onOrientationChange(value);
    popoverOpen = false;
  }
</script>

<div
  class="orientation-cycler"
  class:color-blue={color === "blue"}
  class:color-red={color === "red"}
>
  <button
    class="cycle-arrow"
    onclick={cyclePrev}
    aria-label="Previous {colorLabel} orientation"
  >
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
  </button>

  <Popover.Root bind:open={popoverOpen}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="cycle-center"
          aria-label="{colorLabel} orientation: {currentDisplay.label}. Tap to see all options."
        >
          <span class="trigger-label">{currentDisplay.label}</span>
        </button>
      {/snippet}
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        side="top"
        sideOffset={8}
        align="center"
        avoidCollisions={true}
        collisionPadding={12}
        forceMount
      >
        {#snippet child({ open, wrapperProps, props })}
          <div {...wrapperProps}>
            {#if open}
              <div
                {...props}
                class="orientation-popover"
                class:color-blue={color === "blue"}
                class:color-red={color === "red"}
                in:scale={{
                  duration: 180,
                  start: 0.92,
                  opacity: 0,
                  easing: backOut,
                }}
                out:scale={{
                  duration: 130,
                  start: 0.95,
                  opacity: 0,
                  easing: cubicOut,
                }}
              >
                <div class="orientation-options">
                  {#each orientationOptions as opt (opt.value)}
                    <button
                      class="orientation-option"
                      class:selected={opt.value === orientation}
                      onclick={() => handleSelect(opt.value)}
                      aria-pressed={opt.value === orientation}
                      aria-label="{opt.label}: {opt.hint}"
                    >
                      <i
                        class="fas {opt.icon}"
                        style:transform={opt.iconRotation === undefined
                          ? undefined
                          : `rotate(${opt.iconRotation}deg)`}
                        aria-hidden="true"
                      ></i>
                      <div class="option-text">
                        <span class="option-label">{opt.label}</span>
                        <span class="option-hint">{opt.hint}</span>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/snippet}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>

  <button
    class="cycle-arrow"
    onclick={cycleNext}
    aria-label="Next {colorLabel} orientation"
  >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .orientation-cycler {
    display: flex;
    align-items: stretch;
    flex: 1;
    min-height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .orientation-cycler.color-blue {
    border-color: var(--prop-blue-border, rgba(59, 130, 246, 0.4));
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 8%, transparent);
  }

  .orientation-cycler.color-red {
    border-color: var(--prop-red-border, rgba(239, 68, 68, 0.4));
    background: color-mix(in srgb, var(--prop-red, #ef4444) 8%, transparent);
  }

  /* Shared button reset */
  .cycle-arrow,
  .cycle-center {
    border: none;
    background: none;
    color: var(--theme-text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.15s ease;
  }

  .cycle-arrow {
    flex: 3;
    font-size: 12px;
    opacity: 0.6;
  }

  .cycle-center {
    flex: 4;
    gap: 8px;
    padding: 10px 4px;
    font-size: var(--font-size-min);
    font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }

  @media (hover: hover) {
    .cycle-arrow:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      opacity: 1;
    }

    .cycle-center:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    }
  }

  .cycle-arrow:active,
  .cycle-center:active {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    transition: background var(--duration-instant) ease;
  }

  .cycle-arrow:focus-visible,
  .cycle-center:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  @container (max-width: 500px) {
    .cycle-arrow {
      padding: 0 8px;
    }

    .cycle-center {
      padding: 8px 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cycle-arrow,
    .cycle-center {
      transition: none;
    }
  }

  /* ============================================
     Popover panel — portalled, anchored above the cycler
     ============================================ */
  .orientation-popover {
    --sheet-bg: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    z-index: 1000;
    padding: 10px;
    background: var(--sheet-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  }

  .orientation-popover.color-blue {
    border-top: 2px solid
      color-mix(in srgb, var(--prop-blue, #3b82f6) 50%, transparent);
  }

  .orientation-popover.color-red {
    border-top: 2px solid
      color-mix(in srgb, var(--prop-red, #ef4444) 50%, transparent);
  }

  .orientation-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .orientation-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    min-height: var(--min-touch-target, 48px);
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .orientation-option i {
    font-size: 16px;
    opacity: 0.8;
    color: var(--theme-text);
    flex-shrink: 0;
  }

  .option-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }

  .option-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }

  .option-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .orientation-popover.color-blue .orientation-option.selected {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 60%,
      transparent
    );
    background: var(--prop-blue-bg, rgba(59, 130, 246, 0.15));
  }

  .orientation-popover.color-red .orientation-option.selected {
    border-color: color-mix(in srgb, var(--prop-red, #ef4444) 60%, transparent);
    background: var(--prop-red-bg, rgba(239, 68, 68, 0.15));
  }

  @media (hover: hover) {
    .orientation-option:hover:not(.selected) {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
    }
  }

  .orientation-option:active {
    transform: scale(0.98);
  }

  .orientation-option:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .orientation-option {
      transition: none;
    }

    .orientation-option:active {
      transform: none;
    }
  }
</style>

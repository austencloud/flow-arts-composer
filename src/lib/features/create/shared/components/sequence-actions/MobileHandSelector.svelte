<!--
  MobileHandSelector.svelte

  M3-inspired segmented button for hand selection on mobile.
  Defaults to L | Both | R and accepts a narrower option set for focused tools.
  Visual height: 32px. Touch target: 48px via invisible padding.
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TargetHand } from "#lib/shared/create/domain/panel-types.js";

  interface HandOption {
    hand: TargetHand;
    label: string;
    shortLabel: string;
  }

  interface Props {
    value: TargetHand;
    onChange: (hand: TargetHand) => void;
    options?: HandOption[];
    ariaLabel?: string;
    fullWidth?: boolean;
  }

  let {
    value,
    onChange,
    options,
    ariaLabel,
    fullWidth = false,
  }: Props = $props();

  const displayedOptions = $derived(
    options ?? [
      {
        hand: "left",
        label: t("shared_controls_left"),
        shortLabel: tDynamic("create_action_hand_left_short"),
      },
      {
        hand: "both",
        label: tDynamic("create_action_both_hands"),
        shortLabel: tDynamic("create_action_both_hands"),
      },
      {
        hand: "right",
        label: t("shared_controls_right"),
        shortLabel: tDynamic("create_action_hand_right_short"),
      },
    ]
  );
</script>

<div
  class="segmented-group"
  class:full-width={fullWidth}
  role="group"
  aria-label={ariaLabel ?? tDynamic("create_action_apply_transforms_to_hand")}
>
  {#each displayedOptions as opt}
    <button
      type="button"
      class="segment {opt.hand}"
      class:active={value === opt.hand}
      onclick={() => onChange(opt.hand)}
      aria-pressed={value === opt.hand}
      aria-label={opt.label}
    >
      <span class="segment-label">{opt.shortLabel}</span>
    </button>
  {/each}
</div>

<style>
  .segmented-group {
    --hand-motion-blue: var(--dm-motion-blue, #3575e2);
    --hand-motion-red: var(--dm-motion-red, #ed1c24);
    --hand-motion-both: var(
      --dm-motion-both,
      color-mix(in srgb, var(--hand-motion-blue) 50%, var(--hand-motion-red))
    );
    display: flex;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    flex-shrink: 0;
  }

  .segmented-group.full-width {
    width: 100%;
  }

  .segment {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    min-width: 44px;
    padding: 0 10px;
    border: none;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    /* 48px touch target via padding beyond visual height */
    position: relative;
  }

  .full-width .segment {
    flex: 1;
  }

  .segment::before {
    content: "";
    position: absolute;
    inset: -8px 0;
    /* Extends touch target to 48px (32 + 8 + 8) */
  }

  .segment:last-child {
    border-right: none;
  }

  .segment-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.02em;
    pointer-events: none;
  }

  /* Prop identity stays visible before selection; the label carries the same
     meaning without color for monochrome and color-blind readers. */
  .segment.blue {
    color: color-mix(
      in srgb,
      var(--hand-motion-blue) 72%,
      var(--theme-text, #fff)
    );
  }

  .segment.both:not(.active) {
    color: color-mix(
      in srgb,
      var(--hand-motion-both) 72%,
      var(--theme-text, #fff)
    );
  }

  .segment.red {
    color: color-mix(
      in srgb,
      var(--hand-motion-red) 72%,
      var(--theme-text, #fff)
    );
  }

  /* Active states per hand color */
  .segment.blue.active {
    background: var(
      --dm-motion-blue-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--hand-motion-blue) 30%, transparent),
        color-mix(in srgb, var(--hand-motion-blue) 16%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--hand-motion-blue) 52%, transparent);
    color: var(--theme-text, white);
  }

  .segment.both.active {
    background: var(
      --dm-motion-both-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--hand-motion-blue) 30%, transparent),
        color-mix(in srgb, var(--hand-motion-red) 30%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--hand-motion-both) 52%, transparent);
    color: var(--theme-text, white);
  }

  .segment.red.active {
    background: var(
      --dm-motion-red-wash,
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--hand-motion-red) 16%, transparent),
        color-mix(in srgb, var(--hand-motion-red) 30%, transparent)
      )
    );
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--hand-motion-red) 52%, transparent);
    color: var(--theme-text, white);
  }

  /* Hover */
  .segment:not(.active):hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    filter: brightness(1.18);
  }

  /* Focus */
  .segment:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: -2px;
    z-index: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .segment {
      transition: none;
    }
  }
</style>

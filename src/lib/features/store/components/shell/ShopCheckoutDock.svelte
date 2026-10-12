<!--
  The phone-sized buy bar. On a narrow screen the real buy rail sits far below a
  tall configurator, so once it scrolls out of sight this pinned bar keeps the
  price and the button one thumb away. It was copy-pasted into the LOOP
  configurator and the Deck Architect; this is the single copy both now use.
-->
<script lang="ts">
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    /** What's being bought right now (a pack name, a volume, a bundle). */
    label: string;
    /** Formatted price, already through formatUsd. */
    price: string;
    ctaLabel: string;
    disabled?: boolean;
    onclick: () => void;
  }

  let { label, price, ctaLabel, disabled = false, onclick }: Props = $props();
</script>

<div
  class="checkout-dock"
  transition:flyFade={{ y: 72, duration: DURATION.normal }}
>
  <div class="dock-meter">
    <span class="dock-label">{label}</span>
    <span class="dock-price">{price}</span>
  </div>
  <button type="button" class="dock-buy" {disabled} {onclick}>
    {ctaLabel}
  </button>
</div>

<style>
  .checkout-dock {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem calc(0.625rem + env(safe-area-inset-bottom, 0px));
    background: rgba(10, 12, 22, 0.86);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .dock-meter {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 0.25rem 0.75rem;
    border-radius: 0.625rem;
    border: 1px solid rgba(139, 108, 255, 0.45);
    background: rgba(139, 108, 255, 0.12);
  }
  .dock-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 800;
    white-space: nowrap;
  }
  .dock-price {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-accent, #a78bfa);
    font-variant-numeric: tabular-nums;
  }

  .dock-buy {
    flex: 1;
    min-height: var(--min-touch-target, 44px);
    border: none;
    border-radius: 0.75rem;
    background: var(--theme-accent-strong, #7c6cf5);
    color: #fff;
    font-size: var(--font-size-md, 16px);
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }
  .dock-buy:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .dock-buy {
      transition: none;
    }
  }
</style>

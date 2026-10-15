<!--
  ChiralityToggle.svelte

  One-tap A/B flip for a Buugeng-family prop's chirality on one hand. The full
  chirality picker lives in the prop sheet; this is the shortcut for the flip
  people make most often, so it sits right next to the controls they are
  already using. It changes the hand's prop setting, not the step.

  Callers decide when to show it (only for Buugeng-family props).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handLabel } from "./control-labels";
  import {
    getSettings,
    updateSettings,
  } from "#lib/shared/application/state/app-state.svelte.js";

  interface Props {
    hand: "left" | "right";
    /** Icon-only square button. */
    compact?: boolean;
  }

  let { hand, compact = false }: Props = $props();

  const settings = $derived(getSettings());
  const flipped = $derived(
    hand === "left"
      ? (settings.leftBuugengFlipped ?? false)
      : (settings.rightBuugengFlipped ?? false)
  );

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (hand === "left") updateSettings({ leftBuugengFlipped: !flipped });
    else updateSettings({ rightBuugengFlipped: !flipped });
  }
</script>

<button
  class="chirality-btn {hand === 'left' ? 'blue' : 'red'}"
  class:compact
  class:flipped
  onclick={toggle}
  aria-label={t("create_controls_chirality", {
    hand: handLabel(hand),
    variant: flipped ? "B" : "A",
  })}
  aria-pressed={flipped}
>
  <i class="fas fa-arrows-left-right" aria-hidden="true"></i>
  {#if !compact}
    <!-- Both letters share one grid cell so the button never resizes. -->
    <span class="chirality-word">
      <span class="sizer" aria-hidden="true">B</span>
      <span class="sizer" aria-hidden="true">A</span>
      <span class="live">{flipped ? "B" : "A"}</span>
    </span>
  {/if}
</button>

<style>
  .chirality-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: var(--min-touch-target, 44px);
    padding: 0 14px;
    height: var(--min-touch-target, 44px);
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
    flex-shrink: 0;
  }

  .chirality-btn:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  .chirality-word {
    display: inline-grid;
  }

  .chirality-word .sizer,
  .chirality-word .live {
    grid-area: 1 / 1;
    white-space: nowrap;
  }

  .chirality-word .sizer {
    visibility: hidden;
  }

  .chirality-btn.compact {
    padding: 0;
    width: var(--min-touch-target, 44px);
    border-radius: 8px;
  }

  .chirality-btn.blue {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.15);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.3);
    color: var(--prop-ink, rgba(var(--user-left-rgb, 59, 130, 246), 0.8));
  }

  .chirality-btn.blue:hover,
  .chirality-btn.blue.flipped {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.28);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.55);
    color: var(--prop-ink, var(--user-left-color, var(--semantic-info)));
  }

  .chirality-btn.red {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.15);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.3);
    color: var(--prop-ink, rgba(var(--user-right-rgb, 239, 68, 68), 0.8));
  }

  .chirality-btn.red:hover,
  .chirality-btn.red.flipped {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.28);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.55);
    color: var(--prop-ink, var(--user-right-color, var(--semantic-error)));
  }

  @media (prefers-reduced-motion: reduce) {
    .chirality-btn {
      transition: none;
    }
  }
</style>

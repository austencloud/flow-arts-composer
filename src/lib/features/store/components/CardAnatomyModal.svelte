<!--
  CardAnatomyModal

  Click-to-explain popup for a single Choreo Card: opens the exact "What's on
  the Card" diagram from the shop explainer page (CardAnatomyExplainer), pointed
  at the card the reader clicked. Built on BaseModal (focus trap, ESC, backdrop,
  stacking) — no bespoke overlay. `xl` size gives a wide desktop dialog (both
  faces) and goes full-screen on phones (single face); the explainer adapts to
  the resulting content width on its own.
-->
<script lang="ts">
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import CardAnatomyExplainer from "./CardAnatomyExplainer.svelte";
  import type { CoverCard } from "../domain/models/product";

  let {
    open = $bindable(false),
    card = null,
    onclose,
  }: {
    open?: boolean;
    card?: CoverCard | null;
    onclose?: () => void;
  } = $props();
</script>

<BaseModal
  bind:open
  size="xl"
  labelledBy="card-anatomy-title"
  describedBy="card-anatomy-hint"
  onclose={() => onclose?.()}
>
  {#snippet header()}
    <div class="ca-header">
      <div class="ca-heading">
        <h2 id="card-anatomy-title">What's on the Card</h2>
        <p id="card-anatomy-hint">
          Tap or point at any part of the card, or any row, to see what it is.
        </p>
      </div>
      <button type="button" class="ca-close" aria-label="Close" onclick={() => onclose?.()}>
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="ca-body">
    {#if card}
      <CardAnatomyExplainer {card} showShuffle={false} />
    {/if}
  </div>
</BaseModal>

<style>
  .ca-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.4rem 1.5rem 0.75rem;
  }
  .ca-heading {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }
  .ca-header h2 {
    margin: 0;
    font-size: clamp(1.15rem, 2.2vw, 1.5rem);
    font-weight: 700;
    color: oklch(0.96 0.01 270);
  }
  .ca-header p {
    margin: 0;
    font-size: 0.9rem;
    color: oklch(0.68 0.02 270);
  }
  .ca-close {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 999px;
    border: 1px solid oklch(0.5 0.04 270 / 0.35);
    background: oklch(0.28 0.03 275 / 0.5);
    color: oklch(0.92 0.01 270);
    font-size: 1.1rem;
    cursor: pointer;
    transition:
      background 140ms ease,
      border-color 140ms ease;
  }
  .ca-close:hover,
  .ca-close:focus-visible {
    background: oklch(0.34 0.05 275 / 0.65);
    border-color: oklch(0.68 0.12 275 / 0.6);
  }
  .ca-close:focus-visible {
    outline: 2px solid oklch(0.7 0.1 275 / 0.7);
    outline-offset: 2px;
  }

  .ca-body {
    padding: 0.5rem 1.5rem 1.75rem;
  }

  @media (max-width: 520px) {
    .ca-header {
      padding: 1.1rem 1.1rem 0.6rem;
    }
    .ca-body {
      padding: 0.5rem 1.1rem 1.4rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ca-close {
      transition: none;
    }
  }
</style>

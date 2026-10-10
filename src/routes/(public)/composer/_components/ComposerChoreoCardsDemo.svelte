<!--
  ComposerChoreoCardsDemo

  A fanned hand of REAL printed Choreo Card fronts, rendered through the same
  DeckFanCover print pipeline the /shop hero and configurators use — what the
  fan shows IS what prints and ships. Cards are sourced from the live product
  catalog (loadActiveProducts → one cover per LOOP flavor, a varied hand),
  matching the fans the shop's own product pages deal.

  Mounted via LazyMount only when the Learn section nears the viewport, so the
  deal-in flourish lands on arrival and the prerendered HTML stays lean. Until
  the covers load, FanSkeleton holds the fan's exact footprint — the SAME
  skeleton the page renders as this chunk's LazyMount placeholder, so neither
  the chunk swap nor the catalog landing moves anything (no-layout-shift.md).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import DeckFanCover from "#lib/features/store/components/DeckFanCover.svelte";
  import CardAnatomyModal from "#lib/features/store/components/CardAnatomyModal.svelte";
  import FanSkeleton from "./FanSkeleton.svelte";
  import type { CoverCard } from "#lib/features/store/domain/models/product.js";

  let cards = $state<CoverCard[]>([]);
  let failed = $state(false);

  // Click a card → explain it. Same "What's on the Card" diagram as the shop
  // explainer page, pointed at the clicked card. selectedCard stays set through
  // the close animation so the modal doesn't blank mid-fade.
  let selectedCard = $state<CoverCard | null>(null);
  let modalOpen = $state(false);
  function openCard(card: CoverCard) {
    selectedCard = card;
    modalOpen = true;
  }

  onMount(() => {
    const load = async () => {
      try {
        const { loadActiveProducts } = await import(
          "#lib/features/store/services/product-loader.js"
        );
        const products = await loadActiveProducts();
        // One cover per LOOP flavor — a varied hand, same selection as the
        // shop hero fan (StorePage.svelte heroCards).
        const hand = products
          .filter((p) => p.listing === "loop-deck" && p.status === "active")
          .map((p) => p.coverCards?.[0])
          .filter((c): c is CoverCard => c != null);
        if (hand.length) cards = hand;
        else failed = true;
        // Warm the explainer's lazy CardAnatomy chunk (and its CardBack
        // subtree) now, while idle — the first card click then opens the
        // modal with zero chunk fetches. The front image is already in HTTP
        // cache because the fan itself displays it.
        void import("#lib/features/store/components/CardAnatomy.svelte");
      } catch (err) {
        console.error("[ComposerChoreoCardsDemo] card fan load failed:", err);
        failed = true;
      }
    };
    // The store catalog chunk is heavy; defer to idle so the Learn prose paints
    // first, then deal the fan in.
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => void load(), { timeout: 3000 });
    } else {
      setTimeout(() => void load(), 400);
    }
  });
</script>

<div class="cards-stage">
  {#if cards.length}
    <DeckFanCover
      {cards}
      deckName="TKA Shop"
      cardWidth={128}
      maxCardWidth={280}
      deal
      inert={false}
      onCardClick={openCard}
    />
  {:else if failed}
    <!-- The static skeleton keeps holding the fan's footprint so the failure
         note doesn't collapse the section (no-layout-shift). -->
    <div class="failed-stage">
      <FanSkeleton shimmer={false} />
      <p class="quiet-note">The decks are loading. Open the shop to see the full fan.</p>
    </div>
  {:else}
    <FanSkeleton />
  {/if}
</div>

<CardAnatomyModal bind:open={modalOpen} card={selectedCard} onclose={() => (modalOpen = false)} />

<style>
  /* Height comes from the content: FanSkeleton and the loaded DeckFanCover
     share the same fit math, so every state renders the same footprint. */
  .cards-stage {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .failed-stage {
    position: relative;
  }
  .failed-stage > :global(.sk-fan) {
    opacity: 0.35;
  }

  .quiet-note {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    text-align: center;
    font-style: italic;
    font-size: 0.85rem;
    color: oklch(0.75 0.02 270);
  }
</style>

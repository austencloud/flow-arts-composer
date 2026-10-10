<script lang="ts">
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import DeckFanCover from "./DeckFanCover.svelte";
  import type { CoverCard } from "../domain/models/product";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  interface Props {
    coverImageUrl?: string;
    productName: string;
    /** Representative deck sequence. When set (and no cover image), the card shows
        its tip-path mandala as a content-derived cover instead of a bare icon. */
    coverSequence?: { steps: unknown[] };
    /** Curated cover cards: rendered as a fan of REAL printed fronts. Highest-
        priority content-derived cover (beats the mandala). */
    coverCards?: CoverCard[];
    /** QR attribution for the print-path cover renders. */
    deckId?: string;
    /** Buyer's print-prop pick, forwarded to the fan. */
    propType?: PropType;
  }

  let {
    coverImageUrl,
    productName,
    coverSequence,
    coverCards,
    deckId,
    propType,
  }: Props = $props();

  // Drives the mandala's render size so it fills the card width responsively.
  let boxW = $state(0);
</script>

<div class="mockup-container" bind:clientWidth={boxW}>
  {#if coverImageUrl}
    <img
      src={coverImageUrl}
      alt="{productName} card preview"
      class="cover-image"
      loading="lazy"
    />
  {:else if coverCards && coverCards.length > 0}
    <div class="fan-cover" aria-label="{productName} sample cards">
      <DeckFanCover
        cards={coverCards}
        {deckId}
        deckName={productName}
        {propType}
        cardWidth={Math.max(96, Math.round((boxW || 280) * 0.34))}
      />
    </div>
  {:else if coverSequence}
    <div class="mandala-cover" aria-label="{productName} tip-path mandala">
      <SequenceMandala
        sequence={coverSequence}
        size={boxW || 280}
        show="both"
        style="stroke"
        darkMode={true}
      />
    </div>
  {:else}
    <div class="placeholder" aria-label="{productName} preview coming soon">
      <i class="fas fa-cards" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .mockup-container {
    aspect-ratio: 3 / 4;
    border-radius: 12px;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cover-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Ken-Burns zoom on hover. Transform only (compositor); .mockup-container's
       overflow: hidden crops it while the outer card geometry stays stable. */
    transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Fanned real-card cover: same soft wash frame as the mandala, the fan does
     the rest. Centered in the 3:4 box. */
  .fan-cover {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
    transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Content-derived cover: the deck's signature tip-path mandala, centered on a
     soft radial wash so it reads as framed card art. */
  .mandala-cover {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background: radial-gradient(
      circle at 50% 42%,
      rgba(255, 255, 255, 0.05),
      rgba(255, 255, 255, 0.015)
    );
    transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    background: radial-gradient(
      circle at 50% 40%,
      rgba(255, 255, 255, 0.06),
      rgba(255, 255, 255, 0.02)
    );
    /* Query container for the glyph's cqw sizing. */
    container-type: inline-size;
  }

  .placeholder i {
    font-size: 26cqw;
  }

  .mockup-container:hover .cover-image,
  .mockup-container:hover .placeholder,
  .mockup-container:hover .mandala-cover,
  .mockup-container:hover .fan-cover {
    transform: scale(1.05);
  }

  @media (prefers-reduced-motion: reduce) {
    .cover-image,
    .placeholder,
    .mandala-cover,
    .fan-cover {
      transition: none;
    }
    .mockup-container:hover .cover-image,
    .mockup-container:hover .placeholder,
    .mockup-container:hover .mandala-cover,
    .mockup-container:hover .fan-cover {
      transform: none;
    }
  }
</style>

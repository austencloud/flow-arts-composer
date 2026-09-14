<!--
  CardAnatomyExplainer

  The full "What's on the Card" diagram: front + back of a real Choreo Card with
  the legend copy, hover/tap linking, and the spotlight overlay. One component,
  three hosts — the LOOP Deck and T&D Trilogy product pages' "how it works"
  sections (a real card from the deck in view) and the click-to-explain modal
  (a specific card, shuffle off) — so the surfaces are identical by
  construction. With no `card`, it self-loads a shuffleable catalog example.

  Layout adapts to this component's OWN measured width, not the viewport: wide
  boxes show both faces flanked by their legends; narrow boxes show one face
  with a Front/Back toggle, the tapped part's detail, and a chip row. Measuring
  self (not the viewport) is what lets the same diagram sit correctly inside a
  modal, whose content box is narrower than the screen.
-->
<script lang="ts">
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { activateWhenNear } from "$lib/actions/activate-when-near";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import SkeletonLoader from "$lib/shared/foundation/ui/SkeletonLoader.svelte";
  import type { CoverCard } from "../domain/models/product";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    bakedCoverUrl,
    DEFAULT_SHOP_PROP,
  } from "../domain/shop-prop-options";
  import { FRONT_LEGEND, BACK_LEGEND } from "../domain/card-anatomy-legend";

  let {
    card = undefined,
    showShuffle = true,
    beginnerCard = undefined,
    initialHighlight = null,
    highlight = $bindable(initialHighlight),
    onhighlightchange,
  }: {
    /** Drive a SPECIFIC card. Absent ⇒ CardAnatomy self-loads a shuffleable
     *  example (the marketing page). */
    card?: CoverCard;
    showShuffle?: boolean;
    /** A live hand-path card for early lessons, before TKA letters are taught. */
    beginnerCard?: {
      sequence: SequenceData;
      qrUrl: string;
      title: string;
    };
    /** Lets a guided host begin with the card region it is teaching. */
    initialHighlight?: string | null;
    /** Controlled spotlight region for guided teaching hosts. */
    highlight?: string | null;
    /** Reports a card-part choice to guided hosts without replacing the card owner. */
    onhighlightchange?: (id: string | null) => void;
  } = $props();

  const sequence = $derived(beginnerCard?.sequence ?? card?.sequence);
  const frontUrl = $derived(
    card ? (bakedCoverUrl(card, DEFAULT_SHOP_PROP) ?? card.imageUrl) : undefined
  );
  const isBeginner = $derived(beginnerCard !== undefined);
  const frontLegend = $derived(
    isBeginner
      ? FRONT_LEGEND.filter(
          (item) => item.id !== "word" && item.id !== "mandalas"
        )
      : FRONT_LEGEND
  );
  const backLegend = $derived(isBeginner ? [] : BACK_LEGEND);

  // Which region is lit. Legend rows/chips and the cards drive it both ways.
  function setHighlight(id: string | null) {
    highlight = id;
    onhighlightchange?.(id);
  }
  function toggle(id: string) {
    setHighlight(isBeginner ? id : highlight === id ? null : id);
  }

  // Both-faces vs single-face keys off THIS box's width. Default wide so the
  // prerendered HTML carries the full legend copy for SEO; the innerWidth
  // heuristic then covers the first client frame before the box is measured,
  // and the real measurement corrects it. 980px ≈ where two 5:7 cards plus two
  // legend columns stop being cramped (keeps the page's desktop feel and lets a
  // wide xl modal show both faces).
  let boxW = $state(0);
  const isWide = $derived(
    boxW > 0
      ? boxW >= 980
      : typeof window === "undefined"
        ? true
        : window.innerWidth >= 980
  );

  // Narrow single-face state.
  let face = $state<"front" | "back">("front");
  function switchFace(f: "front" | "back") {
    face = f;
    setHighlight(null);
  }
  const legendById = $derived(
    new Map([...frontLegend, ...backLegend].map((i) => [i.id, i]))
  );
  const detail = $derived(highlight ? legendById.get(highlight) : null);
  const faceLegend = $derived(face === "front" ? frontLegend : backLegend);

  // Keep the legend copy in SSR, but hold the interactive cards and their
  // Firebase-backed example data until this section is near the viewport and
  // the route morph has cleared an idle turn.
  let cardsActive = $state(false);
  let cardStatus = $state<"loading" | "ready" | "error">("loading");
  function setCardStatus(status: "loading" | "ready" | "error"): void {
    cardStatus = status;
    if (status === "error") setHighlight(null);
  }
  const activateCardsWhenNear = activateWhenNear;
  const wideCardProps = $derived({
    highlight,
    sequence,
    frontUrl,
    showShuffle,
    handPathCard: isBeginner,
    qrUrl: beginnerCard?.qrUrl,
    cardTitle: beginnerCard?.title,
    onhighlight: (id: string | null) => {
      if (isBeginner && id === null) return;
      setHighlight(id);
    },
    onstatuschange: setCardStatus,
  });
  const narrowCardProps = $derived({ ...wideCardProps, face });
</script>

{#snippet wideCardPlaceholder()}
  <div
    class="card-placeholder-stack"
    role="status"
    aria-label="Preparing card preview"
  >
    <div class="card-placeholder-set">
      <figure class="card-placeholder-face">
        <div class="card-placeholder">
          <SkeletonLoader
            variant="card"
            width="100%"
            height="100%"
            className="card-anatomy-skeleton"
          />
        </div>
        <figcaption>Front</figcaption>
      </figure>
      <figure class="card-placeholder-face">
        <div class="card-placeholder">
          <SkeletonLoader
            variant="card"
            width="100%"
            height="100%"
            className="card-anatomy-skeleton"
          />
        </div>
        <figcaption>Back</figcaption>
      </figure>
    </div>
    {#if showShuffle}
      <div class="card-placeholder-shuffle">
        <SkeletonLoader
          variant="rect"
          width="13rem"
          height="44px"
          className="card-anatomy-shuffle-skeleton"
        />
      </div>
    {/if}
  </div>
{/snippet}

{#snippet narrowCardPlaceholder()}
  <div
    class="card-placeholder-stack"
    role="status"
    aria-label="Preparing card preview"
  >
    <div class="card-placeholder-set single">
      <figure class="card-placeholder-face">
        <div class="card-placeholder">
          <SkeletonLoader
            variant="card"
            width="100%"
            height="100%"
            className="card-anatomy-skeleton"
          />
        </div>
      </figure>
    </div>
    {#if showShuffle}
      <div class="card-placeholder-shuffle">
        <SkeletonLoader
          variant="rect"
          width="13rem"
          height="44px"
          className="card-anatomy-shuffle-skeleton"
        />
      </div>
    {/if}
  </div>
{/snippet}

{#snippet wideCardError(_loadError: unknown, retry: () => void)}
  <div class="card-load-failure" role="alert">
    <div aria-hidden="true">{@render wideCardPlaceholder()}</div>
    <div class="card-load-message">
      <p>Card preview didn’t load.</p>
      <button type="button" onclick={retry}>Try again</button>
    </div>
  </div>
{/snippet}

{#snippet narrowCardError(_loadError: unknown, retry: () => void)}
  <div class="card-load-failure" role="alert">
    <div aria-hidden="true">{@render narrowCardPlaceholder()}</div>
    <div class="card-load-message">
      <p>Card preview didn’t load.</p>
      <button type="button" onclick={retry}>Try again</button>
    </div>
  </div>
{/snippet}

<div class="explainer" bind:clientWidth={boxW}>
  {#if isWide && !isBeginner}
    <!-- Wide: front labels | cards (both faces) | back labels, hover-driven. -->
    <div class="anatomy-layout" class:dimming={highlight !== null}>
      <div class="legend-col front">
        <h3 class="legend-title">Front</h3>
        <div class="legend-list" role="list">
          {#each frontLegend as item}
            <button
              type="button"
              class="legend-row"
              class:active={highlight === item.id}
              disabled={cardStatus !== "ready"}
              onpointerenter={(e) =>
                e.pointerType === "mouse" && setHighlight(item.id)}
              onpointerleave={(e) =>
                e.pointerType === "mouse" && !isBeginner && setHighlight(null)}
              onclick={() => toggle(item.id)}
            >
              <span class="legend-term">{item.term}</span>
              <span class="legend-text">{item.text}</span>
            </button>
          {/each}
        </div>
      </div>

      <div
        class="cards-slot"
        use:activateCardsWhenNear={{
          activate: () => (cardsActive = true),
          rootMargin: "500px 0px",
          deferUntilIdle: true,
        }}
      >
        <LazyMount
          loader={() => import("./CardAnatomy.svelte")}
          active={cardsActive}
          props={wideCardProps}
          placeholder={wideCardPlaceholder}
          error={wideCardError}
          onStatusChange={(status) => {
            if (status !== "loaded") setCardStatus(status);
          }}
        />
      </div>

      <div class="legend-col back">
        <h3 class="legend-title">Back</h3>
        <div class="legend-list" role="list">
          {#each backLegend as item}
            <button
              type="button"
              class="legend-row"
              class:active={highlight === item.id}
              disabled={cardStatus !== "ready"}
              onpointerenter={(e) =>
                e.pointerType === "mouse" && setHighlight(item.id)}
              onpointerleave={(e) =>
                e.pointerType === "mouse" && !isBeginner && setHighlight(null)}
              onclick={() => toggle(item.id)}
            >
              <span class="legend-term">{item.term}</span>
              <span class="legend-text">{item.text}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- Narrow: one card + a Front/Back toggle, its detail beneath, a chip row —
         card and text always share the screen. -->
    <div class="mobile-anatomy">
      {#if !isBeginner}
        <div class="face-toggle">
          <SegmentedControl
            options={[
              { value: "front", label: "Front" },
              { value: "back", label: "Back" },
            ]}
            value={face}
            onchange={switchFace}
            color="accent"
          />
        </div>
      {/if}

      <div
        class="cards-slot"
        use:activateCardsWhenNear={{
          activate: () => (cardsActive = true),
          rootMargin: "500px 0px",
          deferUntilIdle: true,
        }}
      >
        <LazyMount
          loader={() => import("./CardAnatomy.svelte")}
          active={cardsActive}
          props={narrowCardProps}
          placeholder={narrowCardPlaceholder}
          error={narrowCardError}
          onStatusChange={(status) => {
            if (status !== "loaded") setCardStatus(status);
          }}
        />
      </div>

      <div class="detail-slot" aria-live="polite">
        {#if detail}
          <span class="detail-term">{detail.term}</span>
          <span class="detail-text">{detail.text}</span>
        {:else}
          <span class="detail-prompt"
            >Tap a part of the card, or a chip below, to learn what it is.</span
          >
        {/if}
      </div>

      <div class="chip-row" role="list">
        {#each faceLegend as item}
          <button
            type="button"
            class="part-chip"
            class:active={highlight === item.id}
            aria-pressed={highlight === item.id}
            disabled={cardStatus !== "ready"}
            onclick={() => toggle(item.id)}
          >
            {item.term}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Pink accent inherited from the page section; defaulted here so the modal
     (no section wrapper) matches. */
  .explainer {
    --accent: #ec4899;
    width: 100%;
  }

  /* ---------- wide: front labels | cards | back labels ---------- */
  .anatomy-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2.3fr) minmax(0, 1fr);
    gap: clamp(1.5rem, 2.5vw, 3.25rem);
    align-items: center;
    width: 100%;
  }
  .cards-slot {
    order: 0;
  }
  .card-placeholder-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
  }
  .card-placeholder-set {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: clamp(1rem, 3vw, 2.5rem);
    width: 100%;
  }
  .card-placeholder-face {
    display: flex;
    flex: 1 1 240px;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
  }
  .card-placeholder-set.single .card-placeholder-face {
    flex: 0 1 340px;
  }
  .card-placeholder {
    width: 100%;
    max-width: 430px;
    aspect-ratio: 5 / 7;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
  .card-placeholder :global(.card-anatomy-skeleton) {
    height: 100%;
  }
  .card-placeholder-shuffle {
    display: flex;
    justify-content: center;
  }
  .card-placeholder-face figcaption {
    color: oklch(0.65 0.02 270);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .card-load-failure {
    position: relative;
  }
  .card-load-failure::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: oklch(0.12 0.02 275 / 0.58);
    pointer-events: none;
  }
  .card-load-failure :global(.skeleton) {
    animation: none !important;
    opacity: 0.5;
  }
  .card-load-message {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: min(90%, 19rem);
    text-align: center;
    transform: translate(-50%, -50%);
  }
  .card-load-message p {
    margin: 0;
    color: oklch(0.94 0.015 270);
    font-weight: 650;
  }
  .card-load-message button {
    min-height: 44px;
    padding: 0.7rem 1.1rem;
    border: 1px solid oklch(0.72 0.1 340 / 0.55);
    border-radius: 999px;
    color: oklch(0.96 0.01 270);
    background: oklch(0.24 0.045 295 / 0.94);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .card-load-message button:focus-visible {
    outline: 2px solid oklch(0.82 0.12 330);
    outline-offset: 3px;
  }
  /* Left labels read toward the card they describe. */
  .legend-col.front {
    text-align: right;
  }
  .legend-col.front .legend-row {
    align-items: flex-end;
  }

  /* ---------- narrow: single card + toggle + detail + chips ---------- */
  .mobile-anatomy {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    max-width: 30rem;
    margin-inline: auto;
  }

  .face-toggle {
    width: 100%;
    max-width: 18rem;
    margin-inline: auto;
  }

  /* Detail directly under the card. Reserved height so a longer description
     never shoves the chips (no-layout-shift): sized to the wordiest entry. */
  .detail-slot {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-height: 7.5rem;
    padding: 0.9rem 1rem;
    border-radius: 12px;
    border: 1px solid oklch(0.4 0.04 270 / 0.25);
    background: oklch(0.2 0.03 270 / 0.4);
  }
  .detail-term {
    font-weight: 700;
    font-size: 1rem;
    color: oklch(0.95 0.01 270);
  }
  .detail-text {
    font-size: 0.92rem;
    line-height: 1.55;
    color: oklch(0.78 0.015 270);
  }
  .detail-prompt {
    font-size: 0.92rem;
    line-height: 1.55;
    color: oklch(0.62 0.02 270);
    font-style: italic;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }
  .part-chip {
    min-height: 44px;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: 1px solid oklch(0.42 0.04 270 / 0.35);
    background: oklch(0.24 0.03 270 / 0.5);
    color: oklch(0.9 0.01 270);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      box-shadow 180ms ease;
  }
  .part-chip.active:not(:disabled) {
    border-color: color-mix(in oklch, var(--accent, #ec4899) 55%, transparent);
    background: oklch(0.32 0.04 270 / 0.6);
    box-shadow: 0 0 20px
      color-mix(in oklch, var(--accent, #ec4899) 20%, transparent);
  }
  .part-chip:disabled,
  .legend-row:disabled {
    cursor: default;
    opacity: 0.45;
    box-shadow: none;
  }
  .part-chip:focus-visible {
    outline: 2px solid oklch(0.7 0.1 275 / 0.7);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .part-chip {
      transition: none;
    }
  }

  /* ---------- legend columns (wide) ---------- */
  .legend-title {
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: oklch(0.6 0.02 270);
    margin: 0 0 0.6rem;
  }

  .legend-list {
    display: flex;
    flex-direction: column;
  }

  .legend-row {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: flex-start;
    text-align: left;
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
    transition:
      background 140ms ease,
      opacity 180ms ease,
      box-shadow 180ms ease;
  }
  .legend-row:hover:not(:disabled),
  .legend-row:focus-visible:not(:disabled),
  .legend-row.active:not(:disabled) {
    background: oklch(0.3 0.03 270 / 0.22);
  }
  /* Focused pair lights up; every other row steps back. */
  .legend-row.active:not(:disabled) {
    background: oklch(0.33 0.04 270 / 0.45);
    box-shadow:
      0 0 0 1px color-mix(in oklch, var(--accent, #ec4899) 40%, transparent),
      0 0 22px color-mix(in oklch, var(--accent, #ec4899) 16%, transparent);
  }
  .anatomy-layout.dimming .legend-row:not(.active) {
    opacity: 0.35;
  }
  .anatomy-layout.dimming .legend-title {
    opacity: 0.5;
    transition: opacity 180ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .legend-row,
    .anatomy-layout.dimming .legend-title {
      transition: none;
    }
  }
  .legend-row:focus-visible {
    outline: 2px solid oklch(0.7 0.1 275 / 0.7);
    outline-offset: 2px;
  }

  .legend-term {
    font-weight: 650;
    font-size: 0.92rem;
    color: oklch(0.93 0.01 270);
  }

  .legend-text {
    font-size: 0.88rem;
    line-height: 1.5;
    color: oklch(0.72 0.012 270);
  }
</style>

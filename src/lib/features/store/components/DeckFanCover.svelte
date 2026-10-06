<!--
  DeckFanCover — a fanned hand of REAL printed card fronts, rendered through
  the print pipeline (PrintCardRenderer: canonical locked visibility, MPC
  stripe frame, accent coloring), used as deck cover art in the shop grid, the
  /shop hero, and the configurators. What the fan shows IS what prints.

  Decorative by default: covers render inside links/option buttons, so the fan
  is `inert` + aria-hidden; the host element carries the accessible label.
  With `onCardClick` set, each card instead becomes a real focusable button
  (the composer promo fan → card-anatomy explainer modal).

  Hover model: the row's geometry NEVER changes — only the card under the
  pointer pops (bottom-anchored scale + z-raise). Any spread/shift moved cards
  under a stationary cursor and caused mis-hovers and mis-clicks.

  Card count responds to container width (3–6), capped by maxCards. Cards
  auto-scale UP from cardWidth to fill the container (ultrawide screens get a
  properly big fan), capped by maxCardWidth.
-->
<script lang="ts" module>
  /* Deal timing, exported so hosts can sequence follow-up flourishes (the
     configurator's shimmer + ready-chip fire after the re-deal settles). */
  export const DEAL_MS = 620;
  export const DEAL_STAGGER = 70;
  export const GATHER_MS = 240;

  /* Resolved cover object URLs, shared across every DeckFanCover instance for
     the page session. The configurator re-deals a fan by REMOUNTING this
     component (its Crossfade is a {#key} block), which drops per-instance
     state; without this shared map every re-deal fell back to shimmer and
     re-awaited the render promise. Keyed identically to the instance map:
     (card id/word | prop | face). The service already caches the underlying
     render promises — this caches the resolved URL so a remount paints on the
     first frame with zero await. */
  const resolvedCovers = new Map<string, string>();
</script>

<script lang="ts">
  import type { CoverCard } from "../domain/models/product";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { renderCoverFront, renderCoverBack, prewarmCovers } from "../services/cover-front-renderer";
  import { DEFAULT_SHOP_PROP, bakedCoverUrl } from "../domain/shop-prop-options";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  interface Props {
    cards: readonly CoverCard[];
    /** QR attribution, same as the print path. */
    deckId?: string;
    deckName?: string;
    /** Prop the cards render with (the buyer's pick). Defaults to staves. */
    propType?: PropType;
    /** MINIMUM rest width of one card, px. */
    cardWidth?: number;
    /** Auto-scale ceiling. Defaults to 1.8x cardWidth. */
    maxCardWidth?: number;
    /** Upper bound on cards shown (width may show fewer). */
    maxCards?: number;
    /** Show EXACTLY this many cards regardless of width (e.g. the trilogy tile
        always fans all six element families). Cards scale down to fit. */
    exactCount?: number;
    /** Disable the hover pop (e.g. tiny tiles). */
    interactive?: boolean;
    /** Decorative fans are `inert` so the host link/button owns pointer
        events and a11y. Set false for a standalone fan that should respond to
        hover itself — the fan then plays its own pick-a-card pop (the
        marketing page's Choreo Card flourish). */
    inert?: boolean;
    /** Deal-in choreography: cards mount as a stacked pile and sweep into the
        fan with a staggered spring (opt-in — grid/hero fans stay static). */
    deal?: boolean;
    /** Bump to re-deal: cards gather back to the pile, then deal out again.
        The payoff flourish on the configurator's Buy click. */
    dealNonce?: number;
    /** Which card face to render. Backs skip the baked-URL shortcut (bakes are
        fronts only) and render through the live back pipeline. */
    face?: "front" | "back";
    /** Render the current full print front, including its real QR. Used by the
        shop hero so an old baked cover cannot disagree with its scan demo. */
    freshFront?: boolean;
    /** Existing read-only short URL for a fresh printed front. */
    qrUrl?: string;
    onCoverResolved?: (card: CoverCard, url: string) => void;
    /** When set, each card becomes a real, focusable button that calls this
        with the card — turning the decorative fan into an interactive one (the
        `aria-hidden`/`inert` decorative shell is dropped). Used by the composer
        promo fan to open the "what's on the card" explainer. */
    onCardClick?: (card: CoverCard) => void;
    /** Shared-element name for the shop grid → product-page morph. Set the
        SAME value on the grid tile's fan and on that product page's hero fan;
        the browser then morphs the fan's size and position between the two.
        Must be unique per snapshot, so exactly one visible fan may carry a
        given name at a time. Omit for decorative fans. */
    viewTransitionName?: string;
  }
  let {
    cards,
    deckId,
    deckName,
    propType = DEFAULT_SHOP_PROP,
    cardWidth = 122,
    maxCardWidth,
    maxCards = 6,
    exactCount,
    interactive = true,
    inert = true,
    deal = false,
    dealNonce = 0,
    face = "front",
    freshFront = false,
    qrUrl,
    onCoverResolved,
    onCardClick,
    viewTransitionName,
  }: Props = $props();

  // Accessible label for the clickable card — the simplified word (repeated
  // words collapse to their smallest form per TKA canon).
  const cardLabel = (c: CoverCard) => {
    const w = c.sequence?.word ? simplifyRepeatedWord(c.sequence.word) : "";
    return w ? `What's on the ${w} card` : "What's on this card";
  };

  let boxW = $state(0);

  // Fit-based layout: cards ALWAYS share the measured box, so a fan can never
  // spill its container — the old minimum-width floor overflowed the 390px
  // configurator. Card count drops (min 3) while a card would fall below
  // cardWidth; at 3 cards they shrink instead. exactCount skips the count
  // reduction and always shrinks to fit.
  // Interactive fans keep the conservative 0.82 pitch sizing (historically the
  // hover-open span; the spread is gone but the slack now absorbs the hover
  // pop's scale-up on end cards, and changing it would resize every tuned shop
  // surface). Non-interactive fans size against the REST overlap (0.48 pitch)
  // — touch layouts get ~20% bigger cards.
  const spreadPitch = $derived(interactive ? 0.82 : 0.48);
  // Tilt slack: at ±12° a 5:7 card's rotated bounding box is ~27% wider than
  // the card (w·cos12° + 1.4w·sin12°). Short rest-pitch fans carry few cards,
  // so that overhang is a big fraction of the total span and 1.05 let the
  // outer corners clip on the stage's overflow edge. Wide interactive fans
  // amortize it across 6 cards — 1.05 stays right there.
  const tiltSlack = $derived(interactive ? 1.05 : 1.18);
  const fitW = (n: number) => boxW / ((1 + spreadPitch * (n - 1)) * tiltSlack);
  const count = $derived.by(() => {
    const avail = cards.length;
    if (exactCount) return Math.max(1, Math.min(exactCount, avail));
    let n = Math.max(1, Math.min(maxCards, avail));
    while (n > 3 && boxW && fitW(n) < cardWidth) n--;
    return n;
  });
  const shown = $derived(cards.slice(0, count));
  const tilt = (i: number, n: number) => (n <= 1 ? 0 : -12 + (24 * i) / (n - 1));

  // ── deal choreography (only when `deal`) ─────────────────────────────────
  // Timing lives outside the DURATION scale on purpose: this is a one-shot
  // flourish (approved "Spring" personality from the payoff prototype), not a
  // standard UI transition. Gather is quick and unison; the deal is a
  // staggered overshoot spring.
  const DEAL_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const GATHER_EASE = "cubic-bezier(0.45, 0, 0.65, 0.4)";
  // Fixed per-slot jitter so the pile reads physical, not procedural.
  const PILE_JITTER = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.5];

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let dealt = $state(!deal);
  $effect(() => {
    if (!deal) return;
    if (reducedMotion) {
      dealt = true;
      return;
    }
    const isRedeal = dealNonce > 0;
    dealt = false;
    // First mount: one settled frame in the pile, then deal. Re-deal (nonce
    // bump): gather animates back first, then the cards sweep out again.
    const t = setTimeout(() => (dealt = true), isRedeal ? GATHER_MS + 40 : 60);
    return () => clearTimeout(t);
  });

  // Flex pitch between card lefts is cardW minus the 52% overlap; translating
  // each slot by its pitch-distance from the middle collapses the fan into
  // one centered pile.
  const pileDx = (i: number, n: number) => -(i - (n - 1) / 2) * (cardW * 0.48);
  const slotTransform = (i: number, n: number) =>
    dealt
      ? `rotate(${tilt(i, n)}deg)`
      : `translate(${pileDx(i, n)}px, 10px) rotate(${PILE_JITTER[i % PILE_JITTER.length]}deg)`;

  const maxW = $derived(maxCardWidth ?? Math.round(cardWidth * 1.8));
  const cardW = $derived(
    shown.length && boxW ? Math.round(Math.min(maxW, fitW(shown.length))) : cardWidth
  );

  // Live preview renders target the ON-SCREEN size (largest displayed width ×
  // device pixel ratio), not the 822×1122 print canvas — a fan card shows at
  // ~120–340px, so print res was rendering ~5–40× the pixels it displays. The
  // renderer quantizes this to 128px buckets, so a resize rarely re-renders.
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderWidth = $derived(Math.ceil(maxW * dpr));

  // A SEQUENCE ID DOES NOT IDENTIFY A CARD. The catalog reuses one cover
  // sequence id across decks — the three TnD trilogy decks all carry
  // `tnd-split-same-aaaa` for A sequences that differ only in turns (0, 1,
  // 0.5), and the LOOP decks share seeds like `alpha1_AΣXB` for different
  // words. `resolvedCovers` is module-level and survives every remount, so an
  // id-only key made the FIRST card to resolve paint itself onto every later
  // card sharing that id: the hero dealt TKA 3's half-turn A and drew TKA 1's
  // zero-turn art beside a phone opening the correct (and now contradicting)
  // code. Same defect the render cache had before 4b1bd29c89, so it takes the
  // same discriminators: whatever changes the pixels is in the key.
  const cardKey = (c: CoverCard) =>
    [
      c.sequence?.id ?? c.sequence?.word ?? JSON.stringify(c).slice(0, 40),
      deckId ?? "-",
      deckName ?? "-",
      c.accentColor ?? "-",
      c.footerCenter ?? "-",
      propType,
      face,
      freshFront ? "fresh" : "baked",
      freshFront ? (qrUrl ?? "no-qr") : "-",
    ].join("|");

  // key -> object URL, filled as the print renders land. Keyed per (card,
  // prop) so a prop swap keeps earlier props warm for an instant swap back.
  // SEEDED from the module-level resolved cache so a remount (the
  // configurator re-deals by remounting this component through its Crossfade)
  // paints already-rendered covers on the FIRST frame instead of flashing
  // shimmer and re-awaiting the render promise. `resolvedCovers` lives outside
  // the component so its entries survive every remount for the page session.
  let urls = $state<Record<string, string>>(seedFromCache());
  function seedFromCache(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const c of cards) {
      const hit = resolvedCovers.get(cardKey(c));
      if (hit) out[cardKey(c)] = hit;
    }
    return out;
  }

  $effect(() => {
    const prop = propType;
    if (freshFront && face === "front") {
      prewarmCovers(shown, prop, { includeBaked: true });
    }
    for (const c of shown) {
      const k = cardKey(c);
      if (urls[k]) {
        onCoverResolved?.(c, urls[k]);
        continue;
      }
      // A cover this fan hasn't seen but a prior mount rendered — paint it
      // synchronously (no shimmer) from the shared cache.
      const cached = resolvedCovers.get(k);
      if (cached) {
        urls[k] = cached;
        onCoverResolved?.(c, cached);
        continue;
      }
      // Baked covers load straight from Storage — no print pipeline. Fronts only.
      const baked = face === "front" && !freshFront ? bakedCoverUrl(c, prop) : undefined;
      if (baked) {
        urls[k] = baked;
        resolvedCovers.set(k, baked);
        onCoverResolved?.(c, baked);
        continue;
      }
      const render =
        face === "back"
          ? renderCoverBack(c, { propType: prop })
          : renderCoverFront(c, {
              deckId, deckName, propType: prop,
              ...(freshFront
                ? { qrUrl, showQRCode: Boolean(qrUrl), usePhysicalLayout: true }
                : { maxWidthPx: renderWidth }),
            });
      render
        .then((url) => {
          urls[k] = url;
          resolvedCovers.set(k, url);
          onCoverResolved?.(c, url);
        })
        .catch((e) => console.error("[DeckFanCover] cover render failed:", e));
    }
  });
</script>

<!-- The card's rendered face (image once loaded, shimmer placeholder before). -->
{#snippet cardFace(card: CoverCard)}
  {#if urls[cardKey(card)]}
    <img class="card-img" src={urls[cardKey(card)]} alt="" draggable="false" />
  {:else}
    <div class="card-pending"></div>
  {/if}
{/snippet}

<div
  class="fan"
  class:interactive
  class:dealing={deal && !reducedMotion}
  bind:clientWidth={boxW}
  inert={(inert && !onCardClick) || undefined}
  aria-hidden={onCardClick ? undefined : "true"}
  style:--overlap="{-Math.round(cardW * 0.52)}px"
  style:view-transition-name={viewTransitionName}
>
  <!-- Key carries the slot index: catalog sequence ids repeat across flavor
       catalogs, so a sampled variety hand can hold two cards with the same
       sequence id (each_key_duplicate crash without this). -->
  {#each shown as card, i (`${cardKey(card)}|${i}`)}
    <div class="fan-slot">
      <div
        class="fan-tilt"
        style:transform={slotTransform(i, shown.length)}
        style:transition-duration={deal ? `${dealt ? DEAL_MS : GATHER_MS}ms` : undefined}
        style:transition-timing-function={deal ? (dealt ? DEAL_EASE : GATHER_EASE) : undefined}
        style:transition-delay={deal && dealt ? `${i * DEAL_STAGGER}ms` : undefined}
      >
        <!-- `data-card-box` is the measurement seam: this element is exactly
             the TRIMMED card (the guillotine cut, 5:7), so a host that needs
             to land something on a printed region — the shop hero's scan band
             over the QR cell — can find the card's real box without depending
             on this component's class names. -->
        <div class="card-box" data-card-box style:width="{cardW}px">
          {#if onCardClick}
            <button
              type="button"
              class="card-hit"
              aria-label={cardLabel(card)}
              onclick={() => onCardClick?.(card)}
            >
              {@render cardFace(card)}
            </button>
          {:else}
            {@render cardFace(card)}
          {/if}
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .fan {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    padding: 18px 0 10px;
    width: 100%;
  }

  .fan-slot {
    position: relative;
    z-index: 0;
    /* RELEASE choreography (this base state governs the unhover transition):
       the card tucks back with the deal animation's spring — it undershoots
       below rest size, then settles. The z-drop is discrete and repaints the
       whole overlap with the right neighbor, so it can never be smooth; timed
       at the bottom of the undershoot (~0.18s, where motion peaks) it reads as
       the card slipping back INTO the fan instead of a static snap after the
       shrink (which is exactly how it read when delayed to the end). */
    transition:
      transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      z-index 0s 0.18s;
    /* Pop grows AROUND the card's base, never sliding it away from the
       pointer. Bottom-center origin means every edge either stays put (bottom)
       or moves outward — the hit area under a stationary cursor only ever
       grows, so hover can't flicker and a click can't land on a neighbor. */
    transform-origin: bottom center;
  }
  .fan-slot + .fan-slot {
    margin-left: var(--overlap);
  }
  /* Card-hand hover: the ROW never moves (no spread, no shift — moving cards
     under a stationary cursor is what caused mis-hover/mis-clicks). Only the
     card under the pointer responds: it rises above its neighbors and scales
     up from its base, fully revealing itself. Same pop on keyboard focus.
     Rise is snappy and immediate (no z delay in this direction — the pop-in
     motion carries it); the springy exit lives on the base state above. */
  .fan.interactive .fan-slot:hover,
  .fan.interactive .fan-slot:focus-within {
    transform: scale(1.14);
    z-index: 9;
    transition:
      transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
      z-index 0s 0s;
  }
  .fan.interactive .fan-slot:hover .card-box,
  .fan.interactive .fan-slot:focus-within .card-box {
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  }

  .fan-tilt {
    transform-origin: bottom center;
  }
  /* Deal-in: the inline styles above drive per-card duration/ease/stagger;
     the property registration lives here so non-dealing fans never animate. */
  .fan.dealing .fan-tilt {
    transition-property: transform;
    will-change: transform;
  }

  /* Trimmed-card box: the render is the full MPC canvas WITH bleed
     (822×1122, 36px bleed → 750×1050 cut, exactly 5:7). object-fit: cover
     only trims the tiny aspect difference (~2.5%), which left the hatched
     bleed frame visible and the corners looking chopped. Overscan the image
     by the exact bleed fractions instead — the guillotine cut, for real:
     822/750 = 109.6% wide, 1122/1050 = 106.857% tall, offset by one bleed. */
  .card-box {
    position: relative;
    aspect-ratio: 5 / 7;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
    background: #f4f4f4;
    /* Shadow deepens in step with the hover pop. */
    transition: box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Clickable overlay: fills the card box so the whole card is the hit target
     and the overscanned image positions against it exactly as it does against
     .card-box. Transparent, inherits the rounded corners. */
  .card-hit {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    border-radius: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .card-hit:focus-visible {
    outline: 3px solid oklch(0.8 0.13 275);
    outline-offset: 3px;
  }

  .card-img {
    position: absolute;
    /* Global reset sets img { max-width: 100% }, which clamps the overscan
       and leaves a bleed-wide white strip on the right. */
    max-width: none;
    width: 109.6%;
    height: 106.857%;
    left: -4.8%;
    top: -3.4286%;
    display: block;
    animation: card-in 220ms ease both;
  }

  @keyframes card-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Reserved blank card while the print render lands — same box, no shift. */
  .card-pending {
    width: 100%;
    height: 100%;
    background: linear-gradient(110deg, #ececf2 40%, #f8f8fc 50%, #ececf2 60%);
    background-size: 220% 100%;
    animation: shimmer 1.4s linear infinite;
  }

  @keyframes shimmer {
    from {
      background-position: 130% 0;
    }
    to {
      background-position: -90% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fan-slot,
    .card-box {
      transition: none;
    }
    /* No pop motion — the shadow deepen stays as a static hover cue. */
    .fan.interactive .fan-slot:hover,
    .fan.interactive .fan-slot:focus-within {
      transform: none;
    }
    .card-img {
      animation: none;
    }
    .card-pending {
      animation: none;
    }
  }
</style>

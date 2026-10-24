<!--
  GalleryLanding — the editorial front door.

  Screen 1 of the gallery: three hero doors (By level / By length / By
  mandala), "Show all",
  and the "More ways to browse" grid of CategoryTiles. Every visual carries
  data — the hero fans preview REAL sequences from their bucket (deterministic
  picks, fixed tilts), and the mini tiles preview real glyphs, real faces, real
  component colors.

  Split out of GalleryDrill.svelte 2026-08-04 (split-pane workspace project).
  The workspace half lives in GalleryWorkspace.svelte; the tile they share is
  CategoryTile.svelte.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SequencePeek from "#lib/shared/browse/components/SequencePeek.svelte";
  import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
  import CategoryTile from "./CategoryTile.svelte";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    FAN_TILTS,
    LEVELS,
    type CategoryEntry,
    type GalleryCatalog,
  } from "./gallery-drill-catalog.svelte";

  interface Props {
    catalog: GalleryCatalog;
    poolSize: number;
    loading?: boolean;
    loadFailed?: boolean;
    showAll: boolean;
    chooserTitle?: string;
    chooserHint?: string;
    sheet: boolean;
    fluidWideCanvas: boolean;
    /** Glyph art height for the Starting-letter tile (adaptive hosts bump it). */
    glyphHeight: number;
    /** The landing owns the category morph names while it is the live screen. */
    morph?: boolean;
    onOpenSection: (section: "level" | "length" | "mandala") => void;
    onShowAll?: () => void;
    onSelectCategory: (entry: CategoryEntry) => void;
  }

  let {
    catalog,
    poolSize,
    loading = false,
    loadFailed = false,
    showAll,
    chooserTitle,
    chooserHint,
    sheet,
    fluidWideCanvas,
    glyphHeight,
    morph = false,
    onOpenSection,
    onShowAll,
    onSelectCategory,
  }: Props = $props();

  /** The door's fan always holds three slots, so nothing moves as keys arrive. */
  const FAN_SLOTS = [0, 1, 2] as const;
  const fanSize = $derived(Math.round(catalog.PEEK.fanH * 0.78));

  /** Room the tilted cards' corners need past the fan's own box. */
  const TILT_ROOM = 10;

  // A door's art is sized in px per layout tier, but four doors in one row
  // left it wider than the tile, and it painted over the words. This shrinks
  // the art to the width of its slot (never past its own size) and gives the
  // slot the scaled height, so the art always sits inside the door. Transform
  // leaves offsetWidth/Height at the natural size, which is what we divide by.
  function fitArt(node: HTMLElement) {
    const slot = node.parentElement;
    if (!slot) return;
    const fit = () => {
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(1, Math.max(0, slot.clientWidth - TILT_ROOM) / w);
      node.style.transform = s < 1 ? `scale(${s})` : "";
      slot.style.height = `${Math.ceil(h * s + TILT_ROOM)}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    observer.observe(node);
    fit();
    return { destroy: () => observer.disconnect() };
  }
</script>

<div class="drill-screen screen-chooser" class:sheet aria-busy={loading}>
  <header class="drill-head">
    <h2 tabindex="-1">
      {chooserTitle ??
        (sheet ? t("browse_ui_filter_sequences") : t("browse_ui_how_browse"))}
    </h2>
    <p role="status">
      {loading
        ? poolSize > 0
          ? t("browse_ui_loading_gallery")
          : t("browse_ui_loading_sequences")
        : (chooserHint ??
          (sheet ? t("browse_ui_counts_update") : t("browse_ui_pick_one")))}
    </p>
  </header>

  <!-- hero-grid: single column on phones (identical to the old stacked
       flow), two-up on wide containers so the front door actually uses a
       desktop monitor instead of floating as a 520px ribbon. -->
  <div
    class="hero-grid"
    class:without-show-all={!showAll}
    class:fluid-wide-canvas={fluidWideCanvas}
  >
    <!-- The two hero doors claim the Level and Length category names, so on
         the way into the workspace they morph into those two catalog tiles
         instead of dissolving and reappearing somewhere else. -->
    <button
      class="choice-tile"
      type="button"
      disabled={(loading || loadFailed) && poolSize === 0}
      use:claimedViewTransitionName={{
        name: "gallery-cat-level",
        enabled: morph,
      }}
      onclick={() => onOpenSection("level")}
    >
      <span class="choice-main">
        <span class="choice-title">{t("browse_ui_by_level")}</span>
        <span class="choice-sub">{t("browse_ui_beginner_to_advanced")}</span>
      </span>
      <span class="secondary-door-art compact-door-art" aria-hidden="true">
        <i class="fas fa-signal"></i>
      </span>
      <span class="door-art" aria-hidden="true">
        <span class="peek-fan" use:fitArt>
          {#each LEVELS as lvl, i (lvl)}
            <SequencePeek
              sequence={catalog.levelReps.get(lvl)}
              {loading}
              width={catalog.PEEK.fanW}
              height={catalog.PEEK.fanH}
              tilt={FAN_TILTS[i]}
            >
              {#snippet overlay()}
                <DifficultyBadge level={lvl} size={catalog.PEEK.badge} />
              {/snippet}
            </SequencePeek>
          {/each}
        </span>
      </span>
      <i class="fas fa-chevron-right drill-chev" aria-hidden="true"></i>
    </button>

    <button
      class="choice-tile"
      type="button"
      disabled={(loading || loadFailed) && poolSize === 0}
      use:claimedViewTransitionName={{
        name: "gallery-cat-length",
        enabled: morph,
      }}
      onclick={() => onOpenSection("length")}
    >
      <span class="choice-main">
        <span class="choice-title">{t("browse_ui_by_length")}</span>
        <span class="choice-sub">{catalog.lengthSub}</span>
      </span>
      <span class="secondary-door-art compact-door-art" aria-hidden="true">
        <i class="fas fa-ruler-horizontal"></i>
      </span>
      <span class="door-art" aria-hidden="true">
        <span class="peek-fan pair" use:fitArt>
          <SequencePeek
            sequence={catalog.lengthPair.short}
            {loading}
            width={catalog.PEEK.shortW}
            height={catalog.PEEK.shortH}
            tilt={-3}
          />
          <SequencePeek
            sequence={catalog.lengthPair.long}
            {loading}
            width={catalog.PEEK.longW}
            height={catalog.PEEK.longH}
            tilt={3}
          />
        </span>
      </span>
      <i class="fas fa-chevron-right drill-chev" aria-hidden="true"></i>
    </button>

    <!-- By mandala: the pool's distinct mandalas, sparse to dense. Its fan is
         three real mandalas from the pool, one from each band. -->
    <button
      class="choice-tile"
      type="button"
      disabled={(loading || loadFailed) && poolSize === 0}
      use:claimedViewTransitionName={{
        name: "gallery-cat-mandala",
        enabled: morph,
      }}
      onclick={() => onOpenSection("mandala")}
    >
      <span class="choice-main">
        <span class="choice-title">{t("browse_ui_by_mandala")}</span>
        <span class="choice-sub">{t("browse_ui_sparse_to_dense")}</span>
      </span>
      <span class="secondary-door-art compact-door-art" aria-hidden="true">
        <i class="fas fa-dharmachakra"></i>
      </span>
      <span class="door-art" aria-hidden="true">
        <span class="mandala-fan" use:fitArt>
          {#each FAN_SLOTS as slot (slot)}
            {@const group = catalog.mandalaFan[slot]}
            <span
              class="mandala-slot"
              class:filled={group !== undefined}
              style:width="{fanSize}px"
              style:height="{fanSize}px"
              style:transform="rotate({FAN_TILTS[slot]}deg)"
            >
              {#if group}
                <MandalaStill
                  key={group.key}
                  paths={group.paths}
                  size={fanSize}
                />
              {/if}
            </span>
          {/each}
        </span>
      </span>
      <i class="fas fa-chevron-right drill-chev" aria-hidden="true"></i>
    </button>

    <!-- Show-all lives IN the hero rank: it's the main door, not a footnote. -->
    {#if showAll}
      <button
        class="choice-tile compact"
        type="button"
        disabled={(loading || loadFailed) && poolSize === 0}
        onclick={() => onShowAll?.()}
      >
        <span class="choice-main">
          <span class="choice-title"
            >{loading || loadFailed
              ? t("browse_ui_show_all_sequences")
              : t("browse_ui_show_all_count", { count: poolSize })}</span
          >
          <span class="choice-sub"
            >{t("browse_ui_the_whole_gallery_one_grid")}</span
          >
        </span>
        <span class="door-art" aria-hidden="true">
          <span class="peek-collage" use:fitArt>
            {#each catalog.collageSlots as seq, i (i)}
              <SequencePeek
                sequence={seq}
                {loading}
                width={catalog.PEEK.collW}
                height={catalog.PEEK.collH}
              />
            {/each}
          </span>
        </span>
        <i class="fas fa-chevron-right drill-chev" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  {#if poolSize > 0}
    <div class="inline-secondary-choices">
      <p class="more-head">{t("browse_ui_more_ways_to_browse")}</p>
      <div class="mini-grid" class:fluid-wide-canvas={fluidWideCanvas}>
        {#each catalog.secondaryCategories as entry (entry.key)}
          <CategoryTile
            {entry}
            {glyphHeight}
            {morph}
            avatarFor={(name) => catalog.creatorAvatars.get(name)}
            onselect={onSelectCategory}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Each screen fills its (absolute, stage-sized) crossfade layer and owns its
     own scroll; short screens center, tall ones scroll from the top. */
  .drill-screen {
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    overflow-y: auto;
  }
  /* Sheet variant: fills the fixed-height drawer body, top-aligned. */
  .drill-screen.sheet {
    justify-content: flex-start;
  }
  .drill-head {
    display: block;
    text-align: center;
  }
  .drill-head h2 {
    margin: 0 0 0.2rem;
    font-size: 1.25rem;
    font-weight: 800;
    text-transform: none;
    color: var(--theme-text, #e8edf6);
  }
  /* Headings receive PROGRAMMATIC focus after navigation (screen-reader
     anchor, WCAG 2.4.3) — a visible ring on a non-interactive heading reads
     as a broken control. */
  .drill-head h2:focus {
    outline: none;
  }
  .drill-head p {
    margin: 0;
    font-size: 0.88rem;
    color: var(--theme-text-muted, #9aa6b8);
  }

  /* Phone: one column, same rhythm as the old stacked flow. */
  .hero-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    width: 100%;
  }
  .choice-tile {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    width: 100%;
    min-height: 116px;
    padding: 0.9rem 2rem 0.9rem 1.1rem;
    text-align: left;
    border-radius: 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    overflow: hidden;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }
  .choice-tile:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    transform: translateY(-1px);
  }
  .choice-tile:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .choice-tile.compact {
    min-height: 84px;
  }
  .secondary-door-art {
    display: flex;
    width: 3.25rem;
    height: 3.25rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    margin-right: 0.25rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 45%, transparent);
    border-radius: 1rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 14%,
      transparent
    );
    color: var(--theme-accent, #6366f1);
    font-size: 1.15rem;
  }
  .compact-door-art {
    display: none;
  }
  .choice-main {
    /* The words keep their own width; the art slot takes what is left. */
    flex: 0 1 auto;
    max-width: 60%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }
  .choice-title {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .choice-sub {
    font-size: 0.82rem;
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }
  .drill-chev {
    position: absolute;
    right: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-muted, #9aa6b8);
    font-size: 0.85rem;
  }

  /* The art slot takes the room the words leave. fitArt scales the art
     inside it down to that width and sets the slot's height, so the art
     never runs past the door or over its words. */
  .door-art {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  .door-art > * {
    flex: none;
    transform-origin: right center;
  }
  /* Peek fan: fixed tilts, overlapping. */
  .peek-fan {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  .peek-fan > :global(.peek + .peek) {
    margin-left: -1.4rem;
  }
  .peek-fan.pair > :global(.peek + .peek) {
    margin-left: -0.6rem;
  }
  /* The mandala door's fan: three square slots, tilted and overlapping like
     the sequence fans, sized up front so a slot filling in moves nothing. */
  .mandala-fan {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  .mandala-slot {
    display: block;
    flex: 0 0 auto;
    padding: 0.2rem;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, #11131a);
  }
  .mandala-slot + .mandala-slot {
    margin-left: -1rem;
  }
  .peek-collage {
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: 3px;
  }

  /* ── Tier 2: more ways to browse ───────────────────────────────── */
  .more-head {
    margin: 0.35rem 0 -0.25rem;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-muted, #9aa6b8);
    text-align: center;
  }
  .inline-secondary-choices {
    display: contents;
  }
  .mini-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.6rem;
  }

  .choice-tile:active {
    transform: scale(0.985);
  }

  @media (prefers-reduced-motion: reduce) {
    .choice-tile {
      transition: none;
    }
    .choice-tile:hover,
    .choice-tile:active {
      transform: none;
    }
  }

  /* ── Mid tier: unfolded foldables + small tablets (640–899px) ────── */
  @container drill (min-width: 640px) and (max-width: 899.98px) {
    .hero-grid {
      grid-template-columns: 1fr 1fr;
    }
    .choice-tile.compact,
    .choice-tile:nth-child(3) {
      grid-column: 1 / -1;
    }
    .mini-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      /* The longest sub-lines ("Sequences added in the last 30 days · 40")
         run to four lines in a 165px tile while their neighbours hold two, so
         the rows stepped. Equal rows keep the set reading as one grid. */
      grid-auto-rows: 1fr;
    }
    /* Exactly six minis square up 3x2 — a 4+2 ragged break reads as an
       accident, not a set. */
    .mini-grid:has(> :global(:nth-child(6):last-child)) {
      grid-template-columns: repeat(3, 1fr);
    }
    /* Show-all spans the full row at this tier — a 4-across strip fills the
       horizontal air instead of the phone's 2x2 collage stamp. */
    .peek-collage {
      grid-template-columns: repeat(4, auto);
      margin-right: 0.6rem;
    }
  }
  /* From 700px the auto-fill above already lands on four columns, and the
     desktop tiers pin four, which leaves the sequence picker's ten minis
     4+4+2 at every width. Let the last pair take the width the missing pair
     would have had (`4k-native-layout.md` rule 2). Scoped to exactly ten so
     the six-tile 3x2 rule and any other count keep their own shape. */
  @container drill (min-width: 700px) {
    .mini-grid:has(> :global(:nth-child(10):last-child)) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .mini-grid:has(> :global(:nth-child(10):last-child))
      > :global(:nth-child(9)),
    .mini-grid:has(> :global(:nth-child(10):last-child))
      > :global(:nth-child(10)) {
      grid-column: span 2;
    }
  }

  /* ── Desktop (wide container) ────────────────────────────────────── */
  @container drill (min-width: 900px) {
    .drill-screen {
      gap: 1rem;
    }
    .drill-head h2 {
      font-size: 1.6rem;
    }
    .drill-head p {
      font-size: 0.95rem;
    }
    /* Chooser: the three big doors side by side, taller and roomier. */
    .hero-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
    }
    .choice-tile {
      min-height: 158px;
      padding: 1.15rem 2.4rem 1.15rem 1.5rem;
      border-radius: 22px;
    }
    .choice-tile.compact {
      min-height: 92px;
      grid-column: 1 / -1;
    }
    /* Three or four doors share the row here, so a door is too narrow for
       words and art side by side: the words sit on top and the art fills the
       door's width beneath them. Show-all spans the row and keeps its strip. */
    .choice-tile:not(.compact) {
      flex-direction: column;
      align-items: stretch;
    }
    .choice-tile:not(.compact) .choice-main {
      max-width: none;
    }
    .choice-tile:not(.compact) .door-art {
      flex: 1 0 auto;
      justify-content: center;
    }
    .choice-tile:not(.compact) .door-art > * {
      transform-origin: center center;
    }
    .choice-title {
      font-size: 1.3rem;
    }
    .choice-sub {
      font-size: 0.92rem;
    }
    .more-head {
      margin-top: 0.75rem;
    }
    .mini-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 0.8rem;
    }
  }

  /* ── Ultra-wide (4K-class) ───────────────────────────────────────── */
  @container drill (min-width: 1600px) {
    .drill-head h2 {
      font-size: 1.85rem;
    }
    .drill-head p {
      font-size: 1.05rem;
    }
    .hero-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1.1rem;
    }
    .hero-grid.without-show-all {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      max-width: 1740px;
      justify-self: center;
    }
    .choice-tile,
    .choice-tile.compact {
      min-height: 216px;
      grid-column: auto;
      padding: 1.3rem 2.6rem 1.3rem 1.7rem;
      border-radius: 24px;
    }
    /* Show-all joins the row as a fourth door, so it stacks like the others. */
    .choice-tile.compact {
      flex-direction: column;
      align-items: stretch;
    }
    .choice-tile.compact .choice-main {
      max-width: none;
    }
    .choice-tile.compact .door-art {
      flex: 1 0 auto;
      justify-content: center;
    }
    .choice-tile.compact .door-art > * {
      transform-origin: center center;
    }
    .choice-title {
      font-size: 1.45rem;
    }
    .choice-sub {
      font-size: 1rem;
    }
    .mini-grid {
      gap: 1rem;
    }

    /* A focused full-screen host can opt into a band that grows through the
       three 4K tiers. */
    .hero-grid.fluid-wide-canvas.without-show-all {
      max-width: clamp(72.5rem, 65cqw, 146rem);
      align-self: center;
      justify-self: auto;
    }
    .hero-grid.fluid-wide-canvas .choice-tile,
    .hero-grid.fluid-wide-canvas .choice-tile.compact {
      min-height: clamp(13.5rem, 12cqw, 20rem);
      padding: clamp(1.3rem, 1.1cqw, 2.2rem) clamp(2.6rem, 2cqw, 4rem)
        clamp(1.3rem, 1.1cqw, 2.2rem) clamp(1.7rem, 1.4cqw, 2.8rem);
      border-radius: clamp(1.5rem, 1.1cqw, 2rem);
    }
    .hero-grid.fluid-wide-canvas .choice-title {
      font-size: clamp(1.45rem, 1.05cqw, 2rem);
    }
    .hero-grid.fluid-wide-canvas .choice-sub {
      font-size: clamp(1rem, 0.72cqw, 1.35rem);
    }
    .mini-grid.fluid-wide-canvas :global(.mini-tile) {
      min-height: clamp(5.75rem, 5cqw, 8.5rem);
      padding: clamp(0.9rem, 0.72cqw, 1.35rem) clamp(1.1rem, 0.9cqw, 1.7rem);
      border-radius: clamp(1rem, 0.7cqw, 1.5rem);
    }
    .mini-grid.fluid-wide-canvas :global(.mini-title) {
      font-size: clamp(1.05rem, 0.78cqw, 1.4rem);
    }
    .mini-grid.fluid-wide-canvas :global(.mini-sub) {
      font-size: clamp(0.82rem, 0.58cqw, 1.05rem);
    }
  }
</style>

<!--
  CategoryRail — the persistent desktop filter catalog.

  A vertical rail of CategoryTiles beside the active value editor, so the
  desktop workspace never forces a Back-driven drilldown. Rendered only by
  hosts that opt into `persistentDesktopCatalog`, and only once there is real
  width AND height for it (the display gate below).

  The tiles style themselves (`composition="rail"`); this component owns only
  the nav shell and the grid.

  Split out of GalleryDrill.svelte 2026-08-04.
-->
<script lang="ts">
  import CategoryTile from "./CategoryTile.svelte";
  import type {
    CategoryEntry,
    GalleryCatalog,
    Section,
  } from "./gallery-drill-catalog.svelte";

  interface Props {
    catalog: GalleryCatalog;
    section: Section;
    /** "rail" = the tall single-column catalog beside a value editor.
     *  "catalog" = the split pane's wrapping grid above the value editor. */
    layout?: "rail" | "catalog";
    /** Active rules per category key — renders the count dot. */
    ruleCounts?: Readonly<Record<string, number>>;
    /** This surface owns the category morph names right now. */
    morph?: boolean;
    /** Catalog layout with no value editor below it (the "Show all" pane): the
     * tiles take the whole column instead of leaving a blank half. */
    fill?: boolean;
    onselect: (entry: CategoryEntry) => void;
  }

  let {
    catalog,
    section,
    layout = "rail",
    ruleCounts,
    morph = false,
    fill = false,
    onselect,
  }: Props = $props();

</script>

<nav
  class="desktop-filter-catalog"
  class:catalog-layout={layout === "catalog"}
  class:fill
  data-section={section}
  aria-label="Filter categories"
>
  {#if layout === "rail"}<h2>Filters</h2>{/if}
  <div class="desktop-filter-grid">
    {#each [...catalog.primaryCategories, ...catalog.secondaryCategories] as entry (entry.key)}
      <!-- The cell is a size container so the TILE can answer the question
           only the resolved layout knows: do I have enough height to stop
           being a row and become a poster? (CategoryTile's `cat-cell` query.) -->
      <div class="cat-cell">
        <CategoryTile
          {entry}
          composition={layout === "catalog" ? "catalog" : "rail"}
          active={section === entry.section}
          ruleCount={ruleCounts?.[entry.key] ?? 0}
          {morph}
          avatarFor={(name) => catalog.creatorAvatars.get(name)}
          {onselect}
        />
      </div>
    {/each}
  </div>
</nav>

<style>
  /* Hidden until the two-dimensional desktop seam below. Compact phones, Fold
     modes, and portrait tablets all stay under it. */
  .desktop-filter-catalog {
    display: none;
  }

  /* Split-pane composition: every category visible as a compact labeled tile,
     two per row, above the value editor. No display gate — the pane itself is
     the gate (GalleryDrill only renders this layout past the split seam). */
  /* The catalog is one half of the column's height budget: it never shrinks
     below its natural rows, and it grows into whatever the value editor's card
     ceiling leaves over — up to `--catalog-ceiling`, which is its own row count
     at the tallest a tile should ever be. Past that the surplus goes back to
     the editor (GalleryPaneLeft owns the flex; this owns the ceiling). */
  .desktop-filter-catalog.catalog-layout {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    /* 2 columns → 6 rows. A 6-row catalog at 8.5rem a tile is 51rem of art and
       label; taller than that and the tiles read as posters, not a picker. */
    --catalog-rows: 6;
    --catalog-tile-max: 8.5rem;
    /* The tile's floor lives HERE, not on the tile: `pane-height-budget.ts`
       sizes the catalog from this track minimum, so a floor authored on
       CategoryTile is invisible to the budget and the tile overhangs its row. */
    --catalog-tile-min: 3.4rem;
    --catalog-gap: 0.4rem;
    max-height: calc(
      var(--catalog-rows) * var(--catalog-tile-max) +
        (var(--catalog-rows) - 1) * var(--catalog-gap) + 1.5rem
    );
  }
  .catalog-layout .desktop-filter-grid {
    display: grid;
    min-height: 0;
    flex: 1 1 auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: minmax(var(--catalog-tile-min, 3.4rem), 1fr);
    gap: var(--catalog-gap);
  }
  .cat-cell {
    display: flex;
    min-width: 0;
    min-height: 0;
    container-type: size;
    container-name: cat-cell;
  }
  /* Eleven into two columns strands the eleventh on a row of its own
     (`4k-native-layout.md` rule 2). It spans the row instead. */
  .catalog-layout .desktop-filter-grid > .cat-cell:last-child {
    grid-column: 1 / -1;
  }
  /* No editor below: the catalog takes the whole column. */
  .desktop-filter-catalog.catalog-layout.fill {
    /* Zero basis: an `auto` basis is the eleven rows' natural height, which
       grows past the column and pushes the hint below it out of view. */
    flex: 1 1 0;
    max-height: none;
  }
  /* The column itself is the container here, so this steps with the pane, not
     with the window: eleven categories go three-across once there is room,
     which keeps the catalog to four rows instead of six. */
  @container drill (min-width: 620px) {
    .desktop-filter-catalog.catalog-layout {
      --catalog-rows: 4;
      --catalog-tile-max: 15rem;
      --catalog-gap: 0.6rem;
    }
    .catalog-layout .desktop-filter-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    /* 11 into 3 columns leaves a row of two — no orphan, so the last tile
       keeps its own width. */
    .catalog-layout .desktop-filter-grid > .cat-cell:last-child {
      grid-column: auto;
    }
  }
  /* The row floor steps with the tile's own padding/type tiers in
     CategoryTile (same 1680 / 2600 viewport seams). Keeping the two in lockstep
     is the whole point of owning the floor here. */
  @media (min-width: 1680px) {
    .desktop-filter-catalog.catalog-layout {
      --catalog-tile-min: 4rem;
    }
  }
  @media (min-width: 2600px) {
    .desktop-filter-catalog.catalog-layout {
      --catalog-tile-min: 5.25rem;
    }
  }
  /* 4K at 100% and portrait desktops: the column is ~2100px tall and three
     cards cannot fill it without becoming slabs, so the ceiling rises here and
     the tiles take the surplus instead (`4k-native-layout.md` rule 4). */
  @media (min-height: 1600px) {
    .desktop-filter-catalog.catalog-layout {
      --catalog-tile-max: 11rem;
    }
    @container drill (min-width: 620px) {
      .desktop-filter-catalog.catalog-layout {
        --catalog-tile-max: 20rem;
      }
    }
  }

  @media (min-height: 650px) {
    @container drill (min-width: 900px) {
      /* The rail persists only while EDITING a value, so the first chooser
         stays a clean overview. */
      /* Rail composition only. The split pane's catalog layout owns its own
         box; without this guard a left column wider than 900px (the 4K tier)
         pulls the rail's single-column, overflow-hidden grid over it and the
         tiles collapse to nothing. */
      .desktop-filter-catalog:not(.catalog-layout):not(
          [data-section="chooser"]
        ) {
        display: flex;
      }

      .desktop-filter-catalog:not(.catalog-layout) {
        min-width: 0;
        min-height: 0;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.75rem;
        overflow: hidden;
        border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
        border-radius: 1.1rem;
        background: color-mix(
          in srgb,
          var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 72%,
          transparent
        );
      }

      .desktop-filter-catalog h2 {
        margin: 0;
        color: var(--theme-text, #e8edf6);
        font-size: 1rem;
        font-weight: 800;
      }

      .desktop-filter-catalog:not(.catalog-layout) .desktop-filter-grid {
        display: grid;
        min-height: 0;
        flex: 1 1 0;
        grid-template-columns: minmax(0, 1fr);
        grid-auto-rows: minmax(44px, 1fr);
        gap: 0.4rem;
        /* Twelve rows at their 44px floor need about 600px. A column shorter
           than that (the sequence picker at 1440×900 gives it 620px minus its
           heading) used to clip the last tile in half behind `overflow:
           hidden`; the rail scrolls the remainder instead. */
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
      }
    }
  }

  @media (min-height: 1150px) {
    @container drill (min-width: 1200px) {
      .desktop-filter-catalog h2 {
        font-size: 1.15rem;
      }
    }
  }
</style>

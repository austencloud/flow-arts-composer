<!--
  CategoryTile — ONE tile, three compositions.

  The gallery landing's "More ways to browse" grid, the workspace's persistent
  desktop rail, and the unified filter canvas all render this component. One
  component, several layouts: drift between the landing and the workspace is
  impossible by construction (2026-08-04 split-pane workspace project).

  The tile owns its own box AND every composition variant, so hosts never reach
  inside it — they lay out their grid, the tile styles itself.
-->
<script lang="ts">
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import LessonGridDisplay from "$lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import type { CategoryEntry } from "./gallery-drill-catalog.svelte";

  interface Props {
    entry: CategoryEntry;
    /** Which surface is rendering this tile. */
    composition?: "landing" | "rail" | "unified" | "catalog";
    /** True when this category's value editor is the one on screen. */
    active?: boolean;
    /** Active rules this category carries — rendered as a count dot. */
    ruleCount?: number;
    /** Owns this category's `gallery-cat-<key>` morph name while true. The
     * surface on its way out passes false so the incoming one takes it. */
    morph?: boolean;
    /** Glyph art height — the landing bumps it inside the adaptive tier. */
    glyphHeight?: number;
    /** Creator avatars: photo + owner id per name. */
    avatarFor?: (
      name: string
    ) => { avatarUrl?: string; ownerId?: string } | undefined;
    onselect: (entry: CategoryEntry) => void;
  }

  let {
    entry,
    composition = "landing",
    active = false,
    ruleCount = 0,
    morph = false,
    glyphHeight = 20,
    avatarFor,
    onselect,
  }: Props = $props();

  // TKAWordGlyph sizes everything from a px number, so CSS cannot scale it the
  // way it scales the icon glyphs and dots. The tile measures its own art box
  // instead and hands the glyph a share of it — otherwise "Starting letter"
  // stays a 20px ABC in a 71px slot while every sibling grew.
  let artHeight = $state(0);
  const glyphArtHeight = $derived(
    composition === "landing"
      ? glyphHeight
      : Math.max(glyphHeight, Math.round(artHeight * 0.78))
  );
</script>

<button
  class="mini-tile"
  class:unified={composition === "unified"}
  class:rail={composition === "rail"}
  class:catalog={composition === "catalog"}
  class:catalog-active={active}
  type="button"
  aria-current={active ? "page" : undefined}
  disabled={entry.narrowedOut}
  use:claimedViewTransitionName={{
    name: `gallery-cat-${entry.key}`,
    enabled: morph,
  }}
  onclick={() => onselect(entry)}
>
  {#if entry.art.kind === "plate"}
    <span class="mini-art plate position-preview" aria-hidden="true">
      <img src={entry.art.src} alt="" width="32" height="32" loading="lazy" />
    </span>
  {:else if entry.art.kind === "grid"}
    <span class="mini-art grid-composite-preview" aria-hidden="true">
      <LessonGridDisplay type="merged" size="small" />
    </span>
  {:else}
    <span class="mini-art" aria-hidden="true" bind:clientHeight={artHeight}>
      {#if entry.art.kind === "icon"}
        <i class="fas {entry.art.icon}"></i>
      {:else if entry.art.kind === "glyph"}
        <TKAWordGlyph
          word={entry.art.word}
          height={glyphArtHeight}
          darkMode
          fitToParent
        />
      {:else if entry.art.kind === "dots"}
        <span class="element-dots">
          {#each entry.art.colors as color (color)}
            <span class="element-dot" style:background={color}></span>
          {/each}
        </span>
      {:else if entry.art.kind === "avatars"}
        <span class="avatar-cluster">
          {#each entry.art.names as name (name)}
            <RobustAvatar
              class="cluster-avatar"
              src={avatarFor?.(name)?.avatarUrl}
              googleId={avatarFor?.(name)?.ownerId}
              {name}
              alt=""
              customSize={26}
            />
          {/each}
        </span>
      {/if}
    </span>
  {/if}
  <span class="mini-main">
    <span class="mini-title">{entry.title}</span>
    <span class="mini-sub">{entry.sub}</span>
  </span>
  <!-- Slot always reserved: a dot appearing must not resize the tile. -->
  <span class="rule-dot" class:on={ruleCount > 0} aria-hidden={ruleCount === 0}>
    {ruleCount > 0 ? ruleCount : ""}
  </span>
</button>

<style>
  .mini-tile {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.6rem;
    min-height: 64px;
    padding: 0.6rem 0.7rem;
    text-align: left;
    border-radius: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    /* Background and shadow ride the same curve as the border: selecting a
       category used to snap its highlight on with no motion at all. */
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;
  }
  .mini-tile:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    transform: translateY(-1px);
  }
  .mini-tile:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .mini-art {
    flex: 0 0 auto;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 44px;
    height: 32px;
    color: var(--theme-text-muted, #9aa6b8);
    font-size: 1rem;
  }
  /* Legacy PNGs/SVGs draw dark lines — give them the same white plate the
     legacy app rendered them on. */
  .mini-art.plate {
    background: #fff;
    border-radius: 8px;
    padding: 3px 4px;
  }
  /* The grid preview SVG sizes to its own 180px max when the flex item is
     auto-sized — pin the box so it stays a mini-tile icon on the landing. */
  .mini-art.grid-composite-preview {
    width: 2rem;
    min-width: 2rem;
    height: 2rem;
    overflow: hidden;
    border-radius: 8px;
    align-self: center;
  }
  .mini-art.grid-composite-preview :global(.lesson-grid-display),
  .mini-art.grid-composite-preview :global(.grid-svg) {
    width: 100%;
    max-width: none;
    height: 100%;
  }
  .mini-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .mini-title {
    font-size: 0.9rem;
    font-weight: 700;
  }
  .mini-sub {
    font-size: 0.75rem;
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  /* ── Creator avatar cluster (mini-tile art) ────────────────────── */
  /* Overlapped faces, most-prolific on top of the stack. */
  .avatar-cluster {
    display: flex;
    flex-direction: row;
    align-items: center;
  }
  .avatar-cluster > :global(.robust-avatar + .robust-avatar) {
    margin-left: -9px;
  }
  .avatar-cluster :global(.cluster-avatar.robust-avatar) {
    border: 2px solid rgba(12, 16, 24, 0.9);
  }

  /* ── Family / loop color dots (mini-tile art) ──────────────────── */
  .element-dots {
    display: flex;
    flex-direction: row;
    gap: 4px;
  }
  .element-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* Stability over deletion: catalog tiles that a rule change zeroes out dim
     instead of unmounting (audit X-4/D-5). */
  .mini-tile:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .mini-tile:disabled:hover {
    transform: none;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Instant tap feedback — touch has no :hover. */
  .mini-tile:active {
    transform: scale(0.985);
  }

  @media (prefers-reduced-motion: reduce) {
    .mini-tile {
      transition: none;
    }
    .mini-tile:hover,
    .mini-tile:active {
      transform: none;
    }
  }

  @container drill (min-width: 900px) {
    .mini-tile {
      min-height: 78px;
      padding: 0.75rem 0.9rem;
    }
    .mini-title {
      font-size: 0.98rem;
    }
  }

  @container drill (min-width: 1600px) {
    .mini-tile {
      min-height: 92px;
      padding: 0.9rem 1.1rem;
      border-radius: 16px;
    }
    .mini-art {
      min-width: 52px;
      font-size: 1.2rem;
    }
    .mini-title {
      font-size: 1.05rem;
    }
    .mini-sub {
      font-size: 0.82rem;
    }
    .element-dot {
      width: 10px;
      height: 10px;
    }
  }

  /* Count dot: how many rules this category carries right now. The slot is
     always in the layout (visibility, not display), so a rule landing never
     resizes the tile or shifts its neighbours. */
  .rule-dot {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 999px;
    background: var(--theme-accent, #6366f1);
    color: var(--theme-text-on-accent, #fff);
    font-size: 0.68rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    visibility: hidden;
  }
  .rule-dot.on {
    visibility: visible;
  }
  /* Only the split-pane catalog shows the dot; every other composition keeps
     its historical box exactly as it was. */
  .mini-tile:not(.catalog) .rule-dot {
    display: none;
  }

  /* ── Composition: split-pane catalog ───────────────────────────── */
  /* Compact labeled rows, two per column-row, above the value editor.
     Sized in rem so the tier steps below move the whole tile together. The
     44px touch floor is a FLOOR, not the design height — a row pinned to it
     reads as a smushed strip (Austen, 2026-08-05). */
  /* No floor of its own: the CELL is the sizing authority (the tile is
     `height: 100%` of it below) and the grid row carries the floor via
     `--catalog-tile-min`. A min-height here is invisible to the height budget,
     which measures the grid's track minimum — the two drifted apart at the
     1680 seam and every tile overhung its row by 9.6px, hiding its own bottom
     edge behind the tile below it. */
  .mini-tile.catalog {
    min-height: 0;
    gap: 0.55rem;
    padding: 0.55rem 0.65rem;
    border-radius: 0.8rem;
  }
  .mini-tile.catalog:hover {
    transform: none;
  }
  /* Selection reads on the WHOLE tile — accent edge all the way around plus a
     tint. Never a left-edge bar (`.claude/rules/no-left-edge-accent-bar.md`). */
  .mini-tile.catalog.catalog-active {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 22%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #6366f1) 55%, transparent);
  }
  .mini-tile.catalog .mini-art {
    width: 2.1rem;
    min-width: 2.1rem;
    height: 2.1rem;
    border-radius: 0.55rem;
    /* Tracks the slot instead of sitting at a constant inside it — the row
       composition had no rule at all, so a 16px glyph floated in a 48px box. */
    font-size: clamp(0.95rem, 62cqw, 1.6rem);
  }
  /* `stretch`, not `flex-start`: a flex-start column sizes the title to its own
     text, so it overflows the shrunken column instead of ellipsing (the two
     longest labels spilled past the tile border at 4K). The title is already
     text-align: left, so stretching changes nothing visually. */
  .mini-tile.catalog .mini-main {
    min-width: 0;
    flex: 1 1 auto;
    align-items: stretch;
  }
  /* Wraps, never ellipses. The label IS the decision — "Timing & Directi…" and
     "Max turn intens…" are not choices anyone can make (Austen, 2026-08-05:
     make sure things are readable). At 2 columns the title box is ~100px and
     the three longest labels measured 110–137px, so a single line cannot hold
     them at any tier without shrinking the type, which is the one fix that is
     off the table. Two lines fit inside the existing 3.4rem min-height, so
     nothing below the catalog moves. */
  .mini-tile.catalog .mini-title {
    font-size: 0.88rem;
    line-height: 1.15;
    text-align: left;
    white-space: normal;
    /* break-word, not anywhere: mid-word breaks are a last resort, and the
       tiers below are sized so the longest single word ("Collections") always
       fits one line. */
    overflow-wrap: break-word;
    text-overflow: clip;
  }
  /* The label is the decision; the sub-line is landing editorial. */
  .mini-tile.catalog .mini-sub {
    display: none;
  }

  /* Catalog tier steps. The catalog's container is the ~440px left COLUMN, so
     `@container drill` queries here resolve against the column and never fire —
     the tiles have to step off the viewport instead. 1680 is the site-wide
     big-screen seam (`.claude/rules/4k-native-layout.md`); 2600 is where the
     column itself widens and the tile can carry real weight. */
  @media (min-width: 1680px) {
    .mini-tile.catalog {
      gap: 0.65rem;
      padding: 0.7rem 0.8rem;
      border-radius: 0.9rem;
    }
    .mini-tile.catalog .mini-art {
      width: 2.4rem;
      min-width: 2.4rem;
      height: 2.4rem;
      /* Proportional, because a later rule grows this box to a share of the
         cell: a constant here left a 17px glyph in a 48px slot. */
      font-size: clamp(1.05rem, 34cqh, 2.2rem);
    }
    .mini-tile.catalog .mini-title {
      font-size: 0.95rem;
    }
  }
  @media (min-width: 2600px) {
    .mini-tile.catalog {
      gap: 0.65rem;
      padding: 0.9rem 0.8rem;
      border-radius: 1.1rem;
    }
    /* Art and gaps stay under the label's needs at this tier, not over them.
       The 3-column catalog gives each tile ~230px; at 3.1rem of art plus 1.05rem
       of side padding the title box fell to 95px — NARROWER than at 1920 — and
       "Collections" broke mid-word. The label is the decision; the glyph is
       decoration, so the glyph yields. */
    .mini-tile.catalog .mini-art {
      width: 2.6rem;
      min-width: 2.6rem;
      height: 2.6rem;
      font-size: clamp(1.2rem, 34cqh, 2.6rem);
    }
    /* 1.2rem "Performances" needs about 140px; a two-column tile at the
       default 440px pane leaves the label 126px, and it broke as
       "Performa / nces" at 3840×2160. The larger label waits for the
       three-column catalog (CategoryRail steps at 620px of column). */
    @container drill (min-width: 620px) {
      .mini-tile.catalog .mini-title {
        font-size: 1.2rem;
      }
    }
    .mini-tile.catalog .rule-dot {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.85rem;
    }
  }

  /* ── Compact-art box constraint (catalog + rail) ────────────────
     Both compositions pin the art slot to a fixed square, but the dot rows and
     the avatar cluster size to their CONTENT: six T&D dots ran 56px wide inside
     a 28px slot and spilled past the tile's own left border. The clip is the
     guarantee; the sizing below means nothing actually reaches it. */
  .mini-tile.catalog .mini-art,
  .mini-tile.rail .mini-art {
    overflow: hidden;
  }
  /* Dots wrap into a 2-wide cluster instead of one ever-widening row: four LOOP
     colors square up 2×2, the six T&D families stack 2×3. */
  .mini-tile.catalog .element-dots,
  .mini-tile.rail .element-dots {
    display: grid;
    max-width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    place-content: center;
    place-items: center;
  }
  /* Dots fill their own grid cells, so the cluster tracks the art box whatever
     the count is: four LOOP colors square up 2×2, six T&D families stack 2×3,
     and neither needs a per-count size. A fixed dot could only ever be right
     for one of them. */
  .mini-tile.catalog .element-dots,
  .mini-tile.rail .element-dots {
    height: 100%;
    grid-auto-rows: 1fr;
  }
  .mini-tile.catalog .element-dot,
  .mini-tile.rail .element-dot {
    width: 100%;
    height: 100%;
    max-width: 1.5rem;
    max-height: 1.5rem;
    aspect-ratio: 1;
    place-self: center;
  }
  .mini-tile.catalog .avatar-cluster,
  .mini-tile.rail .avatar-cluster {
    max-width: 100%;
  }
  .mini-tile.catalog .avatar-cluster > :global(.robust-avatar + .robust-avatar) {
    margin-left: -0.72rem;
  }
  .mini-tile.catalog :global(.cluster-avatar.robust-avatar) {
    --avatar-size: 1.15rem !important;
  }
  @media (min-width: 1680px) {
    .mini-tile.catalog .element-dot {
      width: 0.45rem;
      height: 0.45rem;
    }
    .mini-tile.catalog
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -0.8rem;
    }
    .mini-tile.catalog :global(.cluster-avatar.robust-avatar) {
      --avatar-size: clamp(1.3rem, 26cqh, 2.6rem) !important;
    }
  }
  @media (min-width: 2600px) {
    .mini-tile.catalog .element-dot {
      width: 0.6rem;
      height: 0.6rem;
    }
    .mini-tile.catalog
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -1rem;
    }
    .mini-tile.catalog :global(.cluster-avatar.robust-avatar) {
      --avatar-size: clamp(1.7rem, 26cqh, 3rem) !important;
    }
  }

  /* ── Composition: unified decision canvas ──────────────────────── */
  /* A Smart Collection refinement shows every category together, so the tile
     becomes a centered poster instead of a horizontal row. */
  .mini-tile.unified {
    min-height: 5.5rem;
    flex-direction: column;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.7rem 0.5rem;
    text-align: center;
  }
  .mini-tile.unified .mini-main {
    flex: 0 1 auto;
    align-items: center;
  }
  .mini-tile.unified .mini-art {
    width: 2.75rem;
    min-width: 2.75rem;
    height: 2.75rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #6366f1) 38%, transparent);
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 12%, transparent);
    color: var(--theme-accent, #6366f1);
  }
  .mini-tile.unified .mini-art.plate {
    background: #fff;
  }
  .mini-tile.unified .mini-art.plate.position-preview img {
    width: calc(100% - 0.35rem);
    height: calc(100% - 0.35rem);
    object-fit: contain;
  }
  .mini-tile.unified .mini-art.grid-composite-preview {
    overflow: hidden;
    padding: 0.2rem;
  }
  .mini-tile.unified
    .mini-art.grid-composite-preview
    :global(.lesson-grid-display),
  .mini-tile.unified .mini-art.grid-composite-preview :global(.grid-svg) {
    width: 100%;
    max-width: none;
    height: 100%;
  }

  @container drill (max-width: 639.98px) {
    .mini-tile.unified {
      min-height: 4.25rem;
      overflow: hidden;
      flex-direction: column;
      justify-content: center;
      gap: 0.15rem;
      padding: 0.25rem 0.35rem;
      border-radius: 0.75rem;
      text-align: center;
    }
    .mini-tile.unified .mini-art {
      width: auto;
      min-width: 0;
      max-width: 100%;
      height: 1.75rem;
      overflow: hidden;
      border-radius: 0.6rem;
    }
    .mini-tile.unified .mini-art.plate {
      height: 2rem;
    }
    .mini-tile.unified .mini-art.plate img {
      width: 1.25rem;
      height: 1.25rem;
      flex: 0 0 1.25rem;
      object-fit: contain;
    }
    .mini-tile.unified .mini-art.plate img:only-child {
      width: 1.5rem;
      height: 1.5rem;
      flex-basis: 1.5rem;
    }
    .mini-tile.unified .mini-main {
      flex: 0 1 auto;
      min-width: 0;
      width: 100%;
      align-items: center;
      justify-content: center;
    }
    .mini-tile.unified .mini-title {
      width: 100%;
      overflow: visible;
      font-size: var(--font-size-sm, 14px);
      line-height: 1.15;
      text-align: center;
      text-overflow: clip;
      text-wrap: balance;
      white-space: normal;
    }
    .mini-tile.unified .mini-sub {
      display: none;
    }
  }

  @container drill (min-width: 640px) {
    .mini-tile.unified .element-dots {
      width: calc(100% - 0.25rem);
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 1px;
    }
    .mini-tile.unified .element-dot {
      width: min(100%, 0.5rem);
      height: auto;
      aspect-ratio: 1;
      justify-self: center;
    }
  }

  @container drill (min-width: 640px) and (max-width: 899.98px) {
    .mini-tile.unified {
      min-height: 5.5rem;
      flex-direction: row;
      justify-content: flex-start;
      gap: 0.75rem;
      padding: 0.7rem 0.85rem;
      text-align: left;
    }
    .mini-tile.unified .mini-art {
      width: 2.75rem;
      min-width: 2.75rem;
      height: 2.75rem;
    }
    .mini-tile.unified .mini-main {
      flex: 1 1 auto;
      align-items: flex-start;
    }
    .mini-tile.unified
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -18px;
    }
    .mini-tile.unified .mini-title,
    .mini-tile.unified .mini-sub {
      text-align: left;
    }
  }

  @container drill (min-width: 900px) {
    .mini-tile.unified
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -12px;
    }
    .mini-tile.unified {
      gap: 0.8rem;
      padding: 1.1rem;
      border-radius: 1.25rem;
    }
    .mini-tile.unified .mini-art {
      width: 3.5rem;
      min-width: 3.5rem;
      height: 3.5rem;
      font-size: 1.2rem;
    }
    .mini-tile.unified .mini-title {
      font-size: 1.05rem;
    }
    .mini-tile.unified .mini-sub {
      font-size: 0.8rem;
      text-align: center;
    }
  }

  @container drill (min-width: 1600px) {
    .mini-tile.unified {
      min-height: clamp(10rem, 7cqw, 13rem);
    }
  }

  @container drill (min-width: 2600px) {
    .mini-tile.unified .mini-art {
      width: 5rem;
      min-width: 5rem;
      height: 5rem;
      font-size: 1.75rem;
    }
    .mini-tile.unified
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -6px;
    }
    .mini-tile.unified .mini-title {
      font-size: 1.55rem;
    }
    .mini-tile.unified .mini-sub {
      font-size: 1.05rem;
    }
  }

  /* Fold landscape: the art carries the identity when height is scarce. */
  @media (min-width: 700px) and (max-height: 520px) {
    .mini-tile.unified .mini-art.position-preview,
    .mini-tile.unified .mini-art.grid-composite-preview {
      width: 3.75rem;
      min-width: 3.75rem;
      height: 3.75rem;
    }
    .mini-tile.unified
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -12px;
    }
  }

  /* Tall cover screens: use the vertical axis for bigger targets. */
  @media (max-width: 480px) and (min-height: 820px) {
    .mini-tile.unified {
      min-height: 7rem;
      gap: 0.35rem;
      padding: 0.55rem 0.45rem;
    }
    .mini-tile.unified .mini-art {
      height: 2.35rem;
      font-size: 1.05rem;
    }
    .mini-tile.unified .mini-art.plate {
      height: 2.5rem;
    }
    .mini-tile.unified .mini-art.plate img {
      width: 1.55rem;
      height: 1.55rem;
      flex-basis: 1.55rem;
    }
    .mini-tile.unified .mini-art.plate img:only-child {
      width: 1.85rem;
      height: 1.85rem;
      flex-basis: 1.85rem;
    }
    .mini-tile.unified .mini-title {
      font-size: 0.9rem;
    }
    .mini-tile.unified .mini-sub {
      display: -webkit-box;
      width: 100%;
      overflow: hidden;
      color: var(--theme-text-muted, #9aa6b8);
      font-size: 0.7rem;
      line-height: 1.15;
      text-align: center;
      text-overflow: ellipsis;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
  }

  /* Portrait tablet. */
  @media (min-width: 700px) and (max-width: 900px) and (min-height: 1000px) {
    .mini-tile.unified {
      height: 100%;
      min-height: 9rem;
      gap: 1rem;
      padding: 1rem 1.1rem;
    }
    .mini-tile.unified .mini-art {
      width: 4.25rem;
      min-width: 4.25rem;
      height: 4.25rem;
      font-size: 1.5rem;
    }
    .mini-tile.unified
      .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: -16px;
    }
    .mini-tile.unified :global(.cluster-avatar.robust-avatar) {
      --avatar-size: 2.25rem !important;
    }
    .mini-tile.unified .mini-title {
      font-size: 1.08rem;
    }
    .mini-tile.unified .mini-sub {
      font-size: 0.86rem;
      line-height: 1.25;
    }
    .mini-tile.unified .element-dot {
      width: 0.7rem;
      height: 0.7rem;
    }
  }

  /* ── Composition: persistent desktop rail ──────────────────────── */
  @media (min-height: 650px) {
    @container drill (min-width: 900px) {
      .mini-tile.rail {
        width: 100%;
        height: 100%;
        min-height: 44px;
        flex-direction: row;
        justify-content: flex-start;
        gap: 0.6rem;
        padding: 0.35rem 0.55rem;
        border-radius: 0.8rem;
        text-align: left;
        transform: none;
      }
      .mini-tile.rail:hover {
        transform: none;
      }
      .mini-tile.rail.catalog-active {
        border-color: var(--theme-accent, #6366f1);
        background: color-mix(
          in srgb,
          var(--theme-accent, #6366f1) 22%,
          var(--theme-card-bg, rgba(255, 255, 255, 0.04))
        );
        box-shadow: 0 0 0 1px
          color-mix(in srgb, var(--theme-accent, #6366f1) 55%, transparent);
      }
      .mini-tile.rail .mini-art {
        width: 2.25rem;
        min-width: 2.25rem;
        height: 2.25rem;
        border-radius: 0.65rem;
        font-size: 0.95rem;
      }
      .mini-tile.rail .mini-main {
        min-width: 0;
        flex: 1 1 auto;
        align-items: stretch;
      }
      .mini-tile.rail .mini-title {
        overflow: hidden;
        font-size: 0.86rem;
        line-height: 1.15;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mini-tile.rail .mini-sub {
        display: none;
      }
      /* Three 26px faces at -12px ran 54px wide inside the rail's 36px art
         slot. Shrink the faces and deepen the overlap so the stack fits its
         box (the box also clips, above). */
      .mini-tile.rail :global(.cluster-avatar.robust-avatar) {
        --avatar-size: 1.35rem !important;
      }
      .mini-tile.rail
        .avatar-cluster
        > :global(.robust-avatar + .robust-avatar) {
        margin-left: -0.95rem;
      }
    }
  }

  /* Rail steps with the pane on tall displays (audit D-10). */
  @media (min-height: 1150px) {
    @container drill (min-width: 1200px) {
      .mini-tile.rail {
        border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
        padding: 0.5rem 0.7rem;
      }
      .mini-tile.rail .mini-title {
        font-size: 1rem;
      }
      .mini-tile.rail .mini-art {
        width: 2.75rem;
        min-width: 2.75rem;
        height: 2.75rem;
      }
    }
  }

  @media (min-height: 1900px) {
    @container drill (min-width: 1200px) {
      .mini-tile.rail .mini-title {
        font-size: 1.2rem;
      }
      .mini-tile.rail .mini-art {
        width: 3.25rem;
        min-width: 3.25rem;
        height: 3.25rem;
      }
    }
  }
  /* ── Composition: catalog, tall ──────────────────────────────────
     A wide-and-short row is the worst shape for a tile whose job is to show a
     pictograph (Austen, 2026-08-05: the art and the label "are forced to be
     very small, because their container is not very tall"). The catalog's
     height is now a share of a budget it does not control, so the tile cannot
     know from the tier whether it is a row or a poster — the CELL knows, and
     it is a size container (`CategoryRail .cat-cell`). Past 7.5rem the tile
     turns portrait: art on top at a share of its OWN height, label centred
     under it. Below that the art still grows with the row instead of sitting
     at a constant beside it. */
  .mini-tile.catalog {
    width: 100%;
    height: 100%;
  }
  .mini-tile.catalog .mini-art {
    height: min(70%, 3.25rem);
    aspect-ratio: 1;
    width: auto;
    min-width: 0;
    /* The label is the decision (`.mini-title` above): in a two-column row
       the art grows with the cell, and at 94px rows it left "Performances"
       116px, which is one letter short — it broke as "Performanc / es" at
       2560×1440. The art yields its square before the longest word yields
       a letter. */
    max-width: calc(100% - 8.5rem);
  }
  @container cat-cell (min-height: 6.25rem) {
    .mini-tile.catalog {
      position: relative;
      flex-direction: column;
      justify-content: center;
      gap: 0.35rem;
      padding: 0.5rem;
      text-align: center;
    }
    /* The art BOX is a share of the tile, so its CONTENTS have to be too. Left
       as viewport-keyed constants they stayed the 1080p size while the box grew
       with the height budget — a 24px glyph adrift in an 84px slot, which is
       what "the icons are really small" was. ~62% of the box reads as filled
       without touching the edges. */
    .mini-tile.catalog .mini-art {
      height: min(42%, 6rem);
      min-height: 2.1rem;
      max-width: 100%;
      font-size: clamp(1.15rem, 26cqh, 4rem);
    }
    .mini-tile.catalog .element-dot {
      width: clamp(0.4rem, 7cqh, 1.05rem);
      height: clamp(0.4rem, 7cqh, 1.05rem);
    }
    .mini-tile.catalog .avatar-cluster
      > :global(.robust-avatar + .robust-avatar) {
      margin-left: clamp(-1.4rem, -11cqh, -0.72rem);
    }
    .mini-tile.catalog :global(.cluster-avatar.robust-avatar) {
      --avatar-size: clamp(1.15rem, 28cqh, 3.6rem) !important;
    }
    .mini-tile.catalog .mini-main {
      flex: 0 1 auto;
      align-items: center;
    }
    .mini-tile.catalog .mini-title {
      text-align: center;
      text-wrap: balance;
    }
    /* The dot leaves the row and takes the corner — otherwise it claims a slot
       of its own under the label and pulls the title off centre. */
    .mini-tile.catalog .rule-dot {
      position: absolute;
      top: 0.45rem;
      right: 0.5rem;
    }
    .mini-tile.catalog .element-dot {
      width: 0.55rem;
      height: 0.55rem;
    }
  }
  /* The art is the tile at these sizes — a 6rem glyph in a 20rem box is the
     same defect as the row it replaced, wearing the opposite sign. */
  @container cat-cell (min-height: 12rem) {
    .mini-tile.catalog .mini-art {
      height: min(50%, 8rem);
      font-size: clamp(1.6rem, 30cqh, 5rem);
    }
    .mini-tile.catalog .element-dot {
      width: clamp(0.5rem, 8cqh, 1.3rem);
      height: clamp(0.5rem, 8cqh, 1.3rem);
    }
    .mini-tile.catalog :global(.cluster-avatar.robust-avatar) {
      --avatar-size: clamp(1.6rem, 30cqh, 4.4rem) !important;
    }
  }
  @container cat-cell (min-height: 16rem) {
    .mini-tile.catalog {
      gap: 0.9rem;
      padding: 1rem;
    }
    .mini-tile.catalog .mini-art {
      height: min(56%, 12rem);
      font-size: clamp(2.2rem, 34cqh, 6.5rem);
    }
    .mini-tile.catalog .mini-title {
      font-size: 1.2rem;
    }
  }
  /* The plate images carry 32px width/height attributes, so a bigger plate used
     to mean a bigger white square around the same tiny glyph. */
  .mini-tile.catalog .mini-art.plate img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  /* Last in the cascade on purpose: the row composition above reserves
     8.5rem for the label, which holds "Performances" at 2560×1440 (139px box)
     but not at the 2600 tier, where the same tile leaves the label 131px and
     the word breaks by one letter. The art gives up the difference here. */
  @media (min-width: 2600px) {
    .mini-tile.catalog .mini-art {
      max-width: calc(100% - 9.25rem);
    }
  }

</style>

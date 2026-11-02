<!--
  A page's screens as a list in its text column (2026-11-01, Austen's review
  of the hand combinations' run: a second pill row under the title read as
  "a text sandwich with chips as the bun"). On a wide window the screens are
  tiles in two columns (Austen, 2026-11-02: two columns of three instead of
  one column of six), each with its icon where it has one, its name, and
  under it a quiet tail where it has one (a Dual-Shift mode's start and end
  positions in the glyph font), centred in the tile. No sentences: a
  screen's words belong to its card (Austen, 2026-11-01). The tiles fill
  the column down to the card's foot, equal in height, their icon, name and
  tail growing with them; the gaps grow from 8 px to 24 px.

  Every screen wears its own colour (2026-11-02, Austen: style all six, not
  only the current one): a faint wash and a tinted border. The current one
  is tinted more strongly, never filled solid behind its name: a stronger
  wash, a full-colour border and a bar on its left edge, the name in the
  body's ink. The tail's arrow is drawn, centred between its two positions
  (the text arrow sat low and small beside the glyphs). A row
  switches the screen as the pills did. On a narrow window the list folds
  back into one row of pills, names only, standing right above the card it
  switches, panning inside itself and never starting on half a name.
-->
<script lang="ts" module>
  export type ScreenListItem = {
    label: string;
    /** An image before the name (a Dual-Shift mode's element). */
    icon?: string;
    /** A quiet note at the row's right edge on a wide window: positions in
     *  the glyph font with the arrow between them ("α→α", "α↔β"). */
    tail?: string;
    /** The screen's colour: its wash and border, and the current one's edge
     *  bar. */
    color: string;
  };
</script>

<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { revealInRow } from "../../_components/fit/reveal-in-row";

  let {
    items,
    current,
    go,
    name,
  }: {
    items: ScreenListItem[];
    current: number;
    go: (index: number) => void;
    /** Draws a row's name (index, whether it is the current row); the
        label as text when absent. */
    name?: Snippet<[number, boolean]>;
  } = $props();

  /** "α→α" as its two positions and the arrow between them. */
  const tailParts = (tail: string) => {
    const [from = "", arrow = "", to = ""] = tail.split(/([→↔])/);
    return { from, arrow, to };
  };

  let row = $state<HTMLElement>();
  let moreLeft = $state(false);
  let moreRight = $state(false);

  function edges(): void {
    if (!row) return;
    const { scrollLeft, clientWidth, scrollWidth } = row;
    moreLeft = scrollLeft > 2;
    moreRight = scrollLeft + clientWidth < scrollWidth - 2;
  }

  // As a row of pills, pan only as far as brings the current one into view.
  function showCurrent(): void {
    const item = row?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!row || !item) return;
    if (row.scrollWidth > row.clientWidth + 1) revealInRow(row, item);
    edges();
  }

  onMount(() => {
    showCurrent();
    const observer = new ResizeObserver(showCurrent);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  });

  // The list stays mounted across screens now: follow the current row.
  $effect(() => {
    void current;
    queueMicrotask(showCurrent);
  });
</script>

<nav
  class="screen-list"
  class:more-left={moreLeft}
  class:more-right={moreRight}
  aria-label="Parts of this page"
  style:--grid-rows={Math.ceil(items.length / 2)}
  bind:this={row}
  onscroll={edges}
>
  {#each items as item, n (n)}
    {@const on = n === current}
    <button
      type="button"
      class="item"
      class:on
      aria-current={on ? "step" : undefined}
      style:--row={item.color}
      onclick={() => go(n)}
    >
      <span class="name"
        >{#if item.icon}<img
            class="icon"
            src={item.icon}
            alt=""
          />{/if}{#if name}{@render name(n, on)}{:else}{item.label}{/if}</span
      >
      {#if item.tail}
        {@const tail = tailParts(item.tail)}
        <span class="tail" aria-label={item.tail}
          ><span class="glyph" aria-hidden="true">{tail.from}</span><svg
            class="arrow"
            viewBox="0 0 24 12"
            aria-hidden="true"
            ><path d="M3 6h18" /><path d="M16 1.5 21 6l-5 4.5" />{#if tail.arrow === "↔"}<path
                d="M8 1.5 3 6l5 4.5"
              />{/if}</svg
          ><span class="glyph" aria-hidden="true">{tail.to}</span></span
        >
      {/if}
    </button>
  {/each}
</nav>

<style>
  /* Narrow: one row of pills, names only, panning inside itself. */
  .screen-list {
    display: flex;
    gap: 0.5rem;
    justify-content: safe center;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.2rem 0.25rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
  }
  .screen-list::-webkit-scrollbar {
    display: none;
  }
  .more-right {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  .more-left {
    mask-image: linear-gradient(to left, #000 calc(100% - 2.5rem), transparent);
  }
  .more-left.more-right {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 2.5rem,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  .item {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0.35em 1em;
    border: 1px solid color-mix(in srgb, var(--row) 35%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--row) 6%, transparent);
    color: var(--ink, #1a1a1a);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 400;
    text-align: left;
    cursor: pointer;
    scroll-snap-align: start;
    transition:
      background var(--duration-fast) var(--ease-standard, ease),
      border-color var(--duration-fast) var(--ease-standard, ease),
      box-shadow var(--duration-fast) var(--ease-standard, ease);
  }
  .item:hover {
    border-color: color-mix(in srgb, var(--row) 55%, transparent);
    background: color-mix(in srgb, var(--row) 11%, transparent);
  }
  .item:focus-visible {
    outline: 2px solid var(--ink, #1a1a1a);
    outline-offset: 2px;
  }
  /* The current row: the colour as a wash and a border, the name in the
     body's ink (Austen: never white on yellow, never the colour on its own
     fill). */
  .item.on,
  .item.on:hover {
    border-color: var(--row);
    background: color-mix(in srgb, var(--row) 18%, transparent);
  }
  .item .name {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
    min-width: 0;
    color: var(--ink, #1a1a1a);
    font-weight: 650;
    white-space: nowrap;
  }
  /* A drawn name's parts (CombinationName) keep the row's weight and ink
     over the page's plain-text rules. */
  .item .name :global(span) {
    font-weight: inherit;
  }
  .icon {
    width: 1.5em;
    height: 1.5em;
    flex: none;
    object-fit: contain;
  }
  /* Positions and arrow, quiet, under the name; wide tiles only. */
  .item .tail {
    display: none;
    flex: none;
    color: var(--ink, #1a1a1a);
    opacity: 0.55;
    font-size: 1.05rem;
    white-space: nowrap;
  }
  .item .tail .arrow {
    width: 1.15em;
    height: 0.6em;
    margin-inline: 0.3em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .item .tail .glyph {
    color: inherit;
    font-family:
      "TKA Letters", var(--guide-display, "Cormorant Garamond"), serif;
    font-size: 1.15em;
  }

  /* Wide: tiles in two columns down the text column from under the words
     to the card's foot. The list takes the height the words leave (never
     less than its rows at 44 px, 8 px apart) and measures it (a size
     container): the rows share it equally, and the gaps run from 8 px with
     the window's height to 24 px. Each tile measures itself too, so its icon,
     name and tail grow with it, the name held to the tile's width. */
  @container (min-width: 56rem) {
    .screen-list {
      flex: 1 1 auto;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: minmax(44px, 1fr);
      gap: clamp(0.5rem, 1.4vh, 1.5rem);
      min-height: calc(
        var(--grid-rows, 3) * 44px + (var(--grid-rows, 3) - 1) * 0.5rem
      );
      padding: 0;
      overflow: visible;
      mask-image: none;
      container: screen-list / size;
    }
  }
  /* The tiles' rules ask the list itself, which is a container only when
     wide (an unnamed query from a tile would find the list, not the page). */
  @container screen-list (min-width: 0px) {
    .item {
      flex-direction: column;
      justify-content: center;
      gap: clamp(0.25rem, 4cqh, 0.9rem);
      width: 100%;
      min-height: 0;
      padding: 0.5rem 0.75rem;
      border-radius: 0.75rem;
      text-align: center;
      container-type: size;
    }
    .item .name {
      flex-direction: column;
      gap: clamp(0.2rem, 4cqh, 0.75rem);
      font-size: clamp(0.9rem, min(13cqh, 10.5cqw), 1.6rem);
    }
    .icon {
      width: clamp(1.5rem, 28cqh, 4.5rem);
      height: clamp(1.5rem, 28cqh, 4.5rem);
    }
    .item.on {
      box-shadow: inset 3px 0 0 var(--row);
    }
    .item .tail {
      display: inline-flex;
      align-items: center;
      font-size: clamp(0.95rem, min(14cqh, 11cqw), 1.75rem);
    }
  }
</style>

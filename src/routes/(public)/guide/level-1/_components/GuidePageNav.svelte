<script lang="ts">
  import type { ReaderNavRow } from "../_data/guide-reader-nav";

  let {
    rows,
    activeIndex,
    onSelect,
    hrefFor,
  }: {
    /** Prebuilt nav rows (front jumps + grouped body pages) for the active level. */
    rows: ReaderNavRow[];
    activeIndex: number;
    onSelect: (index: number) => void;
    /** Real href for a row (right-click/middle-click); left-click scrolls in-pane. */
    hrefFor: (index: number) => string | null;
  } = $props();

  // Rows are REAL links (right-click → Copy Link Address, middle-click → new
  // tab); a plain left click is intercepted for the smooth in-pane scroll.
  function navClick(e: MouseEvent, index: number) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    onSelect(index);
  }
</script>

<nav class="reader-nav" aria-label="Guide pages">
  {#each rows as row}
    {#if row.kind === "group"}
      <div class="grp">{row.title}</div>
    {:else if row.kind === "front"}
      <a
        class="row front"
        class:active={activeIndex === row.index}
        href={hrefFor(row.index)}
        onclick={(e) => navClick(e, row.index)}
      >
        {row.title}
      </a>
    {:else}
      <a
        class="row page"
        class:sub={row.level === 1}
        class:active={activeIndex === row.index}
        class:soon={!row.built}
        href={hrefFor(row.index)}
        onclick={(e) => navClick(e, row.index)}
      >
        <span class="t">{row.title}</span>
        {#if !row.built}<span class="tag">soon</span>{/if}
      </a>
    {/if}
  {/each}
</nav>

<style>
  .reader-nav {
    display: flex;
    flex-direction: column;
    padding: 0.75rem 0.5rem;
    gap: 2px;
    overflow-y: auto;
    height: 100%;
    box-sizing: border-box;
  }
  .grp {
    font:
      700 0.72rem/1 system-ui,
      sans-serif;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    padding: 0.9rem 0.75rem 0.35rem;
  }
  .row {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.35rem 0.75rem;
    border-radius: 8px;
    cursor: pointer;
    color: var(--theme-text, #e8e6f0);
    font:
      500 0.9rem/1.2 system-ui,
      sans-serif;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    }
  }
  .row:focus-visible {
    outline: 2px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 70%, transparent);
    outline-offset: -2px;
  }
  .row.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 22%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #c4b5fd) 85%, white);
    font-weight: 700;
  }
  .row.front {
    font-style: italic;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }
  .row.sub {
    padding-left: 1.35rem;
    font-size: 0.85rem;
  }
  .row.soon {
    color: color-mix(in srgb, var(--theme-text-dim, #9a93ad) 65%, transparent);
  }
  .row .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tag {
    flex: 0 0 auto;
    font:
      700 0.6rem/1 system-ui,
      sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding: 2px 7px;
    border-radius: 999px;
  }
</style>

<script lang="ts">
  import type { SheetHeader } from "../../domain/types/choreo-sheet";
  import {
    formatSheetRunningTimestamp,
    formatSheetTitleBlock,
  } from "../../domain/sheet-title-block";

  let {
    header = { showTitleBlock: false },
    onchange,
    readonly = false,
    sheetName = "",
    pageIndex = 0,
    startTimestamp = "",
  }: {
    header?: SheetHeader;
    onchange?: (patch: Partial<SheetHeader>) => void;
    readonly?: boolean;
    sheetName?: string;
    pageIndex?: number;
    startTimestamp?: string;
  } = $props();
  const titleBlock = $derived(formatSheetTitleBlock(sheetName, header));
  const runningTimestamp = $derived(
    formatSheetRunningTimestamp(startTimestamp)
  );
</script>

{#if readonly}
  {#if pageIndex === 0}<div class="titleblock">
      <div class="act">{titleBlock.title}</div>
      <div class="by">{titleBlock.choreographyLine}</div>
      <div class="by">{titleBlock.songLine}</div>
      <div class="made">{titleBlock.createdLine}</div>
      <div class="tag">{titleBlock.tagline}</div>
    </div>{:else}<div class="runhead">
      <span>{titleBlock.runningTitle}</span><span>{runningTimestamp}</span><span
        >{pageIndex + 1}</span
      >
    </div>{/if}
{:else}
  <div class="header-fields" aria-label="Title block metadata">
    <label
      >Choreographer<input
        name="choreographer"
        value={header.choreographer ?? ""}
        oninput={(e) => onchange?.({ choreographer: e.currentTarget.value })}
      /></label
    >
    <label
      >Song<input
        name="song-name"
        value={header.songName ?? ""}
        oninput={(e) => onchange?.({ songName: e.currentTarget.value })}
      /></label
    >
    <label
      >Artist<input
        name="song-artist"
        value={header.songArtist ?? ""}
        oninput={(e) => onchange?.({ songArtist: e.currentTarget.value })}
      /></label
    >
    <label
      >Tagline<input
        name="tagline"
        value={header.tagline ?? ""}
        oninput={(e) => onchange?.({ tagline: e.currentTarget.value })}
      /></label
    >
  </div>
{/if}

<style>
  .header-fields {
    display: grid;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }
  label {
    display: grid;
    gap: 4px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }
  input {
    min-height: var(--min-touch-target, 44px);
    padding: 0 var(--spacing-sm);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-sm, 6px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
  }
  input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .titleblock {
    height: calc(170 * var(--pt));
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .act {
    font-size: calc(40 * var(--pt));
    font-weight: 800;
    line-height: 1.5;
  }
  .by {
    min-height: calc(22.5 * var(--pt));
    font-size: calc(15 * var(--pt));
    line-height: 1.5;
    color: var(--print-ink-soft);
  }
  .made {
    font-size: calc(11 * var(--pt));
    font-style: italic;
    line-height: 1.5;
    color: var(--print-ink-soft);
  }
  .tag {
    min-height: calc(19.5 * var(--pt));
    margin-top: calc(10 * var(--pt));
    font-size: calc(13 * var(--pt));
    font-weight: 700;
    line-height: 1.5;
  }
  .runhead {
    height: calc(28 * var(--pt));
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: start;
    border-bottom: calc(0.75 * var(--pt)) solid var(--print-border);
    color: var(--print-ink-soft);
    font-size: calc(11 * var(--pt));
    font-style: italic;
  }
  .runhead span:last-child {
    text-align: right;
  }
</style>

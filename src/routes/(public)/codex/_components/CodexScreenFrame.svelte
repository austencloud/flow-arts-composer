<!--
  One drill-down screen of the Codex: a header row (Back on the left, the
  title and a one-line subtitle in the middle, the screen's own pills on the
  right), one content area that takes the rest of the height, and the
  screen's primary controls along the bottom when it has any. The frame
  never scrolls; it hands its content area's size out so each screen fits
  its pictures to the real space.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  let {
    title,
    titleContent,
    subtitle,
    onBack,
    backLabel,
    actions,
    controls,
    children,
    contentWidth = $bindable(0),
    contentHeight = $bindable(0),
  }: {
    title: string;
    /** Drawn in place of the title text (the letter's glyph); the title
     *  still names the screen for assistive tech. */
    titleContent?: Snippet;
    subtitle?: string;
    onBack?: () => void;
    /** The parent screen's name, on the Back pill. */
    backLabel?: string;
    /** Header pills, right. */
    actions?: Snippet;
    /** The bottom row. */
    controls?: Snippet;
    children: Snippet;
    contentWidth?: number;
    contentHeight?: number;
  } = $props();
</script>

<section class="screen" aria-label={title}>
  <header class="head">
    <div class="back">
      {#if onBack}
        <FilterChipBase
          mode="action"
          size="md"
          label={backLabel ?? "Back"}
          ariaLabel={`Back to ${backLabel ?? "the previous screen"}`}
          icon="fas fa-chevron-left"
          onclick={onBack}
        />
      {/if}
    </div>
    <div class="title">
      <h1 class="title-text" class:visually-hidden={Boolean(titleContent)}>
        {title}
      </h1>
      {#if titleContent}
        <div class="title-art" aria-hidden="true">{@render titleContent()}</div>
      {/if}
      {#if subtitle}
        <p class="subtitle">{subtitle}</p>
      {/if}
    </div>
    <div class="actions">
      {#if actions}{@render actions()}{/if}
    </div>
  </header>

  <div class="content">
    <div
      class="fill"
      bind:clientWidth={contentWidth}
      bind:clientHeight={contentHeight}
    >
      {@render children()}
    </div>
  </div>

  {#if controls}
    <div class="controls">{@render controls()}</div>
  {/if}
</section>

<style>
  .screen {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--theme-text);
  }

  /* Back and the pills keep their own width; the title takes what is left
     between them, centred there, and cuts its line short rather than run
     under a pill. */
  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 12px;
  }

  .back {
    display: flex;
    justify-content: flex-start;
    min-width: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .title {
    display: grid;
    justify-items: center;
    min-width: 0;
    text-align: center;
  }

  .title-text {
    margin: 0;
    font-size: clamp(1.1rem, 2.6vh, 1.5rem);
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .title-art {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    --letter-glyph-h: 2rem;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    white-space: nowrap;
  }

  .subtitle {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content {
    position: relative;
    min-height: 0;
    min-width: 0;
    padding: 0 12px;
    overflow: hidden;
  }

  .fill {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px 12px;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>

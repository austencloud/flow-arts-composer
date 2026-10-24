<!--
  One line saying what the reader has done to the pictures (describeCodexEdits),
  with a Reset pill beside it. The row is reserved space: with nothing
  changed it keeps its 40px, so the tiles and cells under it never move when
  an edit arrives or clears.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    text,
    onReset,
  }: {
    text: string | null;
    onReset: () => void;
  } = $props();
</script>

<div class="edit-summary" data-codex-edit-summary={text ?? ""}>
  <Crossfade key={text} duration={DURATION.fast} fill>
    {#if text}
      <div class="line">
        <span class="text" role="status">{text}</span>
        <FilterChipBase
          mode="action"
          size="sm"
          label="Reset"
          icon="fas fa-rotate-left"
          onclick={onReset}
        />
      </div>
    {/if}
  </Crossfade>
</div>

<style>
  .edit-summary {
    position: relative;
    flex: none;
    height: 40px;
  }

  .line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    min-width: 0;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    padding: 4px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text);
    font-size: var(--font-size-sm, 0.875rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

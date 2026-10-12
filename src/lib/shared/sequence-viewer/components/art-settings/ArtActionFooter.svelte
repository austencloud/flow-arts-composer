<!--
  ArtActionFooter.svelte — the pinned footer both Art sidebars end with.

  Export only. Share used to lead here, and it was the second Share on screen:
  the header already carries one on every pane, and that is where it stays.
  Austen (2026-08-11): "Let's keep Share in one consistent place in the header
  always, we don't need it in two places." The header's Share knows which art
  view is up and hands the sheet that render, so nothing was lost by removing
  this one — only the duplicate.

  Shared because Mandala and Tunnel had already grown identical copies of the
  export button.
-->
<script lang="ts">
  interface Props {
    /** Renders the file and saves it. */
    onExport: () => void;
    /** "Export MP4" / "Export Video" — the two products name their file. */
    exportLabel: string;
    /** A render is already in flight; the action would queue behind it. */
    busy?: boolean;
  }

  let { onExport, exportLabel, busy = false }: Props = $props();
</script>

<div class="panel-footer">
  <button
    type="button"
    class="export-btn"
    onclick={onExport}
    disabled={busy}
    data-testid="art-export-button"
  >
    {#if busy}
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    {:else}
      <i class="fas fa-film" aria-hidden="true"></i>
    {/if}
    <span>{exportLabel}</span>
  </button>
</div>

<style>
  .panel-footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 16px;
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .export-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 12px 16px;
    border-radius: 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: filter var(--duration-normal) var(--ease-standard);
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    color: var(--theme-text, rgba(255, 255, 255, 0.92));
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    .export-btn:hover:not(:disabled) {
      background: var(--theme-surface-hover, rgba(255, 255, 255, 0.06));
    }
  }

  .export-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .export-btn {
      transition: none;
    }
  }
</style>

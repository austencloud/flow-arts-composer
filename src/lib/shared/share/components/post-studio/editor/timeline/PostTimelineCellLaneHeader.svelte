<script lang="ts">
  /**
   * The header cell for one cell lane: the cell's words behind a grid icon.
   * Pressing it selects the cell, the same as pressing its bar.
   */
  interface Props {
    label: string;
    heightPx: number;
    selected: boolean;
    onSelect: () => void;
  }

  let { label, heightPx, selected, onSelect }: Props = $props();
</script>

<div class="cell-lane-header" class:selected style="height: {heightPx}px">
  <button
    type="button"
    class="lane-name"
    aria-pressed={selected}
    aria-label="{label} cell"
    onclick={onSelect}
  >
    <i class="fa-solid fa-table-cells" aria-hidden="true"></i>
    <span class="lane-text">{label}</span>
  </button>
</div>

<style>
  .cell-lane-header {
    --lane-header-bg: color-mix(in srgb, var(--theme-bg, #101018) 70%, #000);
    display: flex;
    box-sizing: border-box;
    align-items: center;
    padding: 0 0.5rem 0 0.4375rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--lane-header-bg);
  }

  /* The selected cell's header takes the same tint as its span in the lane
     beside it, so the whole row reads as the cell in hand. */
  .cell-lane-header.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--lane-header-bg)
    );
  }

  .lane-name {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.35rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .cell-lane-header.selected .lane-name {
    color: var(--theme-text, #fff);
  }

  .lane-name i {
    flex-shrink: 0;
    width: 1rem;
    font-size: 0.75rem;
    text-align: center;
  }

  .cell-lane-header.selected .lane-name i {
    color: var(--theme-accent);
  }

  .lane-text {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (hover: hover) {
    .lane-name:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--theme-text);
    }
  }

  .lane-name:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  /* The narrow header keeps the icon, as track rows keep their toggles. */
  @container post-timeline-header (max-width: 7rem) {
    .lane-text {
      display: none;
    }
  }
</style>

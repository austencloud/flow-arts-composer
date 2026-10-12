<script lang="ts">
  /**
   * SequenceInfoBadge - Display loaded sequence name with clear button
   */

  interface Props {
    /** Sequence name to display */
    name: string;
    /** Callback to clear sequence */
    onClear: () => void;
  }

  let { name, onClear }: Props = $props();
</script>

<div class="sequence-badge">
  <span class="name">{name}</span>
  <button class="clear-btn" onclick={onClear} aria-label="Clear sequence">
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>
</div>

<style>
  .sequence-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    padding: 4px 4px 4px 12px;
  }

  .name {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    text-transform: capitalize;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clear-btn {
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
    flex-shrink: 0;
  }

  .clear-btn:hover {
    background: var(--semantic-error, var(--semantic-error));
    color: white;
  }
</style>

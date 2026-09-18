<script lang="ts">
  interface Props {
    onClose: () => void;
    onDisable?: () => void;
    titleId?: string;
  }

  const props: Props = $props();
</script>

<div class="overlay-header">
  <h3 class="overlay-title" id={props.titleId}>Select LOOP Type</h3>
  <div class="header-actions">
    {#if props.onDisable}
      <button
        class="disable-button"
        onclick={props.onDisable}
        aria-label="Turn off LOOP"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
        <span>Off</span>
      </button>
    {/if}
    <button
      class="close-button"
      onclick={props.onClose}
      aria-label="Close LOOP selection"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
</div>

<style>
  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .disable-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    padding: 8px 12px;
    height: var(--min-touch-target);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    font-family: inherit;
    transition: all var(--duration-normal) ease;
  }

  .disable-button:hover {
    background: rgba(255, 100, 100, 0.15);
    border-color: rgba(255, 100, 100, 0.3);
    color: var(--theme-text, white);
  }

  .disable-button svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .overlay-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: 0.3px;
  }

  .close-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    color: var(--theme-text, white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .close-button svg {
    width: 20px;
    height: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button,
    .disable-button {
      transition: none;
    }
  }
</style>

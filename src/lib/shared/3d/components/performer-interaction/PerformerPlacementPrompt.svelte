<script lang="ts">
  interface Props {
    oncancel: () => void;
  }

  let { oncancel }: Props = $props();
</script>

<div class="placement-prompt" role="status">
  <span>Tap the floor to move</span>
  <button
    type="button"
    onclick={oncancel}
    onpointerdown={(event) => event.stopPropagation()}
    onpointerup={(event) => event.stopPropagation()}>Cancel</button
  >
</div>

<style>
  .placement-prompt {
    position: absolute;
    z-index: 5;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100% - 24px);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.65rem;
    padding: 0.4rem 0.5rem 0.4rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.82));
    color: var(--theme-text, #fff);
    font-size: max(14px, var(--font-size-min, 0.875rem));
    white-space: nowrap;
    pointer-events: auto;
  }
  button {
    min-width: 48px;
    min-height: 48px;
    border: 1px solid var(--theme-accent, #8b5cf6);
    border-radius: 0.4rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--theme-accent-text, #a78bfa);
    outline-offset: 2px;
  }
</style>

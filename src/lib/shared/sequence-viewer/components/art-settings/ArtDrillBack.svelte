<!--
  The way back out of a drilled-in Art section: the tuner under Formation and,
  in the phone dock, the Colors and Performers screens. One button so every
  Art drill returns the same way.
-->
<script lang="ts">
  let { label, onBack }: { label: string; onBack: () => void } = $props();
</script>

<button class="back-btn" type="button" onclick={onBack}>
  <i class="fas fa-chevron-left" aria-hidden="true"></i>
  {label}
</button>

<style>
  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 8px;
    background: none;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }
  .back-btn:hover {
    color: var(--theme-text, #fff);
  }
  .back-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
    border-radius: 6px;
  }
</style>

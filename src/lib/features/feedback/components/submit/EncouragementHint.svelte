<script lang="ts">
  const { message, isInputMode = false } = $props<{
    message: string;
    isInputMode?: boolean;
  }>();
</script>

{#if message}
  <div class="encouragement-hint" class:collapsed={isInputMode}>
    <i class="fas fa-robot" aria-hidden="true"></i>
    <span>{message}</span>
  </div>
{/if}

<style>
  .encouragement-hint {
    display: flex;
    align-items: flex-start;
    gap: clamp(8px, 2cqi, 12px);
    padding: clamp(10px, 2.5cqi, 14px) clamp(12px, 3cqi, 16px);
    max-height: 100px;
    opacity: 1;
    overflow: hidden;
    transition:
      max-height var(--duration-fast) var(--ease-standard-out),
      opacity var(--duration-fast) var(--ease-standard-out),
      margin var(--duration-fast) var(--ease-standard-out),
      padding var(--duration-fast) var(--ease-standard-out);
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--active-type-color, var(--theme-accent, var(--semantic-info))) 8%,
          rgba(255, 255, 255, 0.03)
        )
        0%,
      color-mix(
          in srgb,
          var(--active-type-color, var(--theme-accent, var(--semantic-info))) 4%,
          rgba(255, 255, 255, 0.01)
        )
        100%
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--active-type-color, var(--theme-accent, var(--semantic-info))) 15%,
        rgba(255, 255, 255, 0.06)
      );
    border-radius: clamp(8px, 1.8cqi, 10px);
    margin-top: clamp(4px, 1cqi, 8px);
  }

  .encouragement-hint i {
    flex-shrink: 0;
    font-size: clamp(0.8rem, 2cqi, 0.9rem);
    color: color-mix(
      in srgb,
      var(--active-type-color, var(--theme-accent, var(--semantic-info))) 70%,
      var(--theme-text-dim)
    );
    margin-top: 2px;
  }

  .encouragement-hint span {
    font-size: clamp(0.75rem, 2cqi, 0.8125rem);
    font-style: italic;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
    line-height: 1.5;
  }

  .encouragement-hint.collapsed {
    max-height: 0;
    opacity: 0;
    margin: 0;
    padding: 0;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .encouragement-hint {
      transition: none;
    }
  }
</style>

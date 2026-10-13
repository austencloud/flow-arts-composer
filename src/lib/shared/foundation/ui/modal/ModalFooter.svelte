<!--
  ModalFooter.svelte - Reusable modal footer component

  Features:
  - Flexible button alignment
  - Border separator from content
  - Consistent padding
  - Entrance animation via data-animate
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  type FooterAlign = "start" | "center" | "end" | "between" | "stretch";

  interface Props {
    children: Snippet;
    align?: FooterAlign;
    noBorder?: boolean;
  }

  let { children, align = "center", noBorder = false }: Props = $props();
</script>

<footer
  class="modal-footer"
  class:no-border={noBorder}
  data-align={align}
  data-animate="6"
>
  {@render children()}
</footer>

<style>
  .modal-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .modal-footer.no-border {
    border-top: none;
  }

  /* Alignment variants */
  .modal-footer[data-align="start"] {
    justify-content: flex-start;
  }

  .modal-footer[data-align="center"] {
    justify-content: center;
  }

  .modal-footer[data-align="end"] {
    justify-content: flex-end;
  }

  .modal-footer[data-align="between"] {
    justify-content: space-between;
  }

  .modal-footer[data-align="stretch"] {
    flex-direction: column;
  }

  .modal-footer[data-align="stretch"] > :global(*) {
    width: 100%;
  }

  /* Common button styles for children */
  .modal-footer :global(button) {
    min-height: 44px;
    padding: 10px 24px;
    border-radius: 10px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      transform var(--duration-instant) var(--ease-standard);
  }

  .modal-footer :global(button:active) {
    transform: scale(0.97);
  }

  /* Primary button style */
  .modal-footer :global(button.primary) {
    background: var(--theme-accent, #3b82f6);
    border: none;
    color: white;
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-accent, #3b82f6) 30%, transparent);
  }

  .modal-footer :global(button.primary:hover) {
    background: color-mix(in srgb, var(--theme-accent, #3b82f6) 85%, white);
  }

  /* Secondary button style */
  .modal-footer :global(button.secondary) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .modal-footer :global(button.secondary:hover) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.15));
  }

  /* Ghost button style */
  .modal-footer :global(button.ghost) {
    background: transparent;
    border: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .modal-footer :global(button.ghost:hover) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  /* Danger button style */
  .modal-footer :global(button.danger) {
    background: var(--semantic-error, #ef4444);
    border: none;
    color: white;
  }

  .modal-footer :global(button.danger:hover) {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 85%, white);
  }

  /* Focus styles */
  .modal-footer :global(button:focus-visible) {
    outline: 2px solid var(--theme-accent, rgba(255, 255, 255, 0.9));
    outline-offset: 2px;
  }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .modal-footer {
      padding: 14px 16px;
      gap: 10px;
    }

    /* Stack buttons on very small screens if there are multiple */
    .modal-footer[data-align="between"] {
      flex-direction: column-reverse;
      gap: 8px;
    }

    .modal-footer[data-align="between"] > :global(*) {
      width: 100%;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .modal-footer :global(button) {
      transition: none;
    }
  }
</style>

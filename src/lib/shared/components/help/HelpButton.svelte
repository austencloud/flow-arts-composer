<!--
  HelpButton.svelte

  Reusable help button for panel headers.
  Consistent styling across the app - blue gradient, question mark icon.

  Usage:
  <HelpButton onclick={() => showHelp = true} />
-->
<script lang="ts">
  interface Props {
    onclick: () => void;
    ariaLabel?: string;
    title?: string;
    size?: "default" | "compact";
  }

  let {
    onclick,
    ariaLabel = "Help",
    title = "Help",
    size = "default",
  }: Props = $props();
</script>

<button
  class="help-button"
  class:compact={size === "compact"}
  {onclick}
  aria-label={ariaLabel}
  {title}
>
  <i class="fas fa-circle-question" aria-hidden="true"></i>
</button>

<style>
  .help-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.1rem;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
    border: 1px solid var(--semantic-info-border, rgba(59, 130, 246, 0.3));
    background: linear-gradient(
      135deg,
      var(--semantic-info, #3b82f6),
      color-mix(in srgb, var(--semantic-info, #3b82f6) 70%, black)
    );
    color: var(--theme-text-inverse, white);
  }

  .help-button:hover {
    background: linear-gradient(
      135deg,
      var(--semantic-info-text, #60a5fa),
      var(--semantic-info, #3b82f6)
    );
    transform: scale(1.05);
  }

  .help-button:active {
    transform: scale(0.95);
  }

  /* Compact size for tight headers */
  .help-button.compact {
    width: 36px;
    height: 36px;
    font-size: 0.95rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .help-button {
      transition: none;
    }

    .help-button:hover,
    .help-button:active {
      transform: none;
    }
  }
</style>

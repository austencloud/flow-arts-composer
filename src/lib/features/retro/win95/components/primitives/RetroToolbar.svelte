<!--
  RetroToolbar - Row of icon buttons with tooltips

  Renders a horizontal row of raised toolbar buttons. Each button can
  contain arbitrary HTML for its icon (pixel art SVG, font icon, etc.).
  Separators render as vertical dividers between button groups.
-->
<script lang="ts">
  import RetroTooltip from "./RetroTooltip.svelte";

  let {
    buttons,
  }: {
    buttons: {
      icon: string;
      tooltip: string;
      action: () => void;
      disabled?: boolean;
      separator?: boolean;
      saveShortcut?: boolean;
    }[];
  } = $props();
</script>

<div class="retro-toolbar" role="toolbar">
  {#each buttons as button, i (i)}
    {#if button.separator}
      <div class="retro-toolbar-separator" role="separator" aria-orientation="vertical"></div>
    {/if}
    <RetroTooltip text={button.tooltip}>
      {#snippet children()}
        <button
          data-save-shortcut={button.saveShortcut ? "" : undefined}
          class="retro-toolbar-button"
          type="button"
          aria-label={button.tooltip}
          disabled={button.disabled ?? false}
          onclick={button.action}
        >
          {@html button.icon}
        </button>
      {/snippet}
    </RetroTooltip>
  {/each}
</div>

<style>
  .retro-toolbar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: var(--retro-padding-sm, 2px);
    background: var(--retro-button-face, #c0c0c0);
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    user-select: none;
  }

  .retro-toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    padding: 3px;
    background: var(--retro-button-face, #c0c0c0);
    border: none;
    cursor: default;
    color: var(--retro-black, #000);
    image-rendering: pixelated;
  }

  .retro-toolbar-button :global(svg) {
    width: 16px;
    height: 16px;
    display: block;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  }

  .retro-toolbar-button:hover:not(:disabled) {
    border: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .retro-toolbar-button:hover:not(:disabled) {
    border-top-color: var(--retro-button-highlight, #fff);
    border-left-color: var(--retro-button-highlight, #fff);
    border-bottom-color: var(--retro-button-dark-shadow, #000);
    border-right-color: var(--retro-button-dark-shadow, #000);
  }

  .retro-toolbar-button:active:not(:disabled) {
    border: 1px solid var(--retro-button-highlight, #fff);
    padding: 2px 0 0 2px;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .retro-toolbar-button:active:not(:disabled) {
    border-top-color: var(--retro-button-dark-shadow, #000);
    border-left-color: var(--retro-button-dark-shadow, #000);
    border-bottom-color: var(--retro-button-highlight, #fff);
    border-right-color: var(--retro-button-highlight, #fff);
  }

  .retro-toolbar-button:disabled {
    color: var(--retro-disabled-text, #808080);
    cursor: default;
  }

  .retro-toolbar-button:focus-visible {
    outline: 1px dotted var(--retro-black, #000);
    outline-offset: -3px;
  }

  .retro-toolbar-separator {
    width: 2px;
    height: 18px;
    margin: 0 2px;
    border-left: 1px solid var(--retro-button-shadow, #808080);
    border-right: 1px solid var(--retro-button-highlight, #fff);
  }
</style>

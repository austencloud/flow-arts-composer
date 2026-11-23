<!--
  RetroDialog - Modal dialog window (alert, confirm, question)

  Renders a centered modal with an icon based on type (info, warning,
  error, question), a message, and a row of buttons. Built on top of
  RetroWindow chrome but without resize/minimize/maximize controls.

  The type determines the icon:
  - info:     blue circle with "i"
  - warning:  yellow triangle with "!"
  - error:    red circle with "X"
  - question: blue circle with "?"
-->
<script lang="ts">
  import type { RetroDialogConfig } from "../../domain/types/retro-types";

  let {
    config,
    onclose,
  }: {
    config: RetroDialogConfig;
    onclose: (button: string) => void;
  } = $props();

  const iconMap: Record<string, { symbol: string; color: string; bg: string }> = {
    info: { symbol: "i", color: "#fff", bg: "#000080" },
    warning: { symbol: "!", color: "#000", bg: "#ffff00" },
    error: { symbol: "X", color: "#fff", bg: "#ff0000" },
    question: { symbol: "?", color: "#fff", bg: "#000080" },
  };

  const iconData = $derived(iconMap[config.type] ?? iconMap.info!)

  function handleButton(label: string) {
    onclose(label);
  }

  function handleClose() {
    onclose(config.buttons[config.buttons.length - 1] ?? "Close");
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      handleClose();
    } else if (event.key === "Enter") {
      onclose(config.buttons[0] ?? "OK");
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="retro-dialog-overlay"
  onkeydown={handleKeydown}
  role="presentation"
>
  <div
    class="retro-dialog window"
    role="alertdialog"
    aria-modal="true"
    aria-label={config.title}
  >
    <!-- Title bar (no min/max controls) -->
    <div class="title-bar">
      <div class="title-bar-text">{config.title}</div>
      <div class="title-bar-controls">
        <button
          aria-label="Close"
          onclick={handleClose}
          type="button"
        ></button>
      </div>
    </div>

    <!-- Dialog body -->
    <div class="window-body retro-dialog-body">
      <div class="retro-dialog-content">
        <!-- Type icon -->
        <div
          class="retro-dialog-icon"
          style="background: {iconData.bg}; color: {iconData.color};"
          aria-hidden="true"
        >
          {iconData.symbol}
        </div>

        <!-- Message -->
        <p class="retro-dialog-message">{config.message}</p>
      </div>

      <!-- Button row -->
      <div class="retro-dialog-buttons">
        {#each config.buttons as label, i (label)}
          <button
            type="button"
            class:default={i === 0}
            onclick={() => handleButton(label)}
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  /* Overlay: dims background and centers the dialog                    */
  .retro-dialog-overlay {
    /* behind the status bar: a dim with a centred dialog that cannot reach the top */
    position: fixed;
    inset: 0;
    z-index: var(--retro-z-dialog, 100);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.25);
  }

  /* Dialog window                                                       */
  .retro-dialog {
    min-width: 280px;
    max-width: 420px;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    box-shadow: 4px 4px 0 var(--retro-black, #000);
  }

  .retro-dialog .title-bar {
    user-select: none;
  }

  /* Body layout                                                         */
  .retro-dialog-body {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .retro-dialog-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  /* Type icon                                                           */
  .retro-dialog-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 18px;
    font-family: "Times New Roman", serif;
    line-height: 1;
  }

  /* Message text                                                        */
  .retro-dialog-message {
    margin: 0;
    padding-top: 6px;
    color: var(--retro-black, #000);
    line-height: 1.4;
    word-wrap: break-word;
  }

  /* Button row                                                          */
  .retro-dialog-buttons {
    display: flex;
    justify-content: center;
    gap: 6px;
  }

  .retro-dialog-buttons button {
    min-width: 75px;
    min-height: 23px;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    padding: var(--retro-padding-sm, 2px) var(--retro-padding-lg, 8px);
  }

  .retro-dialog-buttons button.default {
    font-weight: bold;
  }
</style>

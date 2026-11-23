<!--
  RetroMobileWarning - VGA display requirement dialog for TKA-OS v1.0

  Shown on screens under 768px width. Full-screen teal background with
  a centered Win95-style dialog warning about minimum display requirements.
  User can dismiss with "Try Anyway" or navigate back to the main app.

  Domain: Retro Desktop Shell
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { RETRO_ICONS } from "../rendering/retro-icons";

  let {
    onproceed,
  }: {
    onproceed?: () => void;
  } = $props();

  function handleTryAnyway() {
    onproceed?.();
  }

  function handleReturn() {
    goto("/");
  }
</script>

<div class="mobile-warning" role="alertdialog" aria-label="Display requirements warning">
  <div class="warning-dialog">
    <!-- Title bar -->
    <div class="dialog-titlebar">
      <span class="dialog-titlebar-text">System Requirements</span>
    </div>

    <!-- Content area -->
    <div class="dialog-body">
      <div class="dialog-icon" aria-hidden="true">{@html RETRO_ICONS.warning}</div>
      <div class="dialog-message">
        <p class="dialog-title">TKA-OS v1.0</p>
        <p>This software requires a VGA display</p>
        <p>(minimum 640x480 resolution).</p>
        <p class="dialog-spacer">Your current display does not meet</p>
        <p>the minimum system requirements.</p>
        <p class="dialog-spacer">Please use a desktop computer or</p>
        <p>increase your browser window size.</p>
      </div>
    </div>

    <!-- Buttons -->
    <div class="dialog-buttons">
      <button class="retro-button" type="button" onclick={handleTryAnyway}>
        Try Anyway
      </button>
      <button class="retro-button" type="button" onclick={handleReturn}>
        Return to Flow Arts Composer
      </button>
    </div>
  </div>
</div>

<style>
  /* Full-screen teal background                                         */
  .mobile-warning {
    /* behind the status bar: a teal background with one centred message */
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: #008080;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  /* Win95 dialog panel                                                  */
  .warning-dialog {
    background: #c0c0c0;
    border: 2px solid;
    border-color: #ffffff #808080 #808080 #ffffff;
    box-shadow:
      inset 1px 1px 0 #dfdfdf,
      inset -1px -1px 0 #000000;
    max-width: 340px;
    width: 100%;
  }

  /* Title bar                                                           */
  .dialog-titlebar {
    background: linear-gradient(90deg, #000080, #1084d0);
    padding: 2px 4px;
    display: flex;
    align-items: center;
  }

  .dialog-titlebar-text {
    color: #ffffff;
    font-family: "Pixelated MS Sans Serif", "Microsoft Sans Serif", Arial, sans-serif;
    font-size: 11px;
    font-weight: bold;
    user-select: none;
  }

  /* Body content                                                        */
  .dialog-body {
    display: flex;
    gap: 12px;
    padding: 16px 16px 8px;
    align-items: flex-start;
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    image-rendering: pixelated;
  }

  .dialog-icon :global(svg) {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }

  .dialog-message {
    font-family: "Courier New", Courier, monospace;
    font-size: 12px;
    color: #000000;
    line-height: 1.5;
  }

  .dialog-message p {
    margin: 0;
  }

  .dialog-title {
    font-weight: bold;
    margin-bottom: 8px !important;
  }

  .dialog-spacer {
    margin-top: 8px !important;
  }

  /* Buttons                                                             */
  .dialog-buttons {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px 16px;
  }

  .retro-button {
    font-family: "Pixelated MS Sans Serif", "Microsoft Sans Serif", Arial, sans-serif;
    font-size: 11px;
    padding: 4px 16px;
    min-width: 100px;
    background: #c0c0c0;
    border: 2px solid;
    border-color: #ffffff #808080 #808080 #ffffff;
    box-shadow:
      inset 1px 1px 0 #dfdfdf,
      inset -1px -1px 0 #000000;
    color: #000000;
    cursor: pointer;
    outline: none;
  }

  .retro-button:hover {
    background: #d0d0d0;
  }

  .retro-button:active {
    border-color: #808080 #ffffff #ffffff #808080;
    box-shadow:
      inset 1px 1px 0 #000000,
      inset -1px -1px 0 #dfdfdf;
    padding: 5px 15px 3px 17px;
  }

  .retro-button:focus-visible {
    outline: 1px dotted #000000;
    outline-offset: -4px;
  }
</style>

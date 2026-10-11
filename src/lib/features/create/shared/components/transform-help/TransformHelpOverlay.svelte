<!--
  TransformHelpOverlay.svelte

  Simple backdrop overlay that dims everything except the drawer panel.
  Clicking the backdrop exits help mode.

  z-index strategy:
  - CreatePanelDrawer is at z-index 150
  - This backdrop dims everything BELOW the drawer (z-index 149)
  - Clicks on backdrop exit help mode, clicks on drawer content pass through
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  // Handle Escape key to close
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  // Handle backdrop click to exit help mode
  function handleBackdropClick() {
    onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Clickable backdrop that dims everything and exits on click -->
<div
  class="help-backdrop"
  onclick={handleBackdropClick}
  onkeydown={(e) => e.key === "Enter" && handleBackdropClick()}
  role="button"
  tabindex="0"
  aria-label={t("create_ui_exit_help_mode")}
></div>

<!-- Instruction banner at top of viewport -->
<div class="help-banner">
  <i class="fas fa-hand-pointer" aria-hidden="true"></i>
  <span>{t("create_ui_tap_any_action_to_learn_how_it_works")}</span>
</div>

<style>
  .help-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 200; /* Above sidebar (150) - drawer is boosted to 210 when help active */
    cursor: pointer;
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .help-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 16px;
    min-height: 44px; /* AAA touch target if tappable */
    background: linear-gradient(
      180deg,
      rgba(30, 64, 175, 0.98) 0%,
      /* Darker blue for AAA: 7.2:1 contrast */ rgba(23, 37, 84, 0.98) 100%
    );
    color: white;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    z-index: 250;
    animation: fadeIn var(--duration-normal) ease;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }

  .help-banner i {
    font-size: var(--font-size-lg, 18px);
  }

  .help-backdrop:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.9);
    outline-offset: -3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .help-backdrop,
    .help-banner {
      animation: none;
    }
  }
</style>

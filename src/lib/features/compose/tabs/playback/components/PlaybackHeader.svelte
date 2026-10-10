<!--
  PlaybackHeader.svelte

  Header bar for playback overlay with mode info, actions, and close button.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { ComposeMode } from "../../../shared/state/compose-module-state.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import ShareButton from "#lib/features/create/shared/workspace-panel/shared/components/buttons/ShareButton.svelte";

  let {
    currentMode,
    sequence = null,
    onSave,
    onClose,
  }: {
    currentMode: ComposeMode;
    /** The composition on screen. Shared as-is; null disables the control. */
    sequence?: SequenceData | null;
    onSave: () => void;
    onClose: () => void;
  } = $props();

  // Format mode name for display
  const modeLabel = $derived(() => {
    const labels: Record<ComposeMode, string> = {
      single: "Single",
      tunnel: "Tunnel",
      mirror: "Mirror",
      grid: "Grid",
      "side-by-side": "Side by Side",
    };
    return labels[currentMode] || "Single";
  });
</script>

<header class="playback-header">
  <div class="header-left">
    <div class="mode-indicator">
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      <span class="mode-label">{modeLabel()} Mode</span>
    </div>
  </div>

  <div class="header-center">
    <button
      data-save-shortcut
      class="action-btn save-btn"
      onclick={onSave}
      aria-label={t("compose_ui_save_composition")}
    >
      <i class="fas fa-save" aria-hidden="true"></i>
      <span class="btn-label">{t("browse_save")}</span>
    </button>

    <!-- The real thing, not a second one: ShareButton carries its own
         PostShareSheet, so this overlay reaches Instagram and Facebook through
         the same sheet as the viewer and the Create workspace. It replaced a
         local button wired to an empty handler. -->
    <ShareButton {sequence} />
  </div>

  <div class="header-right">
    <button
      class="close-btn"
      onclick={onClose}
      aria-label={t("compose_ui_close_playback")}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>
</header>

<style>
  .playback-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.25rem;
    background: var(--theme-panel-bg);
    border-bottom: 1px solid var(--theme-stroke);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .header-left,
  .header-center,
  .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-left {
    flex: 1;
    justify-content: flex-start;
  }

  .header-center {
    flex: 0 0 auto;
    justify-content: center;
  }

  .header-right {
    flex: 1;
    justify-content: flex-end;
  }

  /* Mode indicator (non-interactive) */
  .mode-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: 0.85rem;
  }

  .mode-indicator i {
    color: color-mix(in srgb, var(--accent-pink, #ec4899) 80%, transparent);
  }

  .mode-label {
    font-weight: 500;
  }

  /* Action buttons */
  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: 1px solid transparent;
  }

  .save-btn {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .save-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 50%,
      transparent
    );
    color: var(--theme-accent, #c4b5fd);
  }

  .action-btn:active {
    transform: scale(0.98);
  }

  /* Close button */
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 10px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    font-size: 1.1rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    color: var(--semantic-error, #fca5a5);
  }

  .close-btn:active {
    transform: scale(0.95);
  }

  /* Mobile - compact layout */
  @media (max-width: 768px) {
    .playback-header {
      padding: 0.625rem 0.875rem;
    }

    .mode-indicator {
      padding: 0.375rem 0.625rem;
      font-size: 0.75rem;
    }

    .action-btn {
      padding: 0.375rem 0.625rem;
      font-size: 0.75rem;
    }

    .btn-label {
      display: none;
    }

    .action-btn {
      width: var(--min-touch-target); /* WCAG AAA touch target */
      height: var(--min-touch-target);
      justify-content: center;
      padding: 0;
    }

    .close-btn {
      width: var(--min-touch-target); /* WCAG AAA touch target */
      height: var(--min-touch-target);
      font-size: 1rem;
    }
  }

  /* Extra small mobile */
  @media (max-width: 480px) {
    .mode-label {
      display: none;
    }

    .mode-indicator {
      width: 36px;
      height: 36px;
      justify-content: center;
      padding: 0;
    }
  }
</style>
